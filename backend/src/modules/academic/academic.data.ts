import { randomBytes } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { Role } from '../../generated/prisma/enums.js';
import type { AuthUser } from '../../common/auth-user.js';
import {
  type AttemptRow,
  type CertificateRow,
  type CourseRow,
  type EnrollmentRow,
  type ExamRow,
  type ModuleRow,
  type QuestionRow,
  type VideoRow,
  toCourseRecord,
  toGradable,
  toModule,
  toVideo,
} from './academic.mappers.js';
import { CERTIFICATE_ENTITY, MIN_VIDEOS, moduleRuleIssues, ruleIssues, scoreDistribution } from './academic.rules.js';

/** Cliente de Prisma o transacción: las consultas compartidas sirven para ambos. */
export type Db = Prisma.TransactionClient;

export const COURSE_NOT_FOUND = 'No se encontró el curso.';
export const EXAM_NOT_FOUND = 'No se encontró el examen.';

/** Regla de negocio incumplida (409, con el mensaje para mostrar). */
export const rule = (message: string) => new ConflictException(message);
/** Dato de entrada inválido (400). */
export const invalid = (message: string) => new BadRequestException(message);

/**
 * Consultas y reglas compartidas del módulo académico (18/11/2026).
 * Aislamiento: cada Instructor gestiona SOLO sus cursos (`courses.created_by`), igual que sus estudiantes
 * (`students.registered_by`). Lo ajeno o inexistente responde el mismo 404.
 */
@Injectable()
export class AcademicData {
  /** Curso del Instructor autenticado (404 si no existe o es de otro Instructor). */
  async ownedCourse(db: Db, actor: AuthUser, courseId: string): Promise<CourseRow> {
    if (actor.role !== Role.INSTRUCTOR) throw new ForbiddenException('No tienes permiso para realizar esta acción.');
    const course = (await db.course.findUnique({ where: { id: courseId } })) as CourseRow | null;
    if (!course || course.createdById !== actor.id) throw new NotFoundException(COURSE_NOT_FOUND);
    return course;
  }

  /** Examen de un curso del Instructor autenticado. */
  async ownedExam(db: Db, actor: AuthUser, examId: string): Promise<{ exam: ExamRow; course: CourseRow }> {
    const exam = (await db.exam.findUnique({ where: { id: examId } })) as ExamRow | null;
    if (!exam) throw new NotFoundException(EXAM_NOT_FOUND);
    const course = await this.ownedCourse(db, actor, exam.courseId).catch(() => {
      throw new NotFoundException(EXAM_NOT_FOUND);
    });
    return { exam, course };
  }

  async modules(db: Db, courseId: string): Promise<ModuleRow[]> {
    return ((await db.courseModule.findMany({ where: { courseId } })) as ModuleRow[]).sort((a, b) => a.position - b.position);
  }

  /** Videos del curso en orden: por módulo y luego por su orden dentro del módulo. */
  async videos(db: Db, courseId: string, modules?: ModuleRow[]): Promise<VideoRow[]> {
    const order = new Map((modules ?? (await this.modules(db, courseId))).map((m) => [m.id, m.position]));
    return ((await db.courseVideo.findMany({ where: { courseId } })) as VideoRow[]).sort(
      (a, b) => (order.get(a.moduleId) ?? 0) - (order.get(b.moduleId) ?? 0) || a.position - b.position,
    );
  }

  async publishedVideos(db: Db, courseId: string): Promise<VideoRow[]> {
    return (await this.videos(db, courseId)).filter((v) => v.published);
  }

  /** Contenido del curso (forma `CourseContent` del frontend). */
  async content(db: Db, course: CourseRow, onlyPublished: boolean) {
    const modules = await this.modules(db, course.id);
    const all = await this.videos(db, course.id, modules);
    const videos = onlyPublished ? all.filter((v) => v.published) : all;
    return {
      course: toCourseRecord(course),
      modules: modules
        .map((m) => ({ ...toModule(m), videos: videos.filter((v) => v.moduleId === m.id).map(toVideo) }))
        .filter((m) => !onlyPublished || m.videos.length > 0),
      ruleIssues: this.videoRuleIssues(course, modules, all.filter((v) => v.published)),
    };
  }

  /**
   * RN-03 según el estado del curso (19/11/2026): en borrador, la regla para publicar (módulo por módulo); ya
   * publicado, la regla de acceso (sin bloqueo retroactivo por módulos sin videos publicados).
   */
  videoRuleIssues(course: CourseRow, modules: ModuleRow[], published: VideoRow[]): string[] {
    return course.status === 'PUBLICADO' ? ruleIssues(published) : moduleRuleIssues(modules, published);
  }

  /** Examen regular activo del curso (un solo examen activo por curso, D1). */
  async activeExam(db: Db, courseId: string): Promise<ExamRow | null> {
    return ((await db.exam.findFirst({ where: { courseId, active: true, kind: 'REGULAR' } })) as ExamRow | null) ?? null;
  }

  async questions(db: Db, examId: string): Promise<QuestionRow[]> {
    return ((await db.examQuestion.findMany({ where: { examId } })) as QuestionRow[]).sort((a, b) => a.position - b.position);
  }

  async attemptCount(db: Db, examId: string): Promise<number> {
    return db.examAttempt.count({ where: { examId } });
  }

  /** RN-15: con al menos un intento registrado, el examen no admite cambios. */
  async examLocked(db: Db, examId: string): Promise<boolean> {
    return (await this.attemptCount(db, examId)) > 0;
  }

  /** Etapa 2A: suma de puntajes distinta de la escala. Con intentos registrados se conserva (RN-15). */
  async scoreMismatch(db: Db, exam: ExamRow): Promise<{ message: string; grandfathered: boolean } | null> {
    const distribution = scoreDistribution((await this.questions(db, exam.id)).map(toGradable), exam.scaleMax);
    if (distribution.valid) return null;
    return { message: distribution.message, grandfathered: await this.examLocked(db, exam.id) };
  }

  /** Motivo por el que el curso no admite rendir el examen (cadena vacía si lo admite). */
  async examBlockReason(db: Db, course: CourseRow): Promise<string> {
    if (course.status !== 'PUBLICADO') return 'El curso está en borrador: el examen se habilitará cuando el curso se publique.';
    if (!course.active) return 'El curso está desactivado.';
    const issues = ruleIssues(await this.publishedVideos(db, course.id));
    if (issues.length) return `El curso no cumple las reglas de videos (RN-03): ${issues.join(' ')}`;
    const exam = await this.activeExam(db, course.id);
    if (!exam) return 'El curso no tiene un examen activo.';
    if ((await this.questions(db, exam.id)).length === 0) return 'El examen aún no tiene preguntas.';
    const mismatch = await this.scoreMismatch(db, exam);
    if (mismatch && !mismatch.grandfathered) {
      return 'El examen todavía no está disponible: la suma de los puntajes de sus preguntas no coincide con la nota máxima.';
    }
    return '';
  }

  /** Requisitos para publicar: bloqueantes (RN-03, examen con preguntas, 2A) y advertencias. */
  async publicationCheck(db: Db, course: CourseRow) {
    const modules = await this.modules(db, course.id);
    const published = (await this.videos(db, course.id, modules)).filter((v) => v.published);
    const blocking = this.videoRuleIssues(course, modules, published);
    const warnings: string[] = [];
    if (course.status === 'PUBLICADO') {
      // Informativo: el curso conserva su acceso; solo se exigirá al volver a publicarlo desde borrador.
      for (const issue of moduleRuleIssues(modules, published).filter((i) => !blocking.includes(i))) {
        warnings.push(`Para volver a publicarlo desde borrador: ${issue}`);
      }
    }
    const exam = await this.activeExam(db, course.id);
    if (!exam) blocking.push('El curso no tiene un examen activo.');
    else if ((await this.questions(db, exam.id)).length === 0) blocking.push('El examen activo no tiene preguntas.');
    else {
      const mismatch = await this.scoreMismatch(db, exam);
      if (mismatch?.grandfathered) {
        warnings.push(`La evaluación tiene intentos registrados y se conserva sin cambios (RN-15): ${mismatch.message}`);
      } else if (mismatch) {
        blocking.push(mismatch.message);
      }
    }
    if (course.trainingHours === null) warnings.push('Las horas de formación están sin definir: el certificado mostrará «Por definir».');
    if (!course.coverImage) warnings.push('El curso no tiene portada: se mostrará la portada de respaldo.');
    return { canPublish: blocking.length === 0, blocking, warnings, minVideos: MIN_VIDEOS };
  }

  /** Videos completados de una matrícula (solo los publicados, si se indican). */
  async completedIds(db: Db, enrollmentId: string, publishedIds?: Set<string>): Promise<string[]> {
    const rows = (await db.videoProgress.findMany({ where: { enrollmentId } })) as { videoId: string }[];
    return rows.map((r) => r.videoId).filter((id) => !publishedIds || publishedIds.has(id));
  }

  /** Recalcula el estado de quienes aún no rinden ni aprueban según los videos publicados (RN-09). */
  async recompute(db: Db, course: CourseRow): Promise<void> {
    const published = new Set((await this.publishedVideos(db, course.id)).map((v) => v.id));
    const examReady = !(await this.examBlockReason(db, course));
    const enrollments = (await db.enrollment.findMany({ where: { courseId: course.id } })) as EnrollmentRow[];
    for (const e of enrollments) {
      if (e.status === 'APROBADO' || e.status === 'DESAPROBADO' || e.status === 'EN_REVISION') continue;
      const done = (await this.completedIds(db, e.id, published)).length;
      const status = done === 0 ? 'PENDIENTE' : done < published.size || !examReady ? 'EN_PROGRESO' : 'LISTO_EXAMEN';
      if (status !== e.status) await db.enrollment.update({ where: { id: e.id }, data: { status } });
    }
  }

  /**
   * RN-08: un solo certificado válido por aprobación del mismo curso. Conserva los datos del momento de emisión.
   * Código único no secuencial (no se puede adivinar para la verificación pública).
   */
  async issueCertificate(db: Db, attempt: AttemptRow, course: CourseRow): Promise<void> {
    const existing = await db.certificate.findFirst({ where: { studentId: attempt.studentId, courseId: course.id, status: 'VIGENTE' } });
    if (existing || (await db.certificate.findUnique({ where: { attemptId: attempt.id } }))) return;
    const user = await db.user.findUnique({ where: { id: attempt.studentId }, select: { firstNames: true, lastNames: true } });
    const student = await db.student.findUnique({ where: { userId: attempt.studentId } });
    // Cierre funcional (23/11/2026): la empresa se copia al emitir; cambios posteriores no alteran el certificado.
    const links = (await db.studentCompany.findMany({ where: { studentId: attempt.studentId }, select: { companyId: true } })) as { companyId: string }[];
    const companies = links.length
      ? ((await db.company.findMany({ where: { id: { in: links.map((l) => l.companyId) } }, select: { name: true } })) as { name: string }[])
      : [];
    const participantCompany = companies.map((c) => c.name).sort((a, b) => a.localeCompare(b, 'es')).join(', ').slice(0, 500) || null;
    const now = new Date();
    let code = '';
    do code = `IMC-${now.getUTCFullYear()}-${randomBytes(5).toString('hex').toUpperCase()}`;
    while (await db.certificate.findUnique({ where: { code } }));
    const data: Omit<CertificateRow, 'id'> = {
      code,
      studentId: attempt.studentId,
      courseId: course.id,
      attemptId: attempt.id,
      participantName: user ? `${user.firstNames} ${user.lastNames}` : '',
      participantFirstNames: user?.firstNames ?? null,
      participantLastNames: user?.lastNames ?? null,
      participantDni: student?.dni ?? null,
      participantCompany,
      courseName: course.name,
      courseLevel: course.level ?? null,
      approvalDate: now,
      issueDate: now,
      score: attempt.score,
      scaleMax: attempt.scaleMax,
      trainingHours: course.trainingHours,
      entityName: CERTIFICATE_ENTITY,
      status: 'VIGENTE',
    };
    await db.certificate.create({ data });
  }
}
