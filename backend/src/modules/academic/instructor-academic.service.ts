import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '../../common/auth-user.js';
import { CompanyScopeService, STUDENT_NOT_FOUND } from '../../authz/company-scope.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AcademicData, type Db, invalid, rule } from './academic.data.js';
import { CourseCoverStorage, detectCover, type UploadedCover } from './course-cover.storage.js';
import { LEVEL_PENDING, levelToColumn, type CourseLevelValue } from './course-levels.js';
import { LiveSessionsService } from './live-sessions.service.js';
import {
  type AttemptRow,
  type CertificateRow,
  type CourseRow,
  type EnrollmentRow,
  type ExamRow,
  type QuestionRow,
  type VideoRow,
  sourceColumns,
  toAttempt,
  limaDate,
  toCertificate,
  toCourseRecord,
  toEnrollment,
  toExam,
  toExamQuestion,
  toGradable,
  ruleOf,
  videoSource,
} from './academic.mappers.js';
import {
  DEFAULT_EXAM,
  EXAM_LOCKED_MESSAGE,
  MAX_ATTEMPTS,
  MAX_DURATION_SEC,
  MAX_OPTIONS,
  MIN_VIDEOS,
  VIDEO_SOURCE_REQUIRED,
  MODULE_DESCRIPTION_MAX,
  MODULE_TITLE_MAX,
  grade,
  isDriveHost,
  managedCoverOf,
  normalizeCover,
  scoreDistribution,
  selectionError,
  sourceFromUrl,
  sourceMismatch,
  sourceUrl,
} from './academic.rules.js';
import type {
  CourseInputDto,
  CoursePatchDto,
  EnrollDto,
  ExamConfigDto,
  ModuleInputDto,
  OpenGradeDto,
  QuestionDto,
  VideoInputDto,
} from './academic.dto.js';

const COVER_NOT_OWNED = 'La imagen de portada no corresponde a este curso. Súbela con la opción «Imagen desde el equipo».';

/**
 * Módulo académico, operaciones del INSTRUCTOR (18/11/2026). Reglas portadas de la demostración
 * (mock-data-repository.ts) con persistencia real en MySQL. Cada Instructor trabaja solo con SUS cursos
 * (`courses.created_by`) y SUS estudiantes (`students.registered_by`); lo ajeno responde 404.
 */

/** Filtros de los certificados del Instructor (CertificateQueryDto). */
export interface CertificateFilter {
  userId?: string;
  courseId?: string;
  student?: string;
  code?: string;
  companyId?: string;
  from?: string;
  to?: string;
}

/** Minúsculas y sin tildes, para buscar nombres sin distinguir mayúsculas ni acentos. */
const foldText = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

@Injectable()
export class InstructorAcademicService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly data: AcademicData,
    private readonly scope: CompanyScopeService,
    private readonly covers: CourseCoverStorage,
  ) {}

  private tx<T>(work: (db: Db) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(work);
  }

  // ===================== Cursos =====================

  async listCourses(actor: AuthUser, level?: CourseLevelValue | typeof LEVEL_PENDING) {
    const byLevel = !level ? {} : { level: level === LEVEL_PENDING ? null : levelToColumn(level) };
    const rows = (await this.prisma.course.findMany({ where: { createdById: actor.id, ...byLevel } })) as CourseRow[];
    return rows.sort((a, b) => a.name.localeCompare(b.name, 'es')).map(toCourseRecord);
  }

  private courseInputError(input: CourseInputDto): string {
    if (!input.name?.trim()) return 'Ingresa el nombre del curso.';
    if (!input.description?.trim()) return 'Ingresa la descripción del curso.';
    if (input.trainingHours != null && !(input.trainingHours >= 1)) return 'Las horas de formación deben ser al menos 1.';
    if (normalizeCover(input.coverImage) === undefined) {
      return 'La portada debe ser una dirección https (máximo 500 caracteres), una portada de demostración o una imagen subida.';
    }
    return '';
  }

  /** Crea el curso en borrador con un módulo inicial y su examen activo sin preguntas (como la demostración). */
  async createCourse(actor: AuthUser, input: CourseInputDto) {
    const error = this.courseInputError(input);
    if (error) throw invalid(error);
    // Portadas subidas: el curso se crea primero y la imagen se sube después (PUT /courses/:id/cover).
    if (managedCoverOf(normalizeCover(input.coverImage))) throw invalid(COVER_NOT_OWNED);
    return this.tx(async (db) => {
      const course = (await db.course.create({
        data: {
          name: input.name.trim(),
          description: input.description.trim(),
          status: 'BORRADOR',
          trainingHours: input.trainingHours ?? null,
          level: levelToColumn(input.level),
          coverImage: normalizeCover(input.coverImage) ?? null,
          createdById: actor.id,
        },
      })) as CourseRow;
      await db.courseModule.create({ data: { courseId: course.id, position: 1, title: 'Contenido del curso' } });
      await db.exam.create({ data: { courseId: course.id, title: 'Examen del curso', active: true, kind: 'REGULAR', ...DEFAULT_EXAM } });
      return toCourseRecord(course);
    });
  }

  /** Edita y publica o despublica. Publicar exige RN-03 y examen activo con preguntas que sumen la escala. */
  async updateCourse(actor: AuthUser, courseId: string, patch: CoursePatchDto) {
    const error = this.courseInputError(patch);
    if (error) throw invalid(error);
    const cover = normalizeCover(patch.coverImage) ?? null;
    let previousCover: string | null = null;
    const record = await this.tx(async (db) => {
      const course = await this.data.ownedCourse(db, actor, courseId);
      previousCover = course.coverImage;
      // Una portada subida solo se conserva en SU curso: no se puede apuntar a la imagen de otro curso.
      if (managedCoverOf(cover) && cover !== course.coverImage) throw invalid(COVER_NOT_OWNED);
      if (patch.status === 'publicado') {
        if ((await this.data.publishedVideos(db, courseId)).length < MIN_VIDEOS) {
          throw rule('Para publicar el curso necesitas al menos 1 video publicado.');
        }
        const { blocking } = await this.data.publicationCheck(db, course);
        if (blocking.length) throw rule(`No se puede publicar el curso: ${blocking.join(' ')}`);
      }
      const updated = (await db.course.update({
        where: { id: courseId },
        data: {
          name: patch.name.trim(),
          description: patch.description.trim(),
          status: patch.status === 'publicado' ? 'PUBLICADO' : 'BORRADOR',
          trainingHours: patch.trainingHours ?? null,
          // Omitido: se conserva (publicar o despublicar no toca el nivel). null: vuelve a «pendiente de clasificación».
          ...(patch.level !== undefined ? { level: levelToColumn(patch.level) } : {}),
          coverImage: cover,
        },
      })) as CourseRow;
      await this.data.recompute(db, updated);
      return toCourseRecord(updated);
    });
    // Solo después de guardar: si la portada subida anterior ya no se usa, se borra su archivo.
    if (previousCover !== cover) await this.covers.remove(previousCover);
    return record;
  }

  /**
   * Sube o reemplaza la portada del curso (19/11/2026). La imagen se valida por su firma binaria (JPG, PNG o WebP,
   * máximo 2 MB), se guarda en disco con un nombre aleatorio y en MySQL queda solo su ruta. El archivo anterior se
   * borra únicamente cuando el curso ya quedó guardado con la nueva portada.
   */
  async uploadCover(actor: AuthUser, courseId: string, file: UploadedCover | undefined) {
    const course = await this.data.ownedCourse(this.prisma, actor, courseId);
    const ext = detectCover(file);
    const url = await this.covers.save(file!.buffer, ext);
    let updated: CourseRow;
    try {
      updated = (await this.prisma.course.update({ where: { id: courseId }, data: { coverImage: url } })) as CourseRow;
    } catch (error) {
      await this.covers.remove(url);
      throw error;
    }
    if (course.coverImage !== url) await this.covers.remove(course.coverImage);
    return toCourseRecord(updated);
  }

  /** Activa o desactiva: un curso desactivado no admite matrículas nuevas ni se muestra a los estudiantes. */
  async setCourseActive(actor: AuthUser, courseId: string, active: boolean) {
    return this.tx(async (db) => {
      await this.data.ownedCourse(db, actor, courseId);
      const updated = (await db.course.update({ where: { id: courseId }, data: { active } })) as CourseRow;
      await this.data.recompute(db, updated);
      return toCourseRecord(updated);
    });
  }

  async courseContent(actor: AuthUser, courseId: string) {
    const course = await this.data.ownedCourse(this.prisma, actor, courseId);
    return this.data.content(this.prisma, course, false);
  }

  async publicationCheck(actor: AuthUser, courseId: string) {
    const course = await this.data.ownedCourse(this.prisma, actor, courseId);
    const { canPublish, blocking, warnings } = await this.data.publicationCheck(this.prisma, course);
    return { canPublish, blocking, warnings };
  }

  // ===================== Módulos =====================

  async saveModule(actor: AuthUser, courseId: string, input: ModuleInputDto) {
    const title = input.title?.trim() ?? '';
    const description = input.description?.trim() ?? '';
    if (!title) throw invalid('Ingresa el nombre del módulo.');
    if (title.length > MODULE_TITLE_MAX) throw invalid(`El nombre del módulo admite como máximo ${MODULE_TITLE_MAX} caracteres.`);
    if (description.length > MODULE_DESCRIPTION_MAX) {
      throw invalid(`La descripción del módulo admite como máximo ${MODULE_DESCRIPTION_MAX} caracteres.`);
    }
    return this.tx(async (db) => {
      const course = await this.data.ownedCourse(db, actor, courseId);
      const modules = await this.data.modules(db, courseId);
      if (input.id) {
        if (!modules.some((m) => m.id === input.id)) throw new NotFoundException('No se encontró el módulo.');
        await db.courseModule.update({ where: { id: input.id }, data: { title, description: description || null } });
      } else {
        await db.courseModule.create({ data: { courseId, position: modules.length + 1, title, description: description || null } });
      }
      return this.data.content(db, course, false);
    });
  }

  async moveModule(actor: AuthUser, courseId: string, moduleId: string, delta: -1 | 1) {
    return this.tx(async (db) => {
      const course = await this.data.ownedCourse(db, actor, courseId);
      const modules = await this.data.modules(db, courseId);
      const i = modules.findIndex((m) => m.id === moduleId);
      if (i < 0) throw new NotFoundException('No se encontró el módulo.');
      const j = i + delta;
      if (j >= 0 && j < modules.length) {
        [modules[i], modules[j]] = [modules[j], modules[i]];
        for (const [idx, m] of modules.entries()) await db.courseModule.update({ where: { id: m.id }, data: { position: idx + 1 } });
      }
      return this.data.content(db, course, false);
    });
  }

  /** Nunca borra videos: si el módulo tiene videos, pasan al final del módulo de destino (obligatorio). */
  async deleteModule(actor: AuthUser, courseId: string, moduleId: string, targetModuleId?: string) {
    return this.tx(async (db) => {
      const course = await this.data.ownedCourse(db, actor, courseId);
      const modules = await this.data.modules(db, courseId);
      if (!modules.some((m) => m.id === moduleId)) throw new NotFoundException('No se encontró el módulo.');
      if (modules.length === 1) throw rule('El curso debe tener al menos un módulo.');
      const videos = (await this.data.videos(db, courseId, modules)).filter((v) => v.moduleId === moduleId);
      if (videos.length) {
        if (!targetModuleId) throw rule('Elige a qué módulo pasan los videos de este módulo antes de eliminarlo.');
        if (targetModuleId === moduleId || !modules.some((m) => m.id === targetModuleId)) {
          throw new NotFoundException('No se encontró el módulo de destino.');
        }
        const target = (await db.courseVideo.findMany({ where: { moduleId: targetModuleId } })) as VideoRow[];
        let next = Math.max(0, ...target.map((v) => v.position));
        for (const v of videos) await db.courseVideo.update({ where: { id: v.id }, data: { moduleId: targetModuleId, position: ++next } });
      }
      // 20/11/2026: sus clases en vivo pasan al módulo de destino o quedan sin módulo (nunca se borran).
      const target = targetModuleId && targetModuleId !== moduleId && modules.some((m) => m.id === targetModuleId) ? targetModuleId : null;
      await LiveSessionsService.detachModule(db, moduleId, target);
      await db.courseModule.delete({ where: { id: moduleId } });
      for (const [idx, m] of modules.filter((x) => x.id !== moduleId).entries()) {
        await db.courseModule.update({ where: { id: m.id }, data: { position: idx + 1 } });
      }
      return this.data.content(db, course, false);
    });
  }

  // ===================== Videos =====================

  /**
   * Si el curso está publicado, el cambio no puede romper la regla de acceso de RN-03: el curso mantiene al menos 1
   * videos publicados en total. El mínimo POR MÓDULO se exige al publicar desde borrador (19/11/2026), para no
   * bloquear de forma retroactiva los cursos ya publicados. La duración no se limita (20/11/2026).
   */
  private async publishedCourseGuard(db: Db, course: CourseRow, videoId: string | null, published: boolean) {
    if (course.status !== 'PUBLICADO') return;
    const others = (await this.data.publishedVideos(db, course.id)).filter((v) => v.id !== videoId).length;
    if (others + (published ? 1 : 0) < MIN_VIDEOS) throw rule('El curso necesita al menos 1 video publicado.');
  }

  /** Renumera los videos de cada módulo según su posición. */
  private async renumber(db: Db, videos: VideoRow[]) {
    const counters = new Map<string, number>();
    for (const v of videos) {
      const n = (counters.get(v.moduleId) ?? 0) + 1;
      counters.set(v.moduleId, n);
      if (v.position !== n) await db.courseVideo.update({ where: { id: v.id }, data: { position: n } });
    }
  }

  async saveVideo(actor: AuthUser, courseId: string, input: VideoInputDto) {
    const title = input.title?.trim() ?? '';
    if (!title) throw invalid('Ingresa el título del video.');
    if (!Number.isInteger(input.durationSec) || input.durationSec < 1 || input.durationSec > MAX_DURATION_SEC) {
      throw invalid('Ingresa la duración real del video en segundos (número entero mayor que 0).');
    }
    const material = input.materialUrl?.trim() || null;
    if (material && !/^https:\/\/\S+$/i.test(material)) throw invalid('El material complementario debe ser un enlace https.');
    return this.tx(async (db) => {
      const course = await this.data.ownedCourse(db, actor, courseId);
      const modules = await this.data.modules(db, courseId);
      const videos = await this.data.videos(db, courseId, modules);
      const video = input.id ? videos.find((v) => v.id === input.id) : undefined;
      if (input.id && !video) throw new NotFoundException('No se encontró el video.');
      // 19/11/2026: sin máximo de videos por curso ni por módulo (RN-03 exige un mínimo por módulo al publicar).

      const url = input.url?.trim() ?? '';
      const source = video && url === (sourceUrl(videoSource(video)) ?? '') ? videoSource(video) : sourceFromUrl(url);
      if (!source) {
        throw invalid(
          isDriveHost(url)
            ? 'El enlace de Google Drive no corresponde a un archivo. Usa el enlace para compartir del video (drive.google.com/file/d/…).'
            : 'El enlace del video no es válido. Usa un enlace de YouTube, de Google Drive u otro enlace https.',
        );
      }
      // 21/11/2026: sin la opción «Sin archivo». Un video nuevo (o uno que ya tenía fuente) necesita un enlace; un video
      // existente sin fuente se conserva tal cual mientras no se le agregue uno (no se modifica nada automáticamente).
      if (source.kind === 'placeholder' && !(video && videoSource(video).kind === 'placeholder')) throw invalid(VIDEO_SOURCE_REQUIRED);
      const mismatch = input.sourceKind ? sourceMismatch(input.sourceKind, source) : '';
      if (mismatch) throw invalid(mismatch);

      let moduleId = video?.moduleId ?? modules[0]?.id;
      if (input.moduleId) {
        if (!modules.some((m) => m.id === input.moduleId)) throw new NotFoundException('No se encontró el módulo.');
        moduleId = input.moduleId;
      }
      if (!moduleId) {
        moduleId = ((await db.courseModule.create({ data: { courseId, position: 1, title: 'Contenido del curso' } })) as { id: string }).id;
      }
      await this.publishedCourseGuard(db, course, video?.id ?? null, input.published);

      const data = {
        title,
        description: input.description?.trim() || null,
        durationSec: input.durationSec,
        published: input.published,
        ...sourceColumns(source),
        materialUrl: material,
      };
      const nextOrder = () => Math.max(0, ...videos.filter((v) => v.moduleId === moduleId && v.id !== video?.id).map((v) => v.position)) + 1;
      if (video && video.moduleId !== moduleId) {
        await db.courseVideo.update({ where: { id: video.id }, data: { ...data, moduleId, position: nextOrder() } });
        await this.renumber(db, await this.data.videos(db, courseId));
      } else if (video) {
        await db.courseVideo.update({ where: { id: video.id }, data });
      } else {
        await db.courseVideo.create({ data: { ...data, courseId, moduleId, position: nextOrder() } });
      }
      await this.data.recompute(db, course);
      return this.data.content(db, course, false);
    });
  }

  /** Reordena dentro de un mismo módulo; fuera de los límites no hace nada. */
  async moveVideo(actor: AuthUser, courseId: string, videoId: string, delta: -1 | 1) {
    return this.tx(async (db) => {
      const course = await this.data.ownedCourse(db, actor, courseId);
      const videos = await this.data.videos(db, courseId);
      const i = videos.findIndex((v) => v.id === videoId);
      if (i < 0) throw new NotFoundException('No se encontró el video.');
      const j = i + delta;
      if (j >= 0 && j < videos.length && videos[i].moduleId === videos[j].moduleId) {
        [videos[i], videos[j]] = [videos[j], videos[i]];
        await this.renumber(db, videos.map((v) => ({ ...v, position: -1 })));
      }
      return this.data.content(db, course, false);
    });
  }

  async setVideoPublished(actor: AuthUser, courseId: string, videoId: string, published: boolean) {
    return this.tx(async (db) => {
      const course = await this.data.ownedCourse(db, actor, courseId);
      const video = (await this.data.videos(db, courseId)).find((v) => v.id === videoId);
      if (!video) throw new NotFoundException('No se encontró el video.');
      await this.publishedCourseGuard(db, course, video.id, published);
      await db.courseVideo.update({ where: { id: videoId }, data: { published } });
      await this.data.recompute(db, course);
      return this.data.content(db, course, false);
    });
  }

  /** Elimina el video y su progreso (la FK borra `video_progress`); intentos y certificados no cambian. */
  async deleteVideo(actor: AuthUser, courseId: string, videoId: string) {
    return this.tx(async (db) => {
      const course = await this.data.ownedCourse(db, actor, courseId);
      const videos = await this.data.videos(db, courseId);
      const video = videos.find((v) => v.id === videoId);
      if (!video) throw new NotFoundException('No se encontró el video.');
      await this.publishedCourseGuard(db, course, video.id, false);
      await db.videoProgress.deleteMany({ where: { videoId } });
      await db.courseVideo.delete({ where: { id: videoId } });
      await this.renumber(db, videos.filter((v) => v.id !== videoId));
      await this.data.recompute(db, course);
      return this.data.content(db, course, false);
    });
  }

  async assignVideoToModule(actor: AuthUser, courseId: string, videoId: string, moduleId: string) {
    return this.tx(async (db) => {
      const course = await this.data.ownedCourse(db, actor, courseId);
      const modules = await this.data.modules(db, courseId);
      const videos = await this.data.videos(db, courseId, modules);
      const video = videos.find((v) => v.id === videoId);
      if (!video) throw new NotFoundException('No se encontró el video.');
      if (!modules.some((m) => m.id === moduleId)) throw new NotFoundException('No se encontró el módulo.');
      if (video.moduleId !== moduleId) {
        const next = Math.max(0, ...videos.filter((v) => v.moduleId === moduleId).map((v) => v.position)) + 1;
        await db.courseVideo.update({ where: { id: videoId }, data: { moduleId, position: next } });
        await this.renumber(db, await this.data.videos(db, courseId));
      }
      return this.data.content(db, course, false);
    });
  }

  // ===================== Evaluaciones =====================

  async listExams(actor: AuthUser, courseId: string) {
    await this.data.ownedCourse(this.prisma, actor, courseId);
    return ((await this.prisma.exam.findMany({ where: { courseId } })) as ExamRow[]).map(toExam);
  }

  async activeExam(actor: AuthUser, courseId: string) {
    await this.data.ownedCourse(this.prisma, actor, courseId);
    const exam = await this.data.activeExam(this.prisma, courseId);
    return exam ? toExam(exam) : null;
  }

  /** Crea la evaluación de un curso sin evaluación activa (un examen activo por curso, D1). */
  async createExam(actor: AuthUser, courseId: string) {
    return this.tx(async (db) => {
      const course = await this.data.ownedCourse(db, actor, courseId);
      if (await this.data.activeExam(db, courseId)) throw rule('El curso ya tiene una evaluación activa.');
      const exam = (await db.exam.create({
        data: { courseId, title: 'Examen del curso', active: true, kind: 'REGULAR', ...DEFAULT_EXAM },
      })) as ExamRow;
      await this.data.recompute(db, course);
      return toExam(exam);
    });
  }

  /** Etapa 2A: con el curso publicado, un cambio no puede dejar la suma de puntajes distinta de la escala. */
  private scoreGuard(course: CourseRow, exam: ExamRow, after: readonly { points: number }[], scaleMax = exam.scaleMax): void {
    const live = exam.active && course.status === 'PUBLICADO';
    if (!live) return;
    const distribution = scoreDistribution(after, scaleMax);
    if (!distribution.valid) {
      throw rule(
        `No se puede guardar este cambio con el curso publicado. ${distribution.message} Para reorganizar los puntajes, pasa el curso a borrador.`,
      );
    }
  }

  async updateExamConfig(actor: AuthUser, examId: string, config: ExamConfigDto) {
    return this.tx(async (db) => {
      const { exam, course } = await this.data.ownedExam(db, actor, examId);
      if (exam.kind === 'RECUPERACION') {
        throw rule('La configuración de un examen de recuperación se hereda del examen original y no se puede modificar.');
      }
      if (await this.data.examLocked(db, examId)) throw rule(EXAM_LOCKED_MESSAGE);
      if (!Number.isInteger(config.timeMinutes) || config.timeMinutes < 1 || config.timeMinutes > 240) {
        throw invalid('El tiempo debe estar entre 1 y 240 minutos.');
      }
      if (config.scaleMax !== 20 && config.scaleMax !== 100) throw invalid('La escala de nota debe ser 20 o 100.');
      if (!(config.passScore >= 0 && config.passScore <= config.scaleMax)) {
        throw invalid(`La nota mínima debe estar entre 0 y ${config.scaleMax}.`);
      }
      if (config.maxAttempts !== MAX_ATTEMPTS) throw invalid('Cada alumno tiene un solo intento por examen: los intentos permitidos deben ser 1.');
      let availableFrom: Date | null | undefined;
      if (config.availableFrom !== undefined) {
        availableFrom = config.availableFrom ? new Date(config.availableFrom) : null;
        if (availableFrom && Number.isNaN(availableFrom.getTime())) throw invalid('La fecha de disponibilidad no es válida.');
      }
      this.scoreGuard(course, exam, (await this.data.questions(db, examId)).map(toGradable), config.scaleMax);
      const updated = (await db.exam.update({
        where: { id: examId },
        data: {
          timeMinutes: config.timeMinutes,
          passScore: config.passScore,
          scaleMax: config.scaleMax,
          ...(availableFrom !== undefined ? { availableFrom } : {}),
        },
      })) as ExamRow;
      return toExam(updated);
    });
  }

  async examQuestions(actor: AuthUser, examId: string) {
    await this.data.ownedExam(this.prisma, actor, examId);
    return (await this.data.questions(this.prisma, examId)).map(toExamQuestion);
  }

  /** RN-12: respuesta correcta y puntaje. Crea (id nuevo) o edita (id existente) la pregunta. */
  async saveQuestion(actor: AuthUser, examId: string, question: QuestionDto) {
    return this.tx(async (db) => {
      const { exam, course } = await this.data.ownedExam(db, actor, examId);
      if (await this.data.examLocked(db, examId)) throw rule(EXAM_LOCKED_MESSAGE);
      const text = question.text.trim();
      if (!text) throw invalid('Escribe el enunciado de la pregunta.');
      if (!(question.points > 0)) throw invalid(question.type === 'open' ? 'El puntaje máximo debe ser mayor que 0.' : 'El puntaje debe ser mayor que 0.');
      if (!Number.isInteger(question.points * 2)) throw invalid('El puntaje admite enteros o medios puntos.');
      let options: { id: string; text: string }[] = [];
      let correct: string[] = [];
      let selectCount: number | null = null;
      let rubric: string | null = null;
      if (question.type === 'open') {
        rubric = question.rubric?.trim() || null;
        if (rubric && rubric.length > 1000) throw invalid('El criterio de calificación admite como máximo 1000 caracteres.');
      } else {
        options = question.options.map((o) => ({ id: o.id, text: o.text.trim() }));
        if (options.length < 2 || options.some((o) => !o.text)) throw invalid('Completa el texto de todas las opciones (mínimo 2).');
        if (options.length > MAX_OPTIONS) throw invalid(`Una pregunta admite como máximo ${MAX_OPTIONS} opciones.`);
        if (new Set(options.map((o) => o.id)).size !== options.length) throw invalid('Las opciones deben tener identificadores distintos.');
        const ids = new Set(options.map((o) => o.id));
        correct = question.correct.filter((id) => ids.has(id));
        if (correct.length === 0) throw invalid('Marca la respuesta correcta.');
        if (question.type !== 'multiple' && correct.length !== 1) throw invalid('Esta pregunta debe tener una sola respuesta correcta.');
        if (question.type === 'multiple') selectCount = question.selectCount ?? correct.length;
        const selection = selectionError({ type: question.type, options, correct, ...(selectCount != null ? { selectCount } : {}) });
        if (selection) throw invalid(selection);
      }
      const current = await this.data.questions(db, examId);
      const existing = current.find((q) => q.id === question.id);
      const after = existing ? current.map((q) => (q.id === question.id ? { points: question.points } : q)) : [...current, { points: question.points }];
      this.scoreGuard(course, exam, after);
      const data = { type: question.type.toUpperCase() as QuestionRow['type'], text, options, correct, points: question.points, selectCount, rubric };
      if (existing) await db.examQuestion.update({ where: { id: existing.id }, data });
      else await db.examQuestion.create({ data: { ...data, examId, position: Math.max(0, ...current.map((q) => q.position)) + 1 } });
      await this.data.recompute(db, course);
      return (await this.data.questions(db, examId)).map(toExamQuestion);
    });
  }

  async deleteQuestion(actor: AuthUser, examId: string, questionId: string) {
    return this.tx(async (db) => {
      const { exam, course } = await this.data.ownedExam(db, actor, examId);
      const current = await this.data.questions(db, examId);
      if (!current.some((q) => q.id === questionId)) throw new NotFoundException('No se encontró la pregunta.');
      if (await this.data.examLocked(db, examId)) throw rule(EXAM_LOCKED_MESSAGE);
      const live = exam.active && course.status === 'PUBLICADO';
      if (live && current.length <= 1) throw rule('El examen necesita al menos una pregunta.');
      this.scoreGuard(course, exam, current.filter((q) => q.id !== questionId));
      await db.examQuestion.delete({ where: { id: questionId } });
      await this.data.recompute(db, course);
      return (await this.data.questions(db, examId)).map(toExamQuestion);
    });
  }

  // ===================== Matrículas (asignación de cursos) =====================

  private async ownCourseIds(actor: AuthUser): Promise<string[]> {
    return ((await this.prisma.course.findMany({ where: { createdById: actor.id }, select: { id: true } })) as { id: string }[]).map((c) => c.id);
  }

  async listEnrollments(actor: AuthUser, filter: { userId?: string; courseId?: string }) {
    const courseIds = await this.ownCourseIds(actor);
    const rows = ((await this.prisma.enrollment.findMany({ where: { courseId: { in: courseIds } } })) as EnrollmentRow[]).filter(
      (e) => (!filter.userId || e.studentId === filter.userId) && (!filter.courseId || e.courseId === filter.courseId),
    );
    const visible: EnrollmentRow[] = [];
    for (const e of rows) if (await this.scope.canAccessStudent(actor, e.studentId)) visible.push(e);
    return Promise.all(visible.map(async (e) => toEnrollment(e, await this.data.completedIds(this.prisma, e.id))));
  }

  /** Asigna un curso propio (activo) a un estudiante propio. */
  async enroll(actor: AuthUser, input: EnrollDto) {
    await this.scope.assertStudentInScope(actor, input.studentId);
    return this.tx(async (db) => {
      const course = await this.data.ownedCourse(db, actor, input.courseId);
      if (!course.active) throw rule('El curso está desactivado: no admite nuevas asignaciones.');
      if (await db.enrollment.findFirst({ where: { studentId: input.studentId, courseId: input.courseId } })) {
        throw rule('El participante ya tiene este curso asignado.');
      }
      const created = (await db.enrollment.create({
        data: { studentId: input.studentId, courseId: input.courseId, assignedById: actor.id, status: 'PENDIENTE' },
      })) as EnrollmentRow;
      await db.auditLog.create({
        data: { action: 'ENROLLMENT_CREATED', actorId: actor.id, entity: 'student', entityId: input.studentId, data: { courseId: input.courseId } },
      });
      return toEnrollment(created, []);
    });
  }

  /** Retira un curso solo si el participante no tiene avance, intentos ni certificados en él. */
  async unenroll(actor: AuthUser, studentId: string, courseId: string) {
    await this.scope.assertStudentInScope(actor, studentId);
    return this.tx(async (db) => {
      await this.data.ownedCourse(db, actor, courseId);
      const enrollment = (await db.enrollment.findFirst({ where: { studentId, courseId } })) as EnrollmentRow | null;
      if (!enrollment) throw new NotFoundException('El participante no tiene este curso asignado.');
      const activity =
        (await db.videoProgress.count({ where: { enrollmentId: enrollment.id } })) > 0 ||
        !!enrollment.startedAt ||
        enrollment.status !== 'PENDIENTE' ||
        (await db.examAttempt.count({ where: { studentId, courseId } })) > 0 ||
        (await db.certificate.count({ where: { studentId, courseId } })) > 0;
      if (activity) throw rule('No se puede retirar el curso: el participante ya tiene avance, intentos o certificados en él.');
      await db.enrollment.delete({ where: { id: enrollment.id } });
      await db.auditLog.create({ data: { action: 'ENROLLMENT_REMOVED', actorId: actor.id, entity: 'student', entityId: studentId, data: { courseId } } });
      const rest = (await db.enrollment.findMany({ where: { studentId } })) as EnrollmentRow[];
      return Promise.all(rest.map(async (e) => toEnrollment(e, await this.data.completedIds(db, e.id))));
    });
  }

  // ===================== Resultados y certificados =====================

  async listAttempts(actor: AuthUser, filter: { userId?: string; courseId?: string; examId?: string }) {
    const courseIds = await this.ownCourseIds(actor);
    const rows = ((await this.prisma.examAttempt.findMany({ where: { courseId: { in: courseIds } } })) as AttemptRow[]).filter(
      (a) =>
        (!filter.userId || a.studentId === filter.userId) &&
        (!filter.courseId || a.courseId === filter.courseId) &&
        (!filter.examId || a.examId === filter.examId),
    );
    return rows.sort((a, b) => a.submittedAt.getTime() - b.submittedAt.getTime()).map(toAttempt);
  }

  /**
   * Certificados emitidos (filtros, 20/11/2026). Alcance: cursos propios Y participantes registrados por el Instructor
   * (`students.registered_by`). La empresa solo filtra dentro de ese alcance: compartir empresa con otro Instructor no da
   * acceso a sus participantes. Consultas fijas (sin N+1): estudiantes propios, sus empresas, certificados y nombres de
   * empresas. Nombre: cada palabra debe aparecer (parcial, sin mayúsculas ni tildes). Código: parcial. Fechas en Lima.
   */
  async listCertificates(actor: AuthUser, filter: CertificateFilter = {}) {
    const courseIds = await this.ownCourseIds(actor);
    if (filter.courseId && !courseIds.includes(filter.courseId)) return [];
    const own = (await this.prisma.student.findMany({ where: { registeredById: actor.id }, select: { userId: true } })) as { userId: string }[];
    let studentIds = own.map((s) => s.userId).filter((id) => !filter.userId || id === filter.userId);
    if (!courseIds.length || !studentIds.length) return [];
    const links = (await this.prisma.studentCompany.findMany({
      where: { studentId: { in: studentIds } },
      select: { studentId: true, companyId: true },
    })) as { studentId: string; companyId: string }[];
    if (filter.companyId) {
      const inCompany = new Set(links.filter((l) => l.companyId === filter.companyId).map((l) => l.studentId));
      studentIds = studentIds.filter((id) => inCompany.has(id));
      if (!studentIds.length) return [];
    }
    const rows = (await this.prisma.certificate.findMany({
      where: { courseId: { in: filter.courseId ? [filter.courseId] : courseIds }, studentId: { in: studentIds } },
    })) as CertificateRow[];
    const tokens = foldText(filter.student ?? '').split(/\s+/).filter(Boolean);
    const code = (filter.code ?? '').trim().toUpperCase();
    const matching = rows.filter((c) => {
      const day = limaDate(c.issueDate);
      const name = foldText(c.participantName);
      return (
        tokens.every((t) => name.includes(t)) &&
        (!code || c.code.toUpperCase().includes(code)) &&
        (!filter.from || day >= filter.from) &&
        (!filter.to || day <= filter.to)
      );
    });
    const companyIds = [...new Set(links.filter((l) => matching.some((c) => c.studentId === l.studentId)).map((l) => l.companyId))];
    const companies = companyIds.length
      ? ((await this.prisma.company.findMany({ where: { id: { in: companyIds } }, select: { id: true, name: true } })) as { id: string; name: string }[])
      : [];
    const companyOf = new Map(companies.map((c) => [c.id, c]));
    return matching
      .sort((a, b) => a.issueDate.getTime() - b.issueDate.getTime())
      .map((c) => ({
        ...toCertificate(c),
        companies: links
          .filter((l) => l.studentId === c.studentId)
          .map((l) => companyOf.get(l.companyId))
          .filter((x): x is { id: string; name: string } => !!x)
          .sort((a, b) => a.name.localeCompare(b.name, 'es')),
      }));
  }

  /**
   * M5: calificación manual de las preguntas abiertas de un intento «En revisión». Al completarse se fija la nota,
   * aprobado o desaprobado y, si aprobó, se emite el certificado. No modifica la evaluación (RN-15).
   */
  async gradeOpenAnswers(actor: AuthUser, attemptId: string, grades: OpenGradeDto[]) {
    return this.tx(async (db) => {
      const attempt = (await db.examAttempt.findUnique({ where: { id: attemptId } })) as AttemptRow | null;
      if (!attempt) throw new NotFoundException('No se encontró el intento.');
      const course = await this.data.ownedCourse(db, actor, attempt.courseId).catch(() => {
        throw new NotFoundException('No se encontró el intento.');
      });
      if (attempt.reviewStatus !== 'EN_REVISION') throw rule('Este intento no tiene preguntas pendientes de calificación.');
      const exam = (await db.exam.findUnique({ where: { id: attempt.examId } })) as ExamRow;
      const questions = (await this.data.questions(db, exam.id)).map(toGradable);
      const open = questions.filter((q) => q.type === 'open');
      const scores: Record<string, number> = {};
      for (const g of grades) {
        const q = open.find((x) => x.id === g.questionId);
        if (!q) throw invalid('Una de las calificaciones no corresponde a una pregunta abierta de este examen.');
        if (!Number.isFinite(g.score) || g.score < 0 || g.score > q.points || !Number.isInteger(g.score * 2)) {
          throw invalid(`El puntaje de «${q.text}» debe estar entre 0 y ${q.points} (se admiten medios puntos).`);
        }
        scores[q.id] = g.score;
      }
      const missing = open.filter((q) => !(q.id in scores));
      if (missing.length) throw invalid(`Falta calificar ${missing.length === 1 ? 'una pregunta abierta' : `${missing.length} preguntas abiertas`}.`);
      const answers = toAttempt(attempt).answers;
      const { earned, totalPoints } = grade(questions, answers, ruleOf(attempt.gradingRule));
      const manual = Object.values(scores).reduce((a, b) => a + b, 0);
      const score = totalPoints ? Math.round(((earned + manual) / totalPoints) * attempt.scaleMax) : 0;
      const passed = score >= exam.passScore;
      const updated = (await db.examAttempt.update({
        where: { id: attemptId },
        data: { score, passed, reviewStatus: 'CALIFICADO', manualScores: scores, gradedAt: new Date() },
      })) as AttemptRow;
      const enrollment = await db.enrollment.findFirst({ where: { studentId: attempt.studentId, courseId: attempt.courseId } });
      if (enrollment) await db.enrollment.update({ where: { id: (enrollment as EnrollmentRow).id }, data: { status: passed ? 'APROBADO' : 'DESAPROBADO' } });
      if (passed) await this.data.issueCertificate(db, updated, course);
      return toAttempt(updated);
    });
  }

  // ===================== Panel (indicadores reales) =====================

  /** Indicadores del Instructor calculados en MySQL: solo sus cursos y sus estudiantes. */
  async dashboard(actor: AuthUser) {
    const courses = (await this.prisma.course.findMany({ where: { createdById: actor.id } })) as CourseRow[];
    const courseIds = courses.map((c) => c.id);
    const studentIds = ((await this.prisma.student.findMany({ where: { registeredById: actor.id }, select: { userId: true } })) as { userId: string }[]).map(
      (s) => s.userId,
    );
    const users = studentIds.length
      ? ((await this.prisma.user.findMany({ where: { id: { in: studentIds } }, select: { id: true, active: true, activationPending: true } })) as {
          id: string;
          active: boolean;
          activationPending: boolean;
        }[])
      : [];
    const attempts = courseIds.length ? ((await this.prisma.examAttempt.findMany({ where: { courseId: { in: courseIds } } })) as AttemptRow[]) : [];
    const certificates = courseIds.length ? ((await this.prisma.certificate.findMany({ where: { courseId: { in: courseIds } } })) as CertificateRow[]) : [];
    const enrollments = courseIds.length ? ((await this.prisma.enrollment.findMany({ where: { courseId: { in: courseIds } } })) as EnrollmentRow[]) : [];
    const graded = attempts.filter((a) => a.reviewStatus !== 'EN_REVISION');

    // Actividad de los últimos 14 días (intentos y certificados por día, hora de Lima).
    const day = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(d);
    const days = Array.from({ length: 14 }, (_, i) => day(new Date(Date.now() - (13 - i) * 86_400_000)));
    const activity = days.map((d) => ({
      date: d,
      attempts: attempts.filter((a) => day(a.submittedAt) === d).length,
      certificates: certificates.filter((c) => day(c.issueDate) === d).length,
    }));
    const names = new Map(courses.map((c) => [c.id, c.name]));
    const recent = [
      ...attempts.map((a) => ({ type: 'intento' as const, date: a.submittedAt, courseName: names.get(a.courseId) ?? '', studentId: a.studentId, passed: a.passed, inReview: a.reviewStatus === 'EN_REVISION' })),
      ...certificates.map((c) => ({ type: 'certificado' as const, date: c.issueDate, courseName: c.courseName, studentId: c.studentId, passed: true, inReview: false })),
    ]
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .slice(0, 10)
      .map((r) => ({ ...r, date: r.date.toISOString() }));

    return {
      participants: {
        total: users.length,
        active: users.filter((u) => u.active && !u.activationPending).length,
        pendingActivation: users.filter((u) => u.activationPending).length,
        inactive: users.filter((u) => !u.active).length,
      },
      courses: { total: courses.length, published: courses.filter((c) => c.status === 'PUBLICADO').length, active: courses.filter((c) => c.active).length },
      enrollments: {
        total: enrollments.length,
        byStatus: Object.fromEntries(
          ['PENDIENTE', 'EN_PROGRESO', 'LISTO_EXAMEN', 'EN_REVISION', 'APROBADO', 'DESAPROBADO'].map((s) => [s.toLowerCase(), enrollments.filter((e) => e.status === s).length]),
        ),
      },
      evaluations: {
        total: attempts.length,
        approved: graded.filter((a) => a.passed).length,
        failed: graded.filter((a) => !a.passed).length,
        inReview: attempts.length - graded.length,
      },
      certificates: { issued: certificates.filter((c) => c.status === 'VIGENTE').length },
      activity,
      recent,
    };
  }

  /** 404 uniforme para un estudiante fuera del alcance (para controladores que lo necesiten). */
  async assertStudent(actor: AuthUser, studentId: string): Promise<void> {
    if (!(await this.scope.canAccessStudent(actor, studentId))) throw new NotFoundException(STUDENT_NOT_FOUND);
  }

  /** Conflicto de concurrencia genérico. */
  static conflict(): ConflictException {
    return new ConflictException('Los datos cambiaron mientras se procesaba la solicitud. Vuelve a intentarlo.');
  }
}
