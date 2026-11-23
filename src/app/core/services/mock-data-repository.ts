import { COURSE_LEVELS } from '../models/course.model';
import { WHATSAPP_ERROR, cleanWhatsapp, isValidWhatsapp } from '../models/student.model';
import { Injectable } from '@angular/core';
import { MEET_URL_ERROR, normalizeMeetUrl } from '../utils/meet';
import { Observable, of, delay, throwError } from 'rxjs';
import { AttemptFilter, CertificateFilter, DataRepository, EnrollmentFilter, StorageStatus } from './data-repository';
import { Company, User } from '../models/user.model';
import {
  Course,
  CourseContent,
  LiveSession,
  LiveSessionInput,
  LiveSessionStatus,
  CourseInput,
  CourseModule,
  CourseModuleInput,
  CoursePatch,
  CourseRecord,
  CourseRecordPatch,
  CourseVideoInput,
  Enrollment,
  MIN_VIDEOS,
  VIDEO_SOURCE_REQUIRED,
  ParticipantCourse,
  ParticipantInput,
  PublicationCheck,
  Video,
  VideoInput,
  VideoRecord,
  VideoSource,
  VideoSourceChoice,
} from '../models/course.model';
import {
  Attempt,
  EXAM_LOCKED_MESSAGE,
  Exam,
  ExamAvailability,
  ExamConfig,
  ExamQuestion,
  MAX_ATTEMPTS,
  MAX_OPTIONS,
  OPEN_ANSWER_MAX,
  OpenAnswerGrade,
  GradingRule,
  Question,
  SubmitMode,
  attemptRule,
  examKind,
  isComplete,
  isPendingReview,
  questionPoints,
  scoreDistribution,
  requiredSelections,
  selectionError,
} from '../models/exam.model';
import { Certificate, matchesCertificate } from '../models/certificate.model';
import { ExamStart, Recovery, RecoveryInput, RecoveryReason, RecoveryState, StartedExam } from '../models/recovery.model';
import { DEMO_CONFIG } from '../config/demo.config';
import { parseYouTubeId } from '../utils/youtube';
import { driveViewUrl, parseDriveFileId } from '../utils/drive';
import {
  DemoState,
  DemoStateV3,
  isDemoState,
  isDemoStateV2,
  isDemoStateV3,
  migrateV2,
  migrateV3toV4,
  normalizeDemoState,
  type StoredLiveSession,
  verifyMigration,
  verifyMigrationV4,
} from '../data/demo-state';
import { SEED_COVERS, SEED_DEMO_COURSES, SEED_DEMO_ENROLLMENTS, SEED_V2, withSeedRecoveryCollections } from '../data/seed';
import { splitFullName } from '../models/user.model';

const LATENCY_MS = 250; // simula la espera de una API
/** Etapa 2B (P4): margen técnico (segundos) entre el temporizador del navegador y el límite del examen. */
const TIMEOUT_TOLERANCE_SEC = 5;
/** Estado vigente (v4, B1.2). Es la única clave que escribe la aplicación. */
export const STORAGE_KEY = 'imc-demo-state-v4';
/** Estado v3 (antes de B1.2). Se migra a v4 y NUNCA se modifica ni se borra. */
export const V3_STORAGE_KEY = 'imc-demo-state-v3';
/** Estado de la versión anterior (un solo curso). Se conserva hasta confirmar la migración. */
export const LEGACY_STORAGE_KEY = 'imc-demo-state-v2';
/** Copia de un estado v4 que no se pudo leer, para no perderlo en silencio. */
export const BACKUP_STORAGE_KEY = 'imc-demo-state-v4-respaldo';
/** Copia de un estado v3 que no se pudo leer (clave usada desde E2). */
export const V3_INVALID_BACKUP_KEY = 'imc-demo-state-v3-respaldo';
/** Copia exacta de v3 tomada antes de migrarlo a v4. Solo se escribe si no existe. */
export const V3_MIGRATION_BACKUP_KEY = 'imc-demo-state-v3-respaldo-b1';

const LEGACY_COURSE = DEMO_CONFIG.legacyCourseId;
/** Límite técnico de la duración ingresada (no es una regla de negocio). */
/** Tope técnico (columna INT del backend); no es una regla de negocio (20/11/2026). */
const MAX_DURATION_SEC = 2_147_483_647;
/** Límites técnicos de los textos de un módulo (no son reglas de negocio). */
const MODULE_TITLE_MAX = 120;
const MODULE_DESCRIPTION_MAX = 500;

/**
 * Etapa 2B, Bloque 2 (R2): instante en ISO 8601 con la zona de Lima (-05:00, sin horario de verano), como se
 * guardan las fechas de los inicios. `Date.parse` lo vuelve a convertir al mismo instante.
 */
function limaIso(ms: number): string {
  return new Date(ms - 5 * 3_600_000).toISOString().replace('Z', '-05:00');
}

/**
 * Etapa 2B, Bloque 2 (R3): instante a partir de una fecha ISO 8601 con zona horaria EXPLÍCITA («Z» o ±hh:mm).
 * Sin zona, o con una fecha inexistente (31/02, 25:00…), devuelve null: así no depende de la zona del navegador.
 */
const INSTANT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|([+-])(\d{2}):(\d{2}))$/;
function parseInstant(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const m = INSTANT.exec(value);
  if (!m) return null;
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return null;
  const offsetMin = m[7] === 'Z' ? 0 : (m[8] === '-' ? -1 : 1) * (Number(m[9]) * 60 + Number(m[10]));
  // La fecha y hora escritas deben existir tal cual en esa zona (sin desbordes de día, mes u hora).
  const local = new Date(ms + offsetMin * 60_000);
  const same =
    local.getUTCFullYear() === Number(m[1]) &&
    local.getUTCMonth() + 1 === Number(m[2]) &&
    local.getUTCDate() === Number(m[3]) &&
    local.getUTCHours() === Number(m[4]) &&
    local.getUTCMinutes() === Number(m[5]);
  return same ? ms : null;
}

/** Fecha y hora de Lima para mensajes: «12/11/2026 09:00». */
function limaLabel(iso: string): string {
  const d = new Date(Date.parse(iso) - 5 * 3_600_000);
  const two = (n: number) => String(n).padStart(2, '0');
  return `${two(d.getUTCDate())}/${two(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${two(d.getUTCHours())}:${two(d.getUTCMinutes())}`;
}

function respond<T>(value: T): Observable<T> {
  return of(structuredClone(value)).pipe(delay(LATENCY_MS));
}

function fail<T>(message: string): Observable<T> {
  return throwError(() => new Error(message));
}

function today(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function mmss(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

function isDriveHost(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === 'drive.google.com' || host === 'docs.google.com';
  } catch {
    return false;
  }
}

/** M4: el enlace debe corresponder a la fuente elegida en el formulario. */
function sourceMismatch(choice: VideoSourceChoice, source: VideoSource): string {
  const expected = { youtube: 'youtube', drive: 'drive', url: 'url', none: 'placeholder' }[choice];
  if (source.kind === expected) return '';
  if (choice === 'youtube') return 'El enlace no es un video de YouTube válido (por ejemplo, https://www.youtube.com/watch?v=…).';
  if (choice === 'drive') return 'El enlace no es un archivo de Google Drive válido (por ejemplo, https://drive.google.com/file/d/…/view).';
  return 'Para enlaces de YouTube o de Google Drive, elige esa fuente.';
}

function sourceUrl(source: VideoSource): string | undefined {
  if (source.kind === 'youtube') return `https://www.youtube.com/watch?v=${source.videoId}`;
  if (source.kind === 'drive') return driveViewUrl(source.fileId);
  return source.kind === 'url' ? source.url : undefined;
}

/** Configuración del examen. El límite de intentos es siempre MAX_ATTEMPTS (un solo intento), aunque el dato guardado diga otra cosa. */
function examConfig(exam: Exam): ExamConfig {
  const { timeMinutes, passScore, scaleMax } = exam;
  return { timeMinutes, passScore, maxAttempts: MAX_ATTEMPTS, scaleMax };
}

/** Examen con el límite de intentos vigente; no modifica el dato guardado. */
function withAttemptRule(exam: Exam): Exam {
  return { ...exam, maxAttempts: MAX_ATTEMPTS };
}

function plainQuestion({ examId, ...question }: ExamQuestion): Question {
  return question;
}

/** Ruta relativa del proyecto o URL https; null si está vacía; undefined si no es válida. */
function normalizeCover(value: string | null): string | null | undefined {
  const v = value?.trim();
  if (!v) return null;
  if (/^https:\/\/\S+$/i.test(v)) return v;
  if (!v.includes('..') && /^[\w-]+(\/[\w.-]+)*\.(svg|png|jpe?g|webp)$/i.test(v)) return v;
  return undefined;
}

/**
 * Datos de demostración con estado guardado en localStorage (solo para presentar el flujo).
 * Todo lo que aquí se valida o calcula debe hacerlo el servidor en la versión real.
 */
@Injectable()
export class MockDataRepository extends DataRepository {
  private seq = 0;
  private status: StorageStatus = { source: 'seed', warning: '', migrationProblems: [], legacyStatePresent: false };
  private state: DemoState = this.load();

  // ================= Lecturas (curso principal) =================
  getUsers(): Observable<User[]> {
    return respond(this.state.users);
  }

  /** R7: empresas registradas (en la demostración, las ficticias de la semilla; no se crea ninguna aquí). */
  listCompanies(): Observable<Company[]> {
    return respond(this.state.companies);
  }

  getCourse(): Observable<Course> {
    const course = this.legacyCourse();
    return course ? respond(course) : fail('No se encontró el curso.');
  }

  getEnrollment(userId: string): Observable<Enrollment | null> {
    this.sync();
    return respond(this.enrollment(userId, LEGACY_COURSE) ?? null);
  }

  getEnrollments(): Observable<Enrollment[]> {
    return respond(this.state.enrollments.filter((e) => e.courseId === LEGACY_COURSE));
  }

  getExamConfig(): Observable<ExamConfig> {
    const exam = this.activeExam(LEGACY_COURSE);
    return exam ? respond(examConfig(exam)) : fail('El curso no tiene un examen activo.');
  }

  getQuestions(): Observable<Question[]> {
    return respond(this.legacyQuestions());
  }

  getAttempts(userId?: string): Observable<Attempt[]> {
    this.sync();
    return respond(this.attempts({ userId, courseId: LEGACY_COURSE }));
  }

  getCertificates(userId?: string): Observable<Certificate[]> {
    this.sync();
    return respond(this.certificates({ userId }));
  }

  findCertificateByCode(code: string): Observable<Certificate | null> {
    const wanted = code.trim().toUpperCase();
    return respond(this.state.certificates.find((c) => c.code.toUpperCase() === wanted) ?? null);
  }

  findCertificatesByDni(dni: string): Observable<Certificate[]> {
    return respond(this.state.certificates.filter((c) => c.participantDni === dni.trim()));
  }

  // ================= Lecturas (varios cursos) =================
  getCourses(): Observable<CourseRecord[]> {
    return respond(this.state.courses);
  }

  getCourseContent(courseId: string): Observable<CourseContent> {
    return this.course(courseId) ? respond(this.content(courseId, false)) : fail('No se encontró el curso.');
  }

  getParticipantCourses(userId: string): Observable<ParticipantCourse[]> {
    const list: ParticipantCourse[] = [];
    for (const enrollment of this.state.enrollments.filter((e) => e.userId === userId)) {
      const course = this.course(enrollment.courseId);
      if (!course || !this.visibleToParticipant(course)) continue;
      const totalVideos = this.publishedVideos(course.id).length;
      const completedVideos = this.completedPublished(enrollment);
      list.push({
        course,
        enrollment,
        totalVideos,
        completedVideos,
        percent: totalVideos ? Math.round((completedVideos / totalVideos) * 100) : 0,
        preview: course.status === 'borrador',
      });
    }
    return respond(list);
  }

  getParticipantCourseContent(userId: string, courseId: string): Observable<CourseContent> {
    const error = this.accessError(userId, courseId);
    return error ? fail(error) : respond(this.content(courseId, true));
  }

  // ----- Sesiones en vivo con Google Meet (20/11/2026; mismas reglas que el backend) -----
  getCourseLiveSessions(courseId: string): Observable<LiveSession[]> {
    return this.course(courseId) ? respond(this.liveSessions(courseId)) : fail('No se encontró el curso.');
  }

  getParticipantLiveSessions(userId: string, courseId: string): Observable<LiveSession[]> {
    const error = this.accessError(userId, courseId);
    return error ? fail(error) : respond(this.liveSessions(courseId));
  }

  createCourseLiveSession(courseId: string, input: LiveSessionInput): Observable<LiveSession[]> {
    if (!this.course(courseId)) return fail('No se encontró el curso.');
    const parsed = this.liveSessionInput(courseId, input);
    if (typeof parsed === 'string') return fail(parsed);
    const past = this.pastStart(parsed.startsAt);
    if (past) return fail(past);
    this.state.liveSessions.push({ id: this.newId('ls'), courseId, status: 'programada', ...parsed });
    this.save();
    return respond(this.liveSessions(courseId));
  }

  updateCourseLiveSession(courseId: string, sessionId: string, input: LiveSessionInput): Observable<LiveSession[]> {
    const session = this.state.liveSessions.find((s) => s.id === sessionId && s.courseId === courseId);
    if (!session) return fail('No se encontró la sesión en vivo.');
    const parsed = this.liveSessionInput(courseId, input);
    if (typeof parsed === 'string') return fail(parsed);
    const past = parsed.startsAt !== session.startsAt ? this.pastStart(parsed.startsAt) : '';
    if (past) return fail(past);
    const { description, ...rest } = parsed;
    Object.assign(session, rest);
    if (description) session.description = description;
    else delete session.description;
    this.save();
    return respond(this.liveSessions(courseId));
  }

  setCourseLiveSessionStatus(courseId: string, sessionId: string, status: LiveSessionStatus): Observable<LiveSession[]> {
    const session = this.state.liveSessions.find((s) => s.id === sessionId && s.courseId === courseId);
    if (!session) return fail('No se encontró la sesión en vivo.');
    if (status === 'programada' && session.status === 'cancelada') {
      const past = this.pastStart(session.startsAt);
      if (past) return fail(past);
    }
    session.status = status;
    this.save();
    return respond(this.liveSessions(courseId));
  }

  setCourseLiveSessionRecording(courseId: string, sessionId: string, recordingUrl: string | null): Observable<LiveSession[]> {
    const session = this.state.liveSessions.find((s) => s.id === sessionId && s.courseId === courseId);
    if (!session) return fail('No se encontró la sesión en vivo.');
    const url = recordingUrl?.trim() || null;
    if (url) {
      const source = url.length <= 500 ? this.sourceFromUrl(url) : null;
      if (!source || source.kind === 'placeholder') return fail('El enlace de la grabación debe ser https (Google Drive, YouTube u otra fuente compatible).');
      if (session.status === 'cancelada') return fail('La clase está cancelada: no se le puede agregar una grabación.');
      if (Date.parse(session.startsAt) > Date.now()) return fail('La grabación se agrega cuando la clase ya se realizó.');
      session.recordingUrl = url;
    } else {
      delete session.recordingUrl;
    }
    this.save();
    return respond(this.liveSessions(courseId));
  }

  private liveSessions(courseId: string): LiveSession[] {
    const modules = this.courseModules(courseId);
    return this.state.liveSessions
      .filter((s) => s.courseId === courseId)
      .map((s) => {
        const index = s.moduleId ? modules.findIndex((m) => m.id === s.moduleId) : -1;
        return { ...s, moduleId: index >= 0 ? s.moduleId : null, moduleTitle: index >= 0 ? modules[index].title : '', moduleOrder: index + 1 };
      })
      .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt) || a.title.localeCompare(b.title, 'es'));
  }

  /** Valida y normaliza una sesión; devuelve el mensaje de error si no es válida. */
  private liveSessionInput(courseId: string, input: LiveSessionInput): Omit<StoredLiveSession, 'id' | 'courseId' | 'status'> | string {
    const title = input.title?.trim() ?? '';
    if (!title) return 'Ingresa el título de la sesión en vivo.';
    if (title.length > 150) return 'El título admite como máximo 150 caracteres.';
    const description = input.description?.trim() || undefined;
    if (description && description.length > 2000) return 'La descripción admite como máximo 2000 caracteres.';
    const time = Date.parse(input.startsAt ?? '');
    if (!input.startsAt || Number.isNaN(time) || new Date(time).getUTCFullYear() > 2100) return 'Ingresa una fecha y hora de inicio válidas.';
    const meetUrl = normalizeMeetUrl(input.meetUrl);
    if (!meetUrl) return MEET_URL_ERROR;
    const moduleId = input.moduleId?.trim() || null;
    if (moduleId && !this.courseModules(courseId).some((m) => m.id === moduleId)) return 'No se encontró el módulo.';
    return { moduleId, title, ...(description ? { description } : {}), startsAt: new Date(time).toISOString(), meetUrl };
  }

  private pastStart(startsAt: string): string {
    return Date.parse(startsAt) < Date.now() - 5 * 60_000 ? 'La fecha y hora de inicio ya pasaron. Elige una fecha futura.' : '';
  }

  listEnrollments(filter: EnrollmentFilter = {}): Observable<Enrollment[]> {
    this.sync();
    return respond(
      this.state.enrollments.filter(
        (e) => (!filter.userId || e.userId === filter.userId) && (!filter.courseId || e.courseId === filter.courseId),
      ),
    );
  }

  getExams(courseId: string): Observable<Exam[]> {
    return respond(this.state.exams.filter((e) => e.courseId === courseId).map(withAttemptRule));
  }

  getActiveExam(courseId: string): Observable<Exam | null> {
    const exam = this.activeExam(courseId);
    return respond(exam ? withAttemptRule(exam) : null);
  }

  /**
   * Etapa 2B, Bloque 2: el examen que le corresponde al estudiante. Con una recuperación no anulada (R3), el de la
   * recuperación (el regular reutilizado o uno independiente); si no, el regular activo del curso (R2).
   */
  getStudentExam(userId: string, courseId: string): Observable<Exam | null> {
    this.sync();
    const recovery = this.currentRecovery(userId, courseId);
    const exam = recovery ? this.state.exams.find((e) => e.id === recovery.examId) : this.regularExam(courseId);
    return respond(exam ? withAttemptRule(exam) : null);
  }

  /**
   * Etapa 2B, Bloque 2 (R2): inicio del examen regular registrado en el repositorio (no solo en el navegador).
   * - Aplica las mismas validaciones que para rendir (RN-04 del curso, RN-03, RN-07, RN-11, Etapa 2A…).
   * - Un inicio por estudiante y examen: si ya existe y el examen no se entregó (recarga, otra pestaña o volver
   *   más tarde), devuelve ese mismo inicio y el tiempo no se reinicia, aunque ya se haya agotado.
   * - Antes de decidir, lee lo que otra pestaña haya guardado, para no crear un segundo inicio.
   * No crea intentos: el intento se registra solo al entregar.
   */
  startExam(userId: string, courseId: string): Observable<StartedExam> {
    this.sync(); // corrección de R3: antes, lo vencido se entrega o se marca como no rendido
    // Etapa 2B, Bloque 2 (R3): con una recuperación no anulada se inicia la recuperación (solo dentro de su ventana).
    const recovery = this.currentRecovery(userId, courseId);
    if (recovery) return this.startRecovery(userId, courseId, recovery);
    const exam = this.regularExam(courseId);
    if (!exam) return fail('El curso no tiene un examen activo.');
    const availability = this.availability(userId, courseId);
    if (!availability.available) return fail(availability.reason);

    let start = this.registeredStart(userId, exam.id);
    if (!start) {
      const now = Date.now();
      start = { userId, examId: exam.id, startedAt: limaIso(now), endsAt: limaIso(now + exam.timeMinutes * 60_000) };
      this.state.examStarts.push(start);
      this.save();
    }
    return respond({ exam: withAttemptRule(exam), startedAt: start.startedAt, endsAt: start.endsAt, answers: start.answers ?? {} });
  }

  /**
   * Corrección de R3: guarda las respuestas del examen iniciado (por pregunta: las demás no se tocan, así dos
   * pestañas no se borran entre sí). Solo preguntas de ese examen y alternativas que existen; una respuesta vacía
   * se quita (nunca se inventa). Rechaza si no hay examen iniciado, si ya se entregó o si su tiempo terminó.
   */
  saveExamAnswers(userId: string, courseId: string, answers: Record<string, string[]>): Observable<Record<string, string[]>> {
    this.sync();
    const start = this.openStart(userId, courseId);
    if (!start) return fail('No tienes un examen iniciado en este curso.');
    if (start.closedAt) return fail('Tu examen ya fue entregado.');
    const questions = this.examQuestions(start.examId);
    const next: Record<string, string[]> = { ...(start.answers ?? {}) };
    for (const [questionId, values] of Object.entries(answers ?? {})) {
      const q = questions.find((x) => x.id === questionId);
      if (!q || !Array.isArray(values)) continue;
      const strings = values.filter((v): v is string => typeof v === 'string');
      let value: string[] = [];
      if (q.type === 'open') {
        const text = (strings[0] ?? '').slice(0, OPEN_ANSWER_MAX);
        value = text.trim() ? [text] : [];
      } else {
        const ids = new Set(q.options.map((o) => o.id));
        value = [...new Set(strings)].filter((id) => ids.has(id));
      }
      if (value.length) next[questionId] = value;
      else delete next[questionId];
    }
    start.answers = next;
    start.answersUpdatedAt = limaIso(Date.now());
    this.save();
    return respond(next);
  }

  // ----- Recuperaciones (Etapa 2B, Bloque 2, R3) -----
  /**
   * Solo el Instructor. Se autoriza solo a quien desaprobó el examen regular, siempre con el examen original. Una sola recuperación no anulada por estudiante y curso. La ventana se guarda en
   * hora de Lima y solo limita el inicio (puede ser más corta que el examen). No crea intentos ni cambia la inscripción.
   */
  authorizeRecovery(instructorId: string, input: RecoveryInput): Observable<Recovery> {
    this.sync(); // otra pestaña del Instructor pudo autorizar antes; un regular vencido se entrega antes de decidir
    const actor = this.instructorError(instructorId, 'autorizar');
    if (actor) return fail(actor);
    const { userId, courseId } = input;
    const course = this.course(courseId);
    if (!course) return fail('No se encontró el curso.');
    const regular = this.regularExam(courseId);
    if (!regular) return fail('El curso no tiene un examen activo.');
    if (course.status !== 'publicado') return fail('El curso está en borrador: no se pueden autorizar recuperaciones.');

    if (this.currentRecovery(userId, courseId)) {
      return fail('El estudiante ya tiene una recuperación en este curso: solo se permite una oportunidad.');
    }
    const eligibility = this.recoveryEligibility(userId, courseId);
    if ('error' in eligibility) return fail(eligibility.error);

    const exam = this.recoveryExamFor(input, regular);
    if (typeof exam === 'string') return fail(exam);
    const window = this.recoveryWindow(input.opensAt, input.closesAt);
    if (typeof window === 'string') return fail(window);

    const recovery: Recovery = {
      id: this.newId('rec'),
      userId,
      courseId,
      regularExamId: regular.id,
      examId: exam.id,
      reason: eligibility.reason,
      mode: 'original',
      opensAt: limaIso(window.opens),
      closesAt: limaIso(window.closes),
      authorizedBy: instructorId,
      authorizedAt: limaIso(Date.now()),
    };
    this.state.recoveries.push(recovery);
    this.save();
    return respond(recovery);
  }

  /** Solo el Instructor y solo antes de que el estudiante inicie (ni iniciada, ni rendida, ni vencida). */
  cancelRecovery(instructorId: string, recoveryId: string): Observable<Recovery> {
    this.sync(); // el estudiante pudo iniciarla en otra pestaña; lo vencido se constata antes de decidir
    const actor = this.instructorError(instructorId, 'anular');
    if (actor) return fail(actor);
    const recovery = this.state.recoveries.find((r) => r.id === recoveryId);
    if (!recovery) return fail('No se encontró la recuperación.');
    if (recovery.cancelledAt) return fail('Esta recuperación ya fue anulada.');
    if (recovery.attemptId) return fail('No se puede anular: la recuperación ya fue rendida.');
    if (recovery.startedAt) return fail('No se puede anular: el estudiante ya inició la recuperación.');
    if (this.recoveryNoShow(recovery)) {
      return fail('No se puede anular: el plazo de la recuperación ya terminó (no rindió la recuperación).');
    }
    recovery.cancelledAt = limaIso(Date.now());
    this.save();
    return respond(recovery);
  }

  listRecoveries(filter: { userId?: string; courseId?: string } = {}): Observable<Recovery[]> {
    this.sync();
    return respond(
      this.state.recoveries.filter(
        (r) => (!filter.userId || r.userId === filter.userId) && (!filter.courseId || r.courseId === filter.courseId),
      ),
    );
  }

  getRecoveryStatus(userId: string, courseId: string): Observable<RecoveryState> {
    this.sync();
    return respond(this.recoveryState(userId, courseId));
  }

  listRecoveryStates(filter: { userId?: string; courseId?: string } = {}): Observable<RecoveryState[]> {
    this.sync();
    return respond(
      this.state.enrollments
        .filter((e) => (!filter.userId || e.userId === filter.userId) && (!filter.courseId || e.courseId === filter.courseId))
        .map((e) => this.recoveryState(e.userId, e.courseId)),
    );
  }

  getExamQuestions(examId: string): Observable<ExamQuestion[]> {
    return respond(this.examQuestions(examId));
  }

  getExamAvailability(userId: string, courseId: string): Observable<ExamAvailability> {
    this.sync(); // corrección de R3: lo vencido se entrega o se marca antes de responder
    return respond(this.availability(userId, courseId));
  }

  listAttempts(filter: AttemptFilter = {}): Observable<Attempt[]> {
    this.sync();
    return respond(this.attempts(filter));
  }

  listCertificates(filter: CertificateFilter = {}): Observable<Certificate[]> {
    this.sync();
    // 20/11/2026: empresa del participante y filtros de «Certificados emitidos» (misma regla que el servidor).
    const companyOf = new Map(this.state.companies.map((c) => [c.id, c]));
    const withCompanies = this.certificates(filter).map((c) => {
      const company = companyOf.get(this.state.users.find((u) => u.id === c.userId)?.companyId ?? '');
      return { ...c, companies: company ? [{ id: company.id, name: company.name }] : [] };
    });
    return respond(withCompanies.filter((c) => matchesCertificate(c, filter)));
  }

  // ================= Participante =================
  markVideoCompleted(userId: string, videoId: string): Observable<Enrollment> {
    return this.markCourseVideoCompleted(userId, LEGACY_COURSE, videoId);
  }

  markCourseVideoCompleted(userId: string, courseId: string, videoId: string): Observable<Enrollment> {
    const error = this.accessError(userId, courseId, 'No tienes un curso asignado.');
    if (error) return fail(error);
    const video = this.state.videos.find((v) => v.id === videoId && v.courseId === courseId);
    if (!video) return fail('No se encontró el video.');
    if (!video.published) return fail('Este video no está disponible.');

    const enrollment = this.enrollment(userId, courseId)!;
    if (!enrollment.completedVideoIds.includes(videoId)) {
      enrollment.completedVideoIds.push(videoId);
    }
    if (!enrollment.startDate) enrollment.startDate = today();
    this.recompute(courseId);
    this.save();
    return respond(enrollment);
  }

  submitAttempt(
    userId: string,
    answers: Record<string, string[]>,
    durationSec: number,
    mode: SubmitMode = 'voluntaria',
  ): Observable<Attempt> {
    const exam = this.activeExam(LEGACY_COURSE);
    if (!exam) return fail('El curso no tiene un examen activo.');
    return this.submitExamAttempt(userId, exam.id, answers, durationSec, mode);
  }

  submitExamAttempt(
    userId: string,
    examId: string,
    answers: Record<string, string[]>,
    durationSec: number,
    mode: SubmitMode = 'voluntaria',
  ): Observable<Attempt> {
    // Etapa 2B, Bloque 2 (R2): con dos pestañas, la segunda entrega debe ver el intento de la primera (RN-07).
    // Corrección de R3: si el tiempo (y su margen) ya terminó, el repositorio cerró el examen con las respuestas
    // guardadas; esta misma entrega recibe ese intento en lugar de registrar otro.
    const closedNow = this.sync();
    const exam = this.state.exams.find((e) => e.id === examId);
    if (!exam) return fail('No se encontró el examen.');
    const alreadyClosed = closedNow.find((a) => a.userId === userId && a.examId === examId);
    if (alreadyClosed) return respond(alreadyClosed);
    // Corrección de R3: con una recuperación no anulada, se entrega la recuperación (no el regular, que queda cerrado).
    const recovery = this.currentRecovery(userId, exam.courseId);
    if (recovery) return this.submitRecovery(userId, exam, recovery, answers ?? {}, durationSec, mode);
    if (!exam.active) return fail('Este examen no está activo.');
    // RN-04, RN-07, RN-11 y reglas del curso (borrador, RN-03)
    const availability = this.availability(userId, exam.courseId);
    if (!availability.available) return fail(availability.reason);

    const user = this.state.users.find((u) => u.id === userId)!;
    const questions = this.examQuestions(examId);
    const start = this.registeredStart(userId, examId);
    // Etapa 2B (D3, P4): la entrega voluntaria exige todo completo; la de tiempo agotado envía solo lo registrado.
    const submission = this.submissionError(exam, questions, answers ?? {}, durationSec, mode, start);
    if (submission) return fail(submission);
    // Corrección de R3: por tiempo agotado, con un inicio registrado, se califican las respuestas guardadas.
    const graded = mode === 'tiempo' && start ? (start.answers ?? {}) : (answers ?? {});
    const attempt = this.recordAttempt(user, exam, graded, durationSec, {}, true);
    this.closeStart(start, attempt);
    this.save();
    return respond(attempt);
  }

  gradeOpenAnswers(attemptId: string, grades: OpenAnswerGrade[]): Observable<Attempt> {
    this.sync();
    const attempt = this.state.attempts.find((a) => a.id === attemptId);
    if (!attempt) return fail('No se encontró el intento.');
    // R4: un intento de recuperación se califica igual; como es la nota vigente (reemplaza a la regular), al
    // completarse actualiza la condición del estudiante y, si aprueba, emite el certificado (más abajo).
    if (!isPendingReview(attempt)) return fail('Este intento no tiene preguntas pendientes de calificación.');
    const exam = this.state.exams.find((e) => e.id === attempt.examId);
    if (!exam) return fail('No se encontró el examen.');
    // RN-15: el examen tiene este intento, así que sus preguntas no pudieron cambiar desde el envío.
    const questions = this.examQuestions(exam.id);
    const open = questions.filter((q) => q.type === 'open');
    const scores: Record<string, number> = {};
    for (const g of grades) {
      const q = open.find((x) => x.id === g.questionId);
      if (!q) return fail('Una de las calificaciones no corresponde a una pregunta abierta de este examen.');
      if (!Number.isFinite(g.score) || g.score < 0 || g.score > q.points || !Number.isInteger(g.score * 2)) {
        return fail(`El puntaje de «${q.text}» debe estar entre 0 y ${q.points} (se admiten medios puntos).`);
      }
      scores[q.id] = g.score;
    }
    const missing = open.filter((q) => !(q.id in scores));
    if (missing.length) return fail(`Falta calificar ${missing.length === 1 ? 'una pregunta abierta' : `${missing.length} preguntas abiertas`}.`);

    // Etapa 2B (D4): la parte automática se termina de calificar con la regla con la que se envió el intento
    // («todo o nada» si es anterior a la 2B). No se recalcula ningún otro intento.
    const { earned, totalPoints } = this.grade(questions, attempt.answers ?? {}, attemptRule(attempt));
    const manual = Object.values(scores).reduce((a, b) => a + b, 0);
    const score = totalPoints ? Math.round(((earned + manual) / totalPoints) * attempt.scaleMax) : 0;
    // Nota mínima vigente del examen: no pudo cambiar desde el envío porque el examen tiene intentos (RN-15).
    const passed = score >= exam.passScore;
    Object.assign(attempt, {
      score,
      passed,
      review: { status: 'calificado', manualScores: scores, gradedAt: new Date().toISOString() },
    });
    const enrollment = this.enrollment(attempt.userId, attempt.courseId);
    if (enrollment) enrollment.status = passed ? 'aprobado' : 'desaprobado';
    const user = this.state.users.find((u) => u.id === attempt.userId);
    const course = this.course(attempt.courseId);
    // El certificado solo se emite al completar la calificación y si aprobó (decisión del 29/10/2026).
    if (passed && user && course) this.issueCertificate(user, course, attempt);
    this.save();
    return respond(attempt);
  }

  // ================= Administración =================
  addParticipant(input: ParticipantInput, courseIds: string[] = [LEGACY_COURSE]): Observable<User> {
    const fullName = input.fullName.trim();
    const email = input.email.trim().toLowerCase();
    const dni = input.dni.trim();
    if (fullName.length < 3) return fail('Ingresa nombres y apellidos.');
    if (!/^\S+@\S+\.\S+$/.test(email)) return fail('Ingresa un correo electrónico válido.');
    if (!/^\d{8}$/.test(dni)) return fail('El DNI debe tener 8 dígitos.');
    if (!isValidWhatsapp(input.whatsapp ?? '')) return fail(WHATSAPP_ERROR);
    const whatsapp = cleanWhatsapp(input.whatsapp ?? '');
    // RN-01: cada correo debe ser único
    if (this.state.users.some((u) => u.email.toLowerCase() === email)) {
      return fail('Ya existe un usuario con ese correo electrónico.');
    }
    if (this.state.users.some((u) => u.dni === dni)) {
      return fail('Ya existe un participante con ese DNI.');
    }
    const ids = [...new Set(courseIds)];
    if (ids.some((id) => !this.course(id))) return fail('No se encontró el curso.');

    // El formulario aún pide el nombre completo (los campos separados llegan en B2): se separa y queda para revisión.
    const user: User = { id: this.newId('u'), fullName, ...splitFullName(fullName), nameReview: true, email, dni, ...(whatsapp ? { whatsapp } : {}), role: 'participant' };
    this.state.users.push(user);
    for (const courseId of ids) {
      this.state.enrollments.push({ userId: user.id, courseId, completedVideoIds: [], status: 'pendiente' });
    }
    this.save();
    return respond(user);
  }

  enrollParticipant(userId: string, courseId: string): Observable<Enrollment> {
    if (!this.state.users.some((u) => u.id === userId && u.role === 'participant')) {
      return fail('No se encontró el participante.');
    }
    if (!this.course(courseId)) return fail('No se encontró el curso.');
    if (this.enrollment(userId, courseId)) return fail('El participante ya tiene este curso asignado.');
    const enrollment: Enrollment = { userId, courseId, completedVideoIds: [], status: 'pendiente' };
    this.state.enrollments.push(enrollment);
    this.save();
    return respond(enrollment);
  }

  createCourse(input: CourseInput): Observable<CourseRecord> {
    const error = this.courseInputError(input);
    if (error) return fail(error);
    const id = this.newId('c');
    const course: CourseRecord = {
      id,
      name: input.name.trim(),
      description: input.description.trim(),
      status: 'borrador', // se publica cuando cumpla RN-03
      trainingHours: input.trainingHours,
      ...(input.level ? { level: input.level } : {}),
      coverImage: normalizeCover(input.coverImage) ?? null,
      isDemo: false,
    };
    this.state.courses.push(course);
    this.state.modules.push({ id: `${id}-m1`, courseId: id, order: 1, title: 'Contenido del curso' });
    this.pushExam(id);
    this.save();
    return respond(course);
  }

  /**
   * Crea la evaluación de un curso que no tiene una activa, con la configuración de demostración y sin
   * preguntas (igual que al crear un curso). Conserva un único examen activo por curso (D1).
   */
  createCourseExam(courseId: string): Observable<Exam> {
    if (!this.course(courseId)) return fail('No se encontró el curso.');
    if (this.activeExam(courseId)) return fail('El curso ya tiene una evaluación activa.');
    const exam = this.pushExam(courseId);
    this.recompute(courseId);
    this.save();
    return respond(withAttemptRule(exam));
  }

  updateCourseById(courseId: string, patch: CourseRecordPatch): Observable<CourseRecord> {
    const error = this.applyCoursePatch(courseId, patch);
    return error ? fail(error) : respond(this.course(courseId)!);
  }

  updateCourse(patch: CoursePatch): Observable<Course> {
    const current = this.course(LEGACY_COURSE);
    if (!current) return fail('No se encontró el curso.');
    if (!(patch.trainingHours >= 1)) return fail('Las horas de formación deben ser al menos 1.');
    const error = this.applyCoursePatch(LEGACY_COURSE, { ...patch, coverImage: current.coverImage });
    return error ? fail(error) : respond(this.legacyCourse()!);
  }

  // ----- Curso principal (pantallas actuales) -----
  // Conservan sus validaciones (minutos enteros, mínimo de 1 video) y delegan en las operaciones por curso.
  saveVideo(input: VideoInput): Observable<Course> {
    const title = input.title.trim();
    if (!title) return fail('Ingresa el título del video.');
    // 20/11/2026: sin límite de duración; solo minutos enteros mayores que 0.
    if (!Number.isInteger(input.durationMin) || input.durationMin < 1 || input.durationMin * 60 > MAX_DURATION_SEC) {
      return fail('Ingresa la duración en minutos (número entero mayor que 0).');
    }
    const video = input.id ? this.courseVideos(LEGACY_COURSE).find((v) => v.id === input.id) : undefined;
    if (input.id && !video) return fail('No se encontró el video.');
    if (video?.published && !input.published && this.publishedVideos(LEGACY_COURSE).length - 1 < MIN_VIDEOS) {
      return fail('El curso necesita al menos 1 video publicado.');
    }
    const url = input.url?.trim() || undefined;
    // Si el enlace no cambió, se conserva la fuente (por ejemplo, un video de YouTube).
    const source = video && url === sourceUrl(video.source) ? video.source : this.legacySource(url);
    // 21/11/2026: tampoco aquí se registran videos nuevos sin fuente (los existentes sin fuente se conservan).
    if (source.kind === 'placeholder' && !(video && video.source.kind === 'placeholder')) return fail(VIDEO_SOURCE_REQUIRED);
    const error = this.applyVideo(LEGACY_COURSE, {
      id: input.id,
      title,
      description: input.description,
      durationSec: input.durationMin * 60,
      published: input.published,
      source,
    });
    return error ? fail(error) : respond(this.legacyCourse()!);
  }

  moveVideo(videoId: string, delta: -1 | 1): Observable<Course> {
    this.applyMove(LEGACY_COURSE, videoId, delta);
    return respond(this.legacyCourse()!);
  }

  setVideoPublished(videoId: string, published: boolean): Observable<Course> {
    const video = this.courseVideos(LEGACY_COURSE).find((v) => v.id === videoId);
    if (!video) return fail('No se encontró el video.');
    if (video.published && !published && this.publishedVideos(LEGACY_COURSE).length - 1 < MIN_VIDEOS) {
      return fail('El curso necesita al menos 1 video publicado.');
    }
    const error = this.applyPublished(LEGACY_COURSE, videoId, published);
    return error ? fail(error) : respond(this.legacyCourse()!);
  }

  deleteVideo(videoId: string): Observable<Course> {
    const videos = this.courseVideos(LEGACY_COURSE);
    if (videos.length - 1 < MIN_VIDEOS) {
      return fail('Un curso debe tener como mínimo 1 video.'); // RN-03
    }
    const video = videos.find((v) => v.id === videoId);
    if (!video) return fail('No se encontró el video.');
    if (video.published && this.publishedVideos(LEGACY_COURSE).length - 1 < MIN_VIDEOS) {
      return fail('El curso necesita al menos 1 video publicado.');
    }
    const error = this.applyDelete(LEGACY_COURSE, videoId);
    return error ? fail(error) : respond(this.legacyCourse()!);
  }

  updateExamConfig(config: ExamConfig): Observable<ExamConfig> {
    const exam = this.activeExam(LEGACY_COURSE);
    if (!exam) return fail('El curso no tiene un examen activo.');
    const error = this.applyExamConfig(exam, config);
    return error ? fail(error) : respond(examConfig(exam));
  }

  saveQuestion(question: Question): Observable<Question[]> {
    const exam = this.activeExam(LEGACY_COURSE);
    if (!exam) return fail('El curso no tiene un examen activo.');
    const error = this.applyQuestion(exam, question);
    return error ? fail(error) : respond(this.legacyQuestions());
  }

  deleteQuestion(questionId: string): Observable<Question[]> {
    const exam = this.activeExam(LEGACY_COURSE);
    if (!exam) return fail('El curso no tiene un examen activo.');
    const locked = this.examLockReason(exam);
    if (locked) return fail(locked);
    if (this.examQuestions(exam.id).length <= 1) return fail('El examen necesita al menos una pregunta.');
    const score = this.scoreGuard(exam, this.examQuestions(exam.id).filter((q) => q.id !== questionId));
    if (score) return fail(score);
    this.removeQuestion(exam, questionId);
    return respond(this.legacyQuestions());
  }

  // ----- Por curso (E5.1): las usará la administración de varios cursos -----
  unenrollParticipant(userId: string, courseId: string): Observable<Enrollment[]> {
    const enrollment = this.enrollment(userId, courseId);
    if (!enrollment) return fail('El participante no tiene este curso asignado.');
    const hasActivity =
      enrollment.completedVideoIds.length > 0 ||
      !!enrollment.startDate ||
      enrollment.status !== 'pendiente' ||
      this.attempts({ userId, courseId }).length > 0 ||
      this.certificates({ userId, courseId }).length > 0;
    if (hasActivity) {
      return fail('No se puede retirar el curso: el participante ya tiene avance, intentos o certificados en él.');
    }
    this.state.enrollments = this.state.enrollments.filter((e) => e !== enrollment);
    this.save();
    return respond(this.state.enrollments.filter((e) => e.userId === userId));
  }

  getPublicationCheck(courseId: string): Observable<PublicationCheck> {
    return this.course(courseId) ? respond(this.publicationCheck(courseId)) : fail('No se encontró el curso.');
  }

  saveCourseVideo(courseId: string, input: CourseVideoInput): Observable<CourseContent> {
    if (!this.course(courseId)) return fail('No se encontró el curso.');
    const video = input.id ? this.courseVideos(courseId).find((v) => v.id === input.id) : undefined;
    if (input.id && !video) return fail('No se encontró el video.');
    const url = input.url?.trim() ?? '';
    // Si el enlace no cambió, se conserva la fuente guardada.
    const source = video && url === (sourceUrl(video.source) ?? '') ? video.source : this.sourceFromUrl(url);
    if (!source) {
      return fail(
        isDriveHost(url)
          ? 'El enlace de Google Drive no corresponde a un archivo. Usa el enlace para compartir del video (drive.google.com/file/d/…).'
          : 'El enlace del video no es válido. Usa un enlace de YouTube, de Google Drive u otro enlace https.',
      );
    }
    // 21/11/2026: sin «Sin archivo». Un video nuevo (o uno con fuente) necesita enlace; uno existente sin fuente se conserva.
    if (source.kind === 'placeholder' && !(video && video.source.kind === 'placeholder')) return fail(VIDEO_SOURCE_REQUIRED);
    const mismatch = input.sourceKind ? sourceMismatch(input.sourceKind, source) : '';
    if (mismatch) return fail(mismatch);
    const { sourceKind: _choice, ...rest } = input;
    const error = this.applyVideo(courseId, { ...rest, source });
    return error ? fail(error) : respond(this.content(courseId, false));
  }

  moveCourseVideo(courseId: string, videoId: string, delta: -1 | 1): Observable<CourseContent> {
    if (!this.course(courseId)) return fail('No se encontró el curso.');
    if (!this.courseVideos(courseId).some((v) => v.id === videoId)) return fail('No se encontró el video.');
    this.applyMove(courseId, videoId, delta);
    return respond(this.content(courseId, false));
  }

  setCourseVideoPublished(courseId: string, videoId: string, published: boolean): Observable<CourseContent> {
    if (!this.course(courseId)) return fail('No se encontró el curso.');
    const error = this.applyPublished(courseId, videoId, published);
    return error ? fail(error) : respond(this.content(courseId, false));
  }

  deleteCourseVideo(courseId: string, videoId: string): Observable<CourseContent> {
    if (!this.course(courseId)) return fail('No se encontró el curso.');
    const error = this.applyDelete(courseId, videoId);
    return error ? fail(error) : respond(this.content(courseId, false));
  }

  // ----- Módulos del curso (M2) -----
  saveCourseModule(courseId: string, input: CourseModuleInput): Observable<CourseContent> {
    if (!this.course(courseId)) return fail('No se encontró el curso.');
    const title = input.title.trim();
    const description = input.description?.trim() ?? '';
    if (!title) return fail('Ingresa el nombre del módulo.');
    if (title.length > MODULE_TITLE_MAX) return fail(`El nombre del módulo admite como máximo ${MODULE_TITLE_MAX} caracteres.`);
    if (description.length > MODULE_DESCRIPTION_MAX) {
      return fail(`La descripción del módulo admite como máximo ${MODULE_DESCRIPTION_MAX} caracteres.`);
    }
    if (input.id) {
      const module = this.courseModules(courseId).find((m) => m.id === input.id);
      if (!module) return fail('No se encontró el módulo.');
      module.title = title;
      if (description) module.description = description;
      else delete module.description;
    } else {
      const order = this.courseModules(courseId).length + 1;
      this.state.modules.push({ id: this.newId('m'), courseId, order, title, ...(description ? { description } : {}) });
    }
    this.save();
    return respond(this.content(courseId, false));
  }

  moveCourseModule(courseId: string, moduleId: string, delta: -1 | 1): Observable<CourseContent> {
    if (!this.course(courseId)) return fail('No se encontró el curso.');
    const modules = this.courseModules(courseId);
    const i = modules.findIndex((m) => m.id === moduleId);
    if (i < 0) return fail('No se encontró el módulo.');
    const j = i + delta;
    if (j >= 0 && j < modules.length) {
      [modules[i], modules[j]] = [modules[j], modules[i]];
      modules.forEach((m, idx) => (m.order = idx + 1));
      this.save();
    }
    return respond(this.content(courseId, false));
  }

  deleteCourseModule(courseId: string, moduleId: string, targetModuleId?: string): Observable<CourseContent> {
    if (!this.course(courseId)) return fail('No se encontró el curso.');
    const modules = this.courseModules(courseId);
    const module = modules.find((m) => m.id === moduleId);
    if (!module) return fail('No se encontró el módulo.');
    if (modules.length === 1) return fail('El curso debe tener al menos un módulo.');
    const videos = this.courseVideos(courseId).filter((v) => v.moduleId === moduleId);
    if (videos.length) {
      if (!targetModuleId) return fail('Elige a qué módulo pasan los videos de este módulo antes de eliminarlo.');
      if (targetModuleId === moduleId || !modules.some((m) => m.id === targetModuleId)) {
        return fail('No se encontró el módulo de destino.');
      }
      // Los videos pasan al final del módulo de destino, conservando su orden, su publicación y el progreso.
      let next = Math.max(0, ...this.state.videos.filter((v) => v.moduleId === targetModuleId).map((v) => v.order));
      for (const v of videos) Object.assign(v, { moduleId: targetModuleId, order: ++next });
    }
    // 20/11/2026: sus clases en vivo pasan al módulo de destino o quedan sin módulo (nunca se borran).
    const target = targetModuleId && targetModuleId !== moduleId && modules.some((m) => m.id === targetModuleId) ? targetModuleId : null;
    for (const s of this.state.liveSessions.filter((x) => x.moduleId === moduleId)) s.moduleId = target;
    this.state.modules = this.state.modules.filter((m) => m.id !== moduleId);
    this.courseModules(courseId).forEach((m, idx) => (m.order = idx + 1));
    this.save();
    return respond(this.content(courseId, false));
  }

  assignCourseVideoToModule(courseId: string, videoId: string, moduleId: string): Observable<CourseContent> {
    if (!this.course(courseId)) return fail('No se encontró el curso.');
    const video = this.courseVideos(courseId).find((v) => v.id === videoId);
    if (!video) return fail('No se encontró el video.');
    if (!this.courseModules(courseId).some((m) => m.id === moduleId)) return fail('No se encontró el módulo.');
    if (video.moduleId !== moduleId) {
      const next = Math.max(0, ...this.state.videos.filter((v) => v.moduleId === moduleId).map((v) => v.order)) + 1;
      Object.assign(video, { moduleId, order: next });
      this.renumber(this.courseVideos(courseId));
      this.save();
    }
    return respond(this.content(courseId, false));
  }

  updateExamConfigById(examId: string, config: ExamConfig): Observable<Exam> {
    const exam = this.state.exams.find((e) => e.id === examId);
    if (!exam) return fail('No se encontró el examen.');
    const error = this.applyExamConfig(exam, config);
    return error ? fail(error) : respond(withAttemptRule(exam));
  }

  saveExamQuestion(examId: string, question: Question): Observable<ExamQuestion[]> {
    const exam = this.state.exams.find((e) => e.id === examId);
    if (!exam) return fail('No se encontró el examen.');
    const error = this.applyQuestion(exam, question);
    return error ? fail(error) : respond(this.examQuestions(examId));
  }

  deleteExamQuestion(examId: string, questionId: string): Observable<ExamQuestion[]> {
    const exam = this.state.exams.find((e) => e.id === examId);
    if (!exam) return fail('No se encontró el examen.');
    if (!this.examQuestions(examId).some((q) => q.id === questionId)) return fail('No se encontró la pregunta.');
    const locked = this.examLockReason(exam);
    if (locked) return fail(locked);
    // El examen activo de un curso publicado no puede quedarse sin preguntas (R5: ni uno de recuperación en uso).
    const live =
      examKind(exam) === 'recuperacion'
        ? this.recoveryExamInUse(exam)
        : exam.active && this.course(exam.courseId)?.status === 'publicado';
    if (live && this.examQuestions(examId).length <= 1) return fail('El examen necesita al menos una pregunta.');
    const score = this.scoreGuard(exam, this.examQuestions(examId).filter((q) => q.id !== questionId));
    if (score) return fail(score);
    this.removeQuestion(exam, questionId);
    return respond(this.examQuestions(examId));
  }

  // ================= Solo demostración =================
  resetDemo(): void {
    this.state = this.fresh();
    // Se guarda la semilla en v4 (en lugar de borrar la clave) para que v3 y v2 no se vuelvan a migrar.
    // v3 y v2 no se tocan.
    this.save();
    this.status = {
      source: 'seed',
      warning: '',
      migrationProblems: [],
      legacyStatePresent: this.read(LEGACY_STORAGE_KEY) !== null,
    };
  }

  getStorageStatus(): StorageStatus {
    return structuredClone(this.status);
  }

  removeLegacyState(): boolean {
    const raw = this.read(STORAGE_KEY);
    if (raw === null || !isDemoState(this.parse(raw))) return false;
    try {
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch {
      return false;
    }
    this.status = { ...this.status, legacyStatePresent: false };
    return true;
  }

  // ================= Internos: consultas =================
  private course(courseId: string): CourseRecord | undefined {
    return this.state.courses.find((c) => c.id === courseId);
  }

  private enrollment(userId: string, courseId: string): Enrollment | undefined {
    return this.state.enrollments.find((e) => e.userId === userId && e.courseId === courseId);
  }

  /**
   * Examen activo del curso. Etapa 2B, Bloque 2 (R3): solo regulares, para que un examen de recuperación nunca
   * desplace al regular (los exámenes sin tipo son regulares, así que con los datos actuales no cambia nada).
   */
  private activeExam(courseId: string): Exam | undefined {
    return this.regularExam(courseId);
  }

  /** Etapa 2B, Bloque 2 (R2): examen regular activo del curso (los exámenes sin tipo son regulares). */
  private regularExam(courseId: string): Exam | undefined {
    return this.state.exams.find((e) => e.courseId === courseId && e.active && examKind(e) === 'regular');
  }

  /** Etapa 2B, Bloque 2 (R2): inicio regular registrado de un estudiante en un examen (sin recuperación). */
  private registeredStart(userId: string, examId: string): ExamStart | undefined {
    return this.state.examStarts.find((s) => s.userId === userId && s.examId === examId && !s.recoveryId);
  }

  /**
   * Etapa 2B, Bloque 2 (R2): incorpora lo que otra pestaña del mismo navegador haya guardado (inicios, intentos…)
   * antes de una operación que no debe duplicarse. Cada operación guarda al terminar, así que el estado en memoria
   * nunca tiene cambios sin guardar que se pierdan. Si lo guardado no es un v4 válido, se conserva la memoria.
   */
  // ================= Internos: cierre por tiempo y no rendición (corrección de R3) =================
  /**
   * Antes de una operación o consulta pertinente: lee lo que otra pestaña haya guardado y cierra lo que ya venció.
   * Devuelve los intentos que se registraron automáticamente en esta llamada.
   */
  private sync(): Attempt[] {
    this.refreshFromStorage();
    return this.settle();
  }

  /**
   * Corrección de R3. Sin un servidor que ejecute tareas programadas, el repositorio constata los vencimientos cuando
   * vuelve a procesar una operación o consulta. Es idempotente (cada cosa se marca una sola vez) y solo guarda si
   * cambió algo, así que leer datos sin vencimientos pendientes no los reescribe:
   * - Examen iniciado (regular o recuperación) cuyo tiempo terminó sin entrega: se entrega automáticamente con las
   *   respuestas guardadas en el repositorio (nunca se inventan). Sin respuestas, nota 0; con preguntas abiertas,
   *   «En revisión». No es una ausencia. El intento (regular o de recuperación) sigue las reglas de siempre:
   *   condición del estudiante y certificado si aprueba (R4: la recuperación es la nota vigente).
   * - Recuperación autorizada que cerró sin iniciarse: se registra `noShowAt` («No rindió recuperación»), sin intento
   *   ni nota.
   */
  private settle(): Attempt[] {
    const now = Date.now();
    const closed: Attempt[] = [];
    let changed = false;
    for (const start of this.state.examStarts) {
      if (start.closedAt || now < Date.parse(start.endsAt) + TIMEOUT_TOLERANCE_SEC * 1000) continue;
      start.closedAt = limaIso(now);
      changed = true;
      const exam = this.state.exams.find((e) => e.id === start.examId);
      const user = this.state.users.find((u) => u.id === start.userId);
      if (!exam || !user) continue;
      const recovery = start.recoveryId ? this.state.recoveries.find((r) => r.id === start.recoveryId) : undefined;
      if (start.recoveryId && (!recovery || recovery.attemptId || recovery.cancelledAt)) continue;
      // RN-07: si ya tenía su intento regular por otra vía (datos anteriores), no se registra otro.
      if (!recovery && this.attempts({ userId: user.id, examId: exam.id }).some((a) => a.kind !== 'recuperacion')) continue;
      const durationSec = Math.round((Date.parse(start.endsAt) - Date.parse(start.startedAt)) / 1000);
      const attempt = this.recordAttempt(
        user,
        exam,
        start.answers ?? {},
        durationSec,
        recovery ? { kind: 'recuperacion', recoveryId: recovery.id, autoSubmitted: true } : { autoSubmitted: true },
        true, // R4: la recuperación entregada es la nota vigente (condición y certificado como el regular)
      );
      start.attemptId = attempt.id;
      if (recovery) recovery.attemptId = attempt.id;
      closed.push(attempt);
    }
    for (const r of this.state.recoveries) {
      if (r.cancelledAt || r.startedAt || r.attemptId || r.noShowAt) continue;
      if (now >= Date.parse(r.closesAt)) {
        r.noShowAt = limaIso(now);
        changed = true;
        // R4: sin más oportunidades, la condición final es «desaprobado». Quien desaprobó el regular ya lo estaba y
        // conserva su nota; el ausente queda desaprobado sin nota (no se crea intento ni nota).
        const enrollment = this.enrollment(r.userId, r.courseId);
        if (enrollment && enrollment.status !== 'aprobado' && enrollment.status !== 'en_revision') enrollment.status = 'desaprobado';
      }
    }
    if (changed) this.save();
    return closed;
  }

  /**
   * Registra un intento calificado con la regla proporcional (Bloque 1), sin guardar. `applyOutcome`: estado de la
   * inscripción y certificado (R4: también la recuperación, que reemplaza a la regular como nota vigente).
   */
  private recordAttempt(
    user: User,
    exam: Exam,
    answers: Record<string, string[]>,
    durationSec: number,
    extra: Pick<Attempt, 'kind' | 'recoveryId' | 'autoSubmitted'>,
    applyOutcome: boolean,
  ): Attempt {
    const questions = this.examQuestions(exam.id);
    const cleanAnswers = this.cleanAnswers(questions, answers);
    // D1: todos los intentos nuevos se califican con la regla proporcional y la guardan (D4).
    const gradingRule: GradingRule = 'proporcional';
    const { earned, totalPoints, correctCount, questionScores } = this.grade(questions, cleanAnswers, gradingRule);
    // M5: con preguntas abiertas el intento queda «En revisión»: sin nota definitiva, sin aprobado ni certificado.
    const pendingReview = questions.some((q) => q.type === 'open');
    const score = pendingReview ? 0 : totalPoints ? Math.round((earned / totalPoints) * exam.scaleMax) : 0;
    const passed = !pendingReview && score >= exam.passScore;
    const attempt: Attempt = {
      id: this.newId('att'),
      userId: user.id,
      courseId: exam.courseId,
      examId: exam.id,
      date: new Date(Date.now()).toISOString(),
      durationSec,
      score,
      scaleMax: exam.scaleMax,
      correctCount,
      totalQuestions: questions.length,
      passed,
      answers: cleanAnswers,
      gradingRule,
      questionScores,
      maxPoints: totalPoints,
      ...extra,
      ...(pendingReview ? { review: { status: 'en_revision' as const, manualScores: {} } } : {}),
    };
    this.state.attempts.push(attempt);
    const enrollment = this.enrollment(user.id, exam.courseId);
    const course = this.course(exam.courseId);
    if (applyOutcome && enrollment) {
      enrollment.status = pendingReview ? 'en_revision' : passed ? 'aprobado' : 'desaprobado';
      if (passed && course) this.issueCertificate(user, course, attempt);
    }
    return attempt;
  }

  /** Marca el inicio como entregado (una sola vez). */
  private closeStart(start: ExamStart | undefined, attempt: Attempt): void {
    if (!start || start.closedAt) return;
    start.closedAt = limaIso(Date.now());
    start.attemptId = attempt.id;
  }

  /** Inicio abierto del estudiante en el curso: el de su recuperación no anulada o, si no tiene, el del regular. */
  private openStart(userId: string, courseId: string): ExamStart | undefined {
    const recovery = this.currentRecovery(userId, courseId);
    if (recovery) return this.recoveryStart(recovery);
    const regular = this.regularExam(courseId);
    return regular ? this.registeredStart(userId, regular.id) : undefined;
  }

  /**
   * Entrega de la recuperación: con el inicio registrado, del examen de la recuperación y una sola vez. Se puede
   * entregar después del cierre de la ventana si se inició a tiempo (regla E). Es la nota vigente: actualiza la condición y el
   * certificado (R4).
   */
  private submitRecovery(
    userId: string,
    exam: Exam,
    recovery: Recovery,
    answers: Record<string, string[]>,
    durationSec: number,
    mode: SubmitMode,
  ): Observable<Attempt> {
    if (exam.id !== recovery.examId) return fail('Este examen no corresponde a tu recuperación.');
    const start = this.recoveryStart(recovery);
    if (recovery.attemptId || start?.closedAt) return fail('Tu recuperación ya fue entregada.');
    if (!start || !recovery.startedAt) return fail('Debes iniciar la recuperación antes de entregarla.');
    const user = this.state.users.find((u) => u.id === userId);
    if (!user || !this.enrollment(userId, exam.courseId)) return fail('No tienes un curso asignado.');
    const questions = this.examQuestions(exam.id);
    const submission = this.submissionError(exam, questions, answers, durationSec, mode, start);
    if (submission) return fail(submission);
    // Por tiempo agotado se califican solo las respuestas guardadas en el repositorio.
    const graded = mode === 'tiempo' ? (start.answers ?? {}) : answers;
    // R4: la nota de la recuperación reemplaza a la regular como vigente (aunque sea menor): actualiza la condición y,
    // si aprueba, emite el certificado con esta nota (D-11). El intento regular no se toca.
    const attempt = this.recordAttempt(user, exam, graded, durationSec, { kind: 'recuperacion', recoveryId: recovery.id }, true);
    recovery.attemptId = attempt.id;
    this.closeStart(start, attempt);
    this.save();
    return respond(attempt);
  }

  // ================= Internos: recuperaciones (Etapa 2B, Bloque 2, R3) =================
  /** Solo el perfil Instructor gestiona recuperaciones. */
  private instructorError(instructorId: string, verb: 'autorizar' | 'anular'): string {
    const actor = this.state.users.find((u) => u.id === instructorId);
    return actor?.role === 'instructor' ? '' : `Solo el Instructor puede ${verb} recuperaciones.`;
  }

  /** La recuperación no anulada del estudiante en el curso (como máximo una). */
  private currentRecovery(userId: string, courseId: string): Recovery | undefined {
    return this.state.recoveries.find((r) => r.userId === userId && r.courseId === courseId && !r.cancelledAt);
  }

  /** Inicio registrado de una recuperación. */
  private recoveryStart(recovery: Recovery): ExamStart | undefined {
    return this.state.examStarts.find((s) => s.recoveryId === recovery.id);
  }

  /**
   * «No rindió recuperación» (corrección de R3): el registro permanente `noShowAt`, que `settle` guarda una sola vez
   * cuando la ventana cierra sin inicio. Una recuperación iniciada nunca es «no rindió»: se entrega (por el
   * estudiante o automáticamente) y queda «rendida». Por seguridad, una vencida sin inicio todavía no constatada
   * también cuenta como no rendida (las operaciones públicas la constatan antes de llegar aquí).
   */
  private recoveryNoShow(recovery: Recovery): boolean {
    if (recovery.noShowAt) return true;
    return !recovery.startedAt && !recovery.attemptId && Date.now() >= Date.parse(recovery.closesAt);
  }

  /**
   * Quién puede recibir una recuperación (decisión del 20/11/2026, igual que el servidor): SOLO quien desaprobó el
   * examen regular (intento calificado y no aprobado). Sin intento regular calificado no corresponde.
   */
  private recoveryEligibility(userId: string, courseId: string): { reason: RecoveryReason } | { error: string } {
    const user = this.state.users.find((u) => u.id === userId);
    const enrollment = this.enrollment(userId, courseId);
    if (!user || user.role !== 'participant' || !enrollment) return { error: 'El estudiante no está inscrito en este curso.' };
    const regular = this.regularExam(courseId);
    if (!regular) return { error: 'El curso no tiene un examen activo.' };
    const attempts = this.attempts({ userId, examId: regular.id }).sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
    const last = attempts[0];
    if (last) {
      if (isPendingReview(last)) return { error: 'El examen regular del estudiante está pendiente de calificación.' };
      if (last.passed) return { error: 'El estudiante aprobó el examen regular: no corresponde una recuperación.' };
      return { reason: 'desaprobado' };
    }
    if (enrollment.status === 'aprobado') return { error: 'El estudiante aprobó el examen regular: no corresponde una recuperación.' };
    // Corrección de R3 (regla A): un examen regular iniciado nunca es una ausencia. Si su tiempo terminó, `settle`
    // ya lo entregó con sus respuestas guardadas (y aquí se ve el intento); si no, lo está rindiendo.
    const start = this.registeredStart(userId, regular.id);
    if (start && !start.closedAt) return { error: 'El estudiante está rindiendo el examen regular en este momento.' };
    return { error: 'El estudiante no ha rendido el examen regular: la recuperación solo se autoriza a quien lo desaprobó.' };

  }

  /**
   * Decisión del 20/11/2026: la recuperación se rinde SIEMPRE con el examen original del curso (sin duplicarlo ni
   * modificarlo: RN-15). La modalidad «independiente» ya no se autoriza; las recuperaciones históricas se leen igual.
   */
  private recoveryExamFor(input: RecoveryInput, regular: Exam): Exam | string {
    if ((input.mode && input.mode !== 'original') || (input.recoveryExamId && input.recoveryExamId !== regular.id)) {
      return 'Las recuperaciones solo se rinden con el examen original del curso.';
    }
    return regular;
  }

  /** El examen de la recuperación se puede rendir: tiene preguntas y su suma coincide con la nota máxima (2A). */
  private recoveryExamReason(exam: Exam): string {
    if (this.examQuestions(exam.id).length === 0) return 'El examen de recuperación aún no tiene preguntas.';
    const mismatch = this.scoreMismatch(exam);
    if (mismatch && !mismatch.grandfathered) return `El examen de recuperación no cumple la suma de puntajes. ${mismatch.message}`;
    return '';
  }

  /**
   * Ventana de la recuperación: apertura y cierre con zona horaria explícita, cierre posterior a la apertura y a
   * la hora actual. Corrección final de R3: la ventana solo controla cuándo se puede INICIAR, así que puede ser más
   * corta que el examen; quien inicia a tiempo tiene la duración completa desde su inicio registrado.
   */
  private recoveryWindow(opensAt: string, closesAt: string): { opens: number; closes: number } | string {
    const opens = parseInstant(opensAt);
    const closes = parseInstant(closesAt);
    if (opens === null || closes === null) {
      return 'Indica la fecha y hora de apertura y de cierre de la recuperación (con su zona horaria).';
    }
    if (closes <= opens) return 'La fecha y hora de cierre deben ser posteriores a la apertura.';
    if (closes <= Date.now()) return 'La fecha y hora de cierre ya pasaron.';
    return { opens, closes };
  }

  /** Situación de recuperación del estudiante en el curso (se calcula; no se guarda). */
  private recoveryState(userId: string, courseId: string): RecoveryState {
    const base = { userId, courseId };
    const current = this.currentRecovery(userId, courseId);
    if (current) {
      if (current.attemptId) return { ...base, status: 'rendida', reason: 'Recuperación rendida.', recovery: current };
      if (this.recoveryNoShow(current)) {
        return { ...base, status: 'no_rindio', reason: 'No rindió la recuperación.', recovery: current };
      }
      const reason = current.startedAt
        ? 'Recuperación en curso.'
        : Date.now() < Date.parse(current.opensAt)
          ? `Disponible desde el ${limaLabel(current.opensAt)} (hora de Lima).`
          : `Disponible hasta el ${limaLabel(current.closesAt)} (hora de Lima).`;
      return { ...base, status: 'autorizada', reason, recovery: current };
    }
    const cancelled = this.state.recoveries.filter((r) => r.userId === userId && r.courseId === courseId && r.cancelledAt).at(-1) ?? null;
    const eligibility = this.recoveryEligibility(userId, courseId);
    if ('error' in eligibility) return { ...base, status: null, reason: eligibility.error, recovery: cancelled };
    const reason = eligibility.reason === 'desaprobado' ? 'Desaprobó el examen regular.' : 'No rindió el examen regular.';
    return { ...base, status: cancelled ? 'anulada' : 'pendiente', reason, recovery: cancelled };
  }

  /**
   * Disponibilidad con una recuperación no anulada: el examen regular queda cerrado para el estudiante y solo puede
   * rendir la recuperación dentro de su ventana, con los requisitos de siempre (curso publicado, RN-03, RN-11 y suma
   * exacta del examen que se rinde). Un solo intento de recuperación.
   */
  private recoveryAvailability(userId: string, courseId: string, recovery: Recovery): ExamAvailability {
    const base = { examId: recovery.examId, maxAttempts: MAX_ATTEMPTS, remainingAttempts: recovery.attemptId ? 0 : MAX_ATTEMPTS };
    const block = (reason: string): ExamAvailability => ({ ...base, available: false, reason });
    const enrollment = this.enrollment(userId, courseId);
    if (!enrollment || !this.state.users.some((u) => u.id === userId)) return block('No tienes un curso asignado.');
    if (recovery.attemptId) return block('Ya rendiste tu recuperación.');
    // Corrección de R3: sin inicio, el cierre impide empezar (registro permanente); iniciada, sigue disponible hasta
    // que termine su propio tiempo, aunque la ventana ya haya cerrado (regla E).
    if (this.recoveryNoShow(recovery)) return block('El plazo de tu recuperación terminó sin que la iniciaras.');
    if (!recovery.startedAt && Date.now() < Date.parse(recovery.opensAt)) {
      return block(`Tu recuperación estará disponible desde el ${limaLabel(recovery.opensAt)} (hora de Lima).`);
    }
    const course = this.course(courseId);
    if (!course || course.status !== 'publicado') {
      return block('El curso está en borrador: la recuperación se habilitará cuando el curso se publique.');
    }
    const issues = this.ruleIssues(courseId);
    if (issues.length) return block(`El curso no cumple las reglas de videos (RN-03): ${issues.join(' ')}`);
    const exam = this.state.exams.find((e) => e.id === recovery.examId);
    if (!exam) return block('No se encontró el examen de la recuperación.');
    const examReason = this.recoveryExamReason(exam);
    if (examReason) return block(examReason);
    if (this.completedPublished(enrollment) < this.publishedVideos(courseId).length) {
      return block('Debes completar todos los videos antes de rendir el examen.'); // RN-11
    }
    return { ...base, available: true, reason: '' };
  }

  /**
   * Inicio de la recuperación (dentro de su ventana). Un solo inicio por recuperación: otra pestaña o una recarga
   * recuperan el mismo, con sus respuestas guardadas. Corrección de R3 (regla E): el cierre de la ventana solo
   * limita el inicio; el examen dura lo configurado aunque termine después del cierre. Desde el inicio ya no se
   * puede anular.
   */
  private startRecovery(userId: string, courseId: string, recovery: Recovery): Observable<StartedExam> {
    const availability = this.recoveryAvailability(userId, courseId, recovery);
    if (!availability.available) return fail(availability.reason);
    const exam = this.state.exams.find((e) => e.id === recovery.examId);
    if (!exam) return fail('No se encontró el examen de la recuperación.');
    let start = this.recoveryStart(recovery);
    if (!start) {
      const now = Date.now();
      start = {
        userId,
        examId: exam.id,
        recoveryId: recovery.id,
        startedAt: limaIso(now),
        endsAt: limaIso(now + exam.timeMinutes * 60_000),
      };
      this.state.examStarts.push(start);
      recovery.startedAt = start.startedAt;
      this.save();
    }
    return respond({ exam: withAttemptRule(exam), startedAt: start.startedAt, endsAt: start.endsAt, answers: start.answers ?? {} });
  }

  private refreshFromStorage(): void {
    const raw = this.read(STORAGE_KEY);
    if (raw === null) return;
    const parsed = this.parse(raw);
    if (isDemoState(parsed)) this.state = normalizeDemoState(parsed);
  }

  private examQuestions(examId: string): ExamQuestion[] {
    return this.state.questions.filter((q) => q.examId === examId);
  }

  private attempts(filter: AttemptFilter): Attempt[] {
    return this.state.attempts.filter(
      (a) =>
        (!filter.userId || a.userId === filter.userId) &&
        (!filter.courseId || a.courseId === filter.courseId) &&
        (!filter.examId || a.examId === filter.examId),
    );
  }

  private certificates(filter: EnrollmentFilter): Certificate[] {
    return this.state.certificates.filter(
      (c) => (!filter.userId || c.userId === filter.userId) && (!filter.courseId || c.courseId === filter.courseId),
    );
  }

  /** Módulos del curso en orden (referencias al estado, para poder modificarlos). */
  private courseModules(courseId: string): CourseModule[] {
    return this.state.modules.filter((m) => m.courseId === courseId).sort((a, b) => a.order - b.order);
  }

  /** Videos del curso en orden: por módulo y luego por orden dentro del módulo. */
  private courseVideos(courseId: string): VideoRecord[] {
    const moduleOrder = new Map(
      this.state.modules.filter((m) => m.courseId === courseId).map((m) => [m.id, m.order]),
    );
    return this.state.videos
      .filter((v) => v.courseId === courseId)
      .sort((a, b) => (moduleOrder.get(a.moduleId) ?? 0) - (moduleOrder.get(b.moduleId) ?? 0) || a.order - b.order);
  }

  private publishedVideos(courseId: string): VideoRecord[] {
    return this.courseVideos(courseId).filter((v) => v.published);
  }

  private completedPublished(e: Enrollment): number {
    const ids = new Set(this.publishedVideos(e.courseId).map((v) => v.id));
    return e.completedVideoIds.filter((id) => ids.has(id)).length;
  }

  private content(courseId: string, onlyPublished: boolean): CourseContent {
    const videos = onlyPublished ? this.publishedVideos(courseId) : this.courseVideos(courseId);
    const modules = this.state.modules
      .filter((m) => m.courseId === courseId)
      .sort((a, b) => a.order - b.order)
      .map((m) => ({ ...m, videos: videos.filter((v) => v.moduleId === m.id) }))
      .filter((m) => !onlyPublished || m.videos.length > 0);
    return { course: this.course(courseId)!, modules, ruleIssues: this.ruleIssues(courseId) };
  }

  private visibleToParticipant(course: CourseRecord): boolean {
    return course.status === 'publicado' || DEMO_CONFIG.showDraftCoursesToParticipants;
  }

  /** Cadena vacía si el alumno puede acceder al curso. Protección visual: la real va en el backend. */
  private accessError(userId: string, courseId: string, notEnrolled = 'No tienes acceso a este curso.'): string {
    const course = this.course(courseId);
    if (!course) return 'No se encontró el curso.';
    if (!this.enrollment(userId, courseId)) return notEnrolled;
    if (!this.visibleToParticipant(course)) return 'Este curso aún no está disponible.';
    return '';
  }

  /**
   * RN-03 según el estado del curso (19/11/2026, igual que el backend): en borrador, la regla para publicar (módulo
   * por módulo); ya publicado, la regla de acceso, para no bloquear de forma retroactiva a sus participantes.
   */
  private ruleIssues(courseId: string): string[] {
    return this.course(courseId)?.status === 'publicado' ? this.accessRuleIssues(courseId) : this.moduleRuleIssues(courseId);
  }

  /** Curso ya publicado: al menos 1 video publicado en total; sin máximo y sin límite de duración. */
  private accessRuleIssues(courseId: string): string[] {
    const count = this.publishedVideos(courseId).length;
    return count < MIN_VIDEOS ? ['El curso no tiene videos publicados; se requiere al menos 1 video publicado.'] : [];
  }

  /** Para publicar: cada módulo necesita al menos 1 video publicado propio (21/11/2026); sin máximo y sin límite de duración. */
  private moduleRuleIssues(courseId: string): string[] {
    const published = this.publishedVideos(courseId);
    return this.courseModules(courseId).flatMap((m, i) => {
      const count = published.filter((v) => v.moduleId === m.id).length;
      return count < MIN_VIDEOS
        ? [`Módulo ${i + 1} «${m.title}»: no tiene videos publicados; se requiere al menos 1 video publicado por módulo.`]
        : [];
    });
  }

  /** Motivo por el que el curso no admite rendir el examen (cadena vacía si lo admite). */
  private examBlockReason(courseId: string): string {
    const course = this.course(courseId);
    if (!course) return 'No se encontró el curso.';
    if (course.status !== 'publicado') {
      return 'El curso está en borrador: el examen se habilitará cuando el curso se publique.';
    }
    const issues = this.ruleIssues(courseId);
    if (issues.length) return `El curso no cumple las reglas de videos (RN-03): ${issues.join(' ')}`;
    const exam = this.activeExam(courseId);
    if (!exam) return 'El curso no tiene un examen activo.';
    if (this.examQuestions(exam.id).length === 0) return 'El examen aún no tiene preguntas.';
    // Etapa 2A: no se rinde un examen cuya suma de puntajes no coincide con la nota máxima (salvo los ya rendidos, RN-15).
    const mismatch = this.scoreMismatch(exam);
    if (mismatch && !mismatch.grandfathered) {
      return 'El examen todavía no está disponible: la suma de los puntajes de sus preguntas no coincide con la nota máxima.';
    }
    return '';
  }

  private availability(userId: string, courseId: string): ExamAvailability {
    // Etapa 2B, Bloque 2 (R3): con una recuperación no anulada, el estudiante ya no rinde el examen regular, sino
    // la recuperación dentro de su ventana.
    const recovery = this.currentRecovery(userId, courseId);
    if (recovery) return this.recoveryAvailability(userId, courseId, recovery);
    const exam = this.activeExam(courseId);
    // Un solo intento por examen: se usa la regla, nunca el valor guardado (los datos antiguos traen 2).
    const maxAttempts = exam ? MAX_ATTEMPTS : 0;
    const used = exam ? this.attempts({ userId, examId: exam.id }).length : 0;
    const base = { examId: exam?.id ?? null, maxAttempts, remainingAttempts: Math.max(0, maxAttempts - used) };
    const block = (reason: string): ExamAvailability => ({ ...base, available: false, reason });

    const enrollment = this.enrollment(userId, courseId);
    if (!enrollment || !this.state.users.some((u) => u.id === userId)) return block('No tienes un curso asignado.');
    const reason = this.examBlockReason(courseId);
    if (reason) return block(reason);
    if (this.completedPublished(enrollment) < this.publishedVideos(courseId).length) {
      return block('Debes completar todos los videos antes de rendir el examen.'); // RN-11
    }
    if (enrollment.status === 'aprobado') return block('Ya aprobaste este examen.');
    if (enrollment.status === 'en_revision') {
      return block('Tu evaluación está en revisión: el resultado se mostrará cuando el instructor termine de calificarla.');
    }
    if (base.remainingAttempts <= 0) return block('Alcanzaste el límite de intentos permitidos.'); // RN-07
    return { ...base, available: true, reason: '' };
  }

  // ================= Internos: vista heredada =================
  private legacyCourse(): Course | null {
    const course = this.course(LEGACY_COURSE);
    if (!course) return null;
    const videos: Video[] = this.courseVideos(LEGACY_COURSE).map((v, idx) => ({
      id: v.id,
      order: idx + 1,
      title: v.title,
      ...(v.description ? { description: v.description } : {}),
      durationMin: Math.round(v.durationSec / 60),
      published: v.published,
      ...(sourceUrl(v.source) ? { url: sourceUrl(v.source) } : {}),
    }));
    return {
      id: course.id,
      name: course.name,
      description: course.description,
      status: course.status,
      trainingHours: course.trainingHours ?? 0,
      videos,
    };
  }

  private legacyQuestions(): Question[] {
    const exam = this.activeExam(LEGACY_COURSE);
    return exam ? this.examQuestions(exam.id).map(plainQuestion) : [];
  }

  private legacySource(url: string | undefined): VideoSource {
    return url ? { kind: 'url', url } : { kind: 'placeholder' };
  }

  // ================= Internos: escritura =================
  private newId(prefix: string): string {
    return `${prefix}-${Date.now()}-${++this.seq}`;
  }

  private firstModuleId(courseId: string): string {
    const first = this.state.modules.filter((m) => m.courseId === courseId).sort((a, b) => a.order - b.order)[0];
    if (first) return first.id;
    const id = `${courseId}-m1`;
    this.state.modules.push({ id, courseId, order: 1, title: 'Contenido del curso' });
    return id;
  }

  /** Numera los videos según su posición, dentro de cada módulo. */
  private renumber(videos: VideoRecord[]): void {
    const counters = new Map<string, number>();
    for (const v of videos) {
      const n = (counters.get(v.moduleId) ?? 0) + 1;
      counters.set(v.moduleId, n);
      v.order = n;
    }
  }

  /** Agrega el examen activo de un curso: `<curso>-e1` si está libre; si no, un identificador nuevo. */
  private pushExam(courseId: string): Exam {
    const preferred = `${courseId}-e1`;
    const id = this.state.exams.some((e) => e.id === preferred) ? this.newId('e') : preferred;
    const exam: Exam = { id, courseId, title: 'Examen del curso', active: true, ...DEMO_CONFIG.exam };
    this.state.exams.push(exam);
    return exam;
  }

  /**
   * Si el curso está publicado, el cambio no puede romper la regla de acceso de RN-03 (al menos 1 video publicado
   * en total). El mínimo POR MÓDULO se exige al publicar desde borrador (19/11/2026). Sin límite de duración (20/11/2026).
   */
  private publishedCourseGuard(courseId: string, videoId: string | null, published: boolean): string {
    if (this.course(courseId)?.status !== 'publicado') return '';
    const others = this.publishedVideos(courseId).filter((v) => v.id !== videoId).length;
    return others + (published ? 1 : 0) < MIN_VIDEOS ? 'El curso necesita al menos 1 video publicado.' : '';
  }

  /** Enlace vacío = sin archivo; YouTube; archivo de Google Drive; otro enlace https. null si no es válido. */
  private sourceFromUrl(url: string): VideoSource | null {
    if (!url) return { kind: 'placeholder' };
    const videoId = parseYouTubeId(url);
    if (videoId) return { kind: 'youtube', videoId };
    const fileId = parseDriveFileId(url);
    if (fileId) return { kind: 'drive', fileId };
    // Un enlace de Drive que no es de un archivo (carpeta, documento) no se acepta como enlace genérico.
    if (isDriveHost(url)) return null;
    return /^https:\/\/\S+$/i.test(url) ? { kind: 'url', url } : null;
  }

  /** Alta o edición de un video del curso. Devuelve un mensaje de error, o cadena vacía si se aplicó. */
  private applyVideo(courseId: string, input: Omit<CourseVideoInput, 'url'> & { source: VideoSource }): string {
    const title = input.title.trim();
    if (!title) return 'Ingresa el título del video.';
    if (!Number.isInteger(input.durationSec) || input.durationSec < 1 || input.durationSec > MAX_DURATION_SEC) {
      return 'Ingresa la duración real del video en segundos (número entero mayor que 0).';
    }
    const videos = this.courseVideos(courseId);
    const video = input.id ? videos.find((v) => v.id === input.id) : undefined;
    if (input.id && !video) return 'No se encontró el video.';
    // 19/11/2026: sin máximo de videos por curso ni por módulo (RN-03 exige un mínimo por módulo al publicar).
    let moduleId = video?.moduleId ?? this.firstModuleId(courseId);
    if (input.moduleId) {
      if (!this.state.modules.some((m) => m.id === input.moduleId && m.courseId === courseId)) {
        return 'No se encontró el módulo.';
      }
      moduleId = input.moduleId;
    }
    const guard = this.publishedCourseGuard(courseId, video?.id ?? null, input.published);
    if (guard) return guard;

    const data = {
      title,
      description: input.description?.trim() || undefined,
      durationSec: input.durationSec,
      published: input.published,
      source: input.source,
    };
    const nextOrder = () =>
      Math.max(0, ...videos.filter((v) => v.moduleId === moduleId && v.id !== video?.id).map((v) => v.order)) + 1;
    if (video && video.moduleId !== moduleId) {
      Object.assign(video, data, { moduleId, order: nextOrder() });
      this.renumber(this.courseVideos(courseId));
    } else if (video) {
      Object.assign(video, data);
    } else {
      this.state.videos.push({ id: this.newId('v'), courseId, moduleId, order: nextOrder(), ...data });
    }
    this.recompute(courseId);
    this.save();
    return '';
  }

  /** Reordena dentro de un mismo módulo; fuera de los límites no hace nada. */
  private applyMove(courseId: string, videoId: string, delta: -1 | 1): void {
    const videos = this.courseVideos(courseId);
    const i = videos.findIndex((v) => v.id === videoId);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= videos.length || videos[i].moduleId !== videos[j].moduleId) return;
    [videos[i], videos[j]] = [videos[j], videos[i]];
    this.renumber(videos);
    this.save();
  }

  private applyPublished(courseId: string, videoId: string, published: boolean): string {
    const video = this.courseVideos(courseId).find((v) => v.id === videoId);
    if (!video) return 'No se encontró el video.';
    const guard = this.publishedCourseGuard(courseId, video.id, published);
    if (guard) return guard;
    video.published = published;
    this.recompute(courseId);
    this.save();
    return '';
  }

  /** Elimina el video y lo quita del progreso de ese curso (intentos y certificados no cambian). */
  private applyDelete(courseId: string, videoId: string): string {
    const videos = this.courseVideos(courseId);
    const video = videos.find((v) => v.id === videoId);
    if (!video) return 'No se encontró el video.';
    const guard = this.publishedCourseGuard(courseId, video.id, false);
    if (guard) return guard;
    this.state.videos = this.state.videos.filter((v) => v.id !== videoId);
    this.renumber(videos.filter((v) => v.id !== videoId));
    this.state.enrollments
      .filter((e) => e.courseId === courseId)
      .forEach((e) => (e.completedVideoIds = e.completedVideoIds.filter((id) => id !== videoId)));
    this.recompute(courseId);
    this.save();
    return '';
  }

  /** RN-15: con al menos un intento registrado, el examen no admite cambios (configuración ni preguntas). */
  private examLockReason(exam: Exam): string {
    return this.attempts({ examId: exam.id }).length > 0 ? EXAM_LOCKED_MESSAGE : '';
  }

  /**
   * Etapa 2A: con el curso publicado (examen activo «en vivo»), un cambio no puede dejar la suma de puntajes distinta
   * de la escala. En borrador se permite editar libremente (la pantalla informa el total). Cadena vacía si se permite.
   */
  private scoreGuard(exam: Exam, questionsAfter: readonly Pick<Question, 'points'>[], scaleMax = exam.scaleMax): string {
    // R5: un examen de recuperación está «en uso» mientras una recuperación pendiente lo tenga asignado.
    if (examKind(exam) === 'recuperacion') {
      if (!this.recoveryExamInUse(exam)) return '';
      const distribution = scoreDistribution(questionsAfter, scaleMax);
      return distribution.valid
        ? ''
        : `No se puede guardar este cambio: el examen de recuperación está asignado a una recuperación. ${distribution.message}`;
    }
    const live = exam.active && this.course(exam.courseId)?.status === 'publicado';
    if (!live) return '';
    const distribution = scoreDistribution(questionsAfter, scaleMax);
    return distribution.valid
      ? ''
      : `No se puede guardar este cambio con el curso publicado. ${distribution.message} Para reorganizar los puntajes, pasa el curso a borrador.`;
  }

  /** R5: alguna recuperación todavía por rendir (no anulada, sin intento ni «no rindió») usa este examen. */
  private recoveryExamInUse(exam: Exam): boolean {
    return this.state.recoveries.some((r) => r.examId === exam.id && !r.cancelledAt && !r.attemptId && !r.noShowAt);
  }

  /**
   * Etapa 2A: la suma de puntajes del examen no coincide con su escala. Las evaluaciones con intentos registrados se
   * conservan como están (RN-15): para ellas no se aplica la regla nueva, solo se informa.
   */
  private scoreMismatch(exam: Exam): { message: string; grandfathered: boolean } | null {
    const distribution = scoreDistribution(this.examQuestions(exam.id), exam.scaleMax);
    if (distribution.valid) return null;
    return { message: distribution.message, grandfathered: this.attempts({ examId: exam.id }).length > 0 };
  }

  private applyExamConfig(exam: Exam, config: ExamConfig): string {
    // R5: la configuración académica de un examen de recuperación se hereda del original y no se cambia aparte.
    if (examKind(exam) === 'recuperacion') {
      return 'La configuración de un examen de recuperación se hereda del examen original y no se puede modificar.';
    }
    const locked = this.examLockReason(exam);
    if (locked) return locked;
    if (!Number.isInteger(config.timeMinutes) || config.timeMinutes < 1 || config.timeMinutes > 240) {
      return 'El tiempo debe estar entre 1 y 240 minutos.';
    }
    if (config.scaleMax !== 20 && config.scaleMax !== 100) return 'La escala de nota debe ser 20 o 100.';
    if (!(config.passScore >= 0 && config.passScore <= config.scaleMax)) {
      return `La nota mínima debe estar entre 0 y ${config.scaleMax}.`;
    }
    if (config.maxAttempts !== MAX_ATTEMPTS) {
      return 'Cada alumno tiene un solo intento por examen: los intentos permitidos deben ser 1.';
    }
    // Etapa 2A: con el curso publicado, la escala nueva debe coincidir con la suma de los puntajes.
    const score = this.scoreGuard(exam, this.examQuestions(exam.id), config.scaleMax);
    if (score) return score;
    // R5: sus exámenes de recuperación deben seguir con la misma configuración. Si alguno ya se rindió (RN-15), o si
    // está asignado a una recuperación y la nueva escala descuadraría su suma (2A), no se permite el cambio.
    const children = this.recoveryExamsOf(exam);
    const changes = config.timeMinutes !== exam.timeMinutes || config.scaleMax !== exam.scaleMax || config.passScore !== exam.passScore;
    if (changes) {
      for (const child of children) {
        if (this.examLockReason(child)) {
          return `No se puede cambiar: el examen de recuperación «${child.title}» ya fue rendido y debe conservar la configuración del original.`;
        }
        if (this.recoveryExamInUse(child) && !scoreDistribution(this.examQuestions(child.id), config.scaleMax).valid) {
          return `No se puede cambiar la escala: el examen de recuperación «${child.title}» está asignado y sus puntajes dejarían de sumar la nota máxima.`;
        }
      }
    }
    // Los intentos y certificados ya emitidos conservan su escala (RN-08).
    Object.assign(exam, examConfig({ ...exam, ...config }));
    for (const child of children) Object.assign(child, examConfig({ ...child, ...config })); // R5: heredan siempre
    this.save();
    return '';
  }

  /** R5: exámenes de recuperación independientes creados a partir de este examen regular. */
  private recoveryExamsOf(exam: Exam): Exam[] {
    return this.state.exams.filter((e) => examKind(e) === 'recuperacion' && e.parentExamId === exam.id);
  }

  /** RN-12: respuesta correcta y puntaje. La pregunta queda ligada a su examen. */
  private applyQuestion(exam: Exam, question: Question): string {
    const locked = this.examLockReason(exam);
    if (locked) return locked;
    const text = question.text.trim();
    if (!text) return 'Escribe el enunciado de la pregunta.';
    if (!(question.points > 0)) return question.type === 'open' ? 'El puntaje máximo debe ser mayor que 0.' : 'El puntaje debe ser mayor que 0.';
    let clean: ExamQuestion;
    if (question.type === 'open') {
      // M5: excepción autorizada a RN-12: sin opciones ni respuesta correcta; la califica el administrador.
      const rubric = question.rubric?.trim();
      if (rubric && rubric.length > 1000) return 'El criterio de calificación admite como máximo 1000 caracteres.';
      const { rubric: _old, selectCount: _none, ...base } = question;
      clean = { ...base, text, options: [], correct: [], ...(rubric ? { rubric } : {}), examId: exam.id };
    } else {
      const options = question.options.map((o) => ({ id: o.id, text: o.text.trim() }));
      if (options.length < 2 || options.some((o) => !o.text)) return 'Completa el texto de todas las opciones (mínimo 2).';
      if (options.length > MAX_OPTIONS) return `Una pregunta admite como máximo ${MAX_OPTIONS} opciones.`;
      if (new Set(options.map((o) => o.id)).size !== options.length) return 'Las opciones deben tener identificadores distintos.';
      const ids = new Set(options.map((o) => o.id));
      const correct = question.correct.filter((id) => ids.has(id));
      if (correct.length === 0) return 'Marca la respuesta correcta.';
      if (question.type !== 'multiple' && correct.length !== 1) return 'Esta pregunta debe tener una sola respuesta correcta.';
      const { rubric: _unused, selectCount, ...base } = question;
      // Etapa 2B (P1, P2): selección múltiple guarda la cantidad exigida (por defecto, tantas como correctas) y la valida.
      const select = question.type === 'multiple' ? { selectCount: selectCount ?? correct.length } : {};
      const selection = selectionError({ type: question.type, options, correct, ...select });
      if (selection) return selection;
      clean = { ...base, text, options, correct, ...select, examId: exam.id };
    }
    const idx = this.state.questions.findIndex((q) => q.id === question.id && q.examId === exam.id);
    // Etapa 2A: con el curso publicado, el cambio no puede dejar la suma de puntajes distinta de la escala.
    const current = this.examQuestions(exam.id);
    const after = idx >= 0 ? current.map((q) => (q.id === question.id ? clean : q)) : [...current, clean];
    const score = this.scoreGuard(exam, after);
    if (score) return score;
    if (idx >= 0) {
      this.state.questions[idx] = clean;
    } else {
      this.state.questions.push({ ...clean, id: this.newId('q') });
    }
    this.save();
    return '';
  }

  /** Un solo certificado válido por aprobación del mismo curso (RN-08). Conserva los datos del momento de emisión. */
  private issueCertificate(user: User, course: CourseRecord, attempt: Attempt): void {
    const alreadyIssued = this.state.certificates.some(
      (c) => c.attemptId === attempt.id || (c.userId === user.id && c.courseId === course.id && c.status === 'vigente'),
    );
    if (alreadyIssued) return;
    let n = this.state.certificates.length + 1;
    let code: string;
    do {
      code = `IMC-DEMO-${String(n).padStart(4, '0')}`;
      n++;
    } while (this.state.certificates.some((c) => c.code === code));
    const company = this.state.companies.find((c) => c.id === user.companyId)?.name;

    this.state.certificates.push({
      id: this.newId('cert'),
      code,
      userId: user.id,
      courseId: course.id,
      attemptId: attempt.id,
      participantName: user.fullName,
      participantFirstNames: user.firstNames,
      participantLastNames: user.lastNames,
      participantDni: user.dni,
      ...(company ? { participantCompany: company } : {}),
      courseName: course.name,
      ...(course.level ? { courseLevel: course.level } : {}),
      approvalDate: today(),
      issueDate: today(),
      score: attempt.score,
      scaleMax: attempt.scaleMax,
      trainingHours: course.trainingHours,
      entityName: DEMO_CONFIG.entityName,
      status: 'vigente',
    });
  }

  private removeQuestion(exam: Exam, questionId: string): void {
    this.state.questions = this.state.questions.filter((q) => !(q.id === questionId && q.examId === exam.id));
    this.save();
  }

  /** Bloqueantes: RN-03 y examen activo con preguntas. Advertencias: datos que faltan pero no impiden publicar. */
  private publicationCheck(courseId: string): PublicationCheck {
    const course = this.course(courseId)!;
    const blocking = this.ruleIssues(courseId);
    const exam = this.activeExam(courseId);
    const warnings: string[] = [];
    if (course.status === 'publicado') {
      // Informativo: el curso conserva su acceso; solo se exigirá al volver a publicarlo desde borrador.
      for (const issue of this.moduleRuleIssues(courseId).filter((i) => !blocking.includes(i))) {
        warnings.push(`Para volver a publicarlo desde borrador: ${issue}`);
      }
    }
    if (!exam) blocking.push('El curso no tiene un examen activo.');
    else if (this.examQuestions(exam.id).length === 0) blocking.push('El examen activo no tiene preguntas.');
    else {
      // Etapa 2A: la suma de los puntajes debe ser exactamente la nota máxima.
      const mismatch = this.scoreMismatch(exam);
      if (mismatch?.grandfathered) {
        warnings.push(`La evaluación tiene intentos registrados y se conserva sin cambios (RN-15): ${mismatch.message}`);
      } else if (mismatch) {
        blocking.push(mismatch.message);
      }
    }
    if (course.trainingHours === null) {
      warnings.push('Las horas de formación están sin definir: el certificado mostrará «Por definir».');
    }
    if (!course.coverImage) warnings.push('El curso no tiene portada: se mostrará la portada de respaldo.');
    return { canPublish: blocking.length === 0, blocking, warnings };
  }

  private courseInputError(input: CourseInput): string {
    if (input.level != null && !COURSE_LEVELS.some((l) => l.value === input.level)) {
      return 'El nivel del curso debe ser Persona autorizada, Persona competente o Persona certificada.';
    }
    if (!input.name.trim()) return 'Ingresa el nombre del curso.';
    if (!input.description.trim()) return 'Ingresa la descripción del curso.';
    if (input.trainingHours !== null && !(input.trainingHours >= 1)) {
      return 'Las horas de formación deben ser al menos 1.';
    }
    if (normalizeCover(input.coverImage) === undefined) {
      return 'La portada debe ser una ruta de imagen del proyecto o una dirección https.';
    }
    return '';
  }

  /** Devuelve un mensaje de error, o cadena vacía si aplicó los cambios. */
  private applyCoursePatch(courseId: string, patch: CourseRecordPatch): string {
    const course = this.course(courseId);
    if (!course) return 'No se encontró el curso.';
    const error = this.courseInputError(patch);
    if (error) return error;
    if (patch.status === 'publicado') {
      if (this.publishedVideos(courseId).length < MIN_VIDEOS) {
        return 'Para publicar el curso necesitas al menos 1 video publicado.';
      }
      // RN-03 y examen activo con preguntas.
      const { blocking } = this.publicationCheck(courseId);
      if (blocking.length) return `No se puede publicar el curso: ${blocking.join(' ')}`;
    }
    Object.assign(course, {
      name: patch.name.trim(),
      description: patch.description.trim(),
      status: patch.status,
      trainingHours: patch.trainingHours,
      ...(patch.level !== undefined ? { level: patch.level } : {}),
      coverImage: normalizeCover(patch.coverImage) ?? null,
    });
    this.recompute(courseId);
    this.save();
    return '';
  }

  /** Recalcula el estado de quienes aún no rinden/aprueban según los videos publicados. */
  private recompute(courseId: string): void {
    const total = this.publishedVideos(courseId).length;
    const examReady = !this.examBlockReason(courseId);
    for (const e of this.state.enrollments.filter((x) => x.courseId === courseId)) {
      if (e.status === 'aprobado' || e.status === 'desaprobado' || e.status === 'en_revision') continue;
      const done = this.completedPublished(e);
      // Si el curso no admite rendir el examen (borrador o RN-03), no pasa a «listo para examen».
      e.status = done === 0 ? 'pendiente' : done < total || !examReady ? 'en_progreso' : 'listo_examen';
    }
  }

  /**
   * Respuestas guardadas en el intento: solo las preguntas del examen. Las de selección se guardan tal como se
   * enviaron (trazabilidad; las marcas inválidas o sobrantes no suman al calificar); las abiertas, como un único texto recortado al límite técnico.
   */
  private cleanAnswers(questions: Question[], answers: Record<string, string[]>): Record<string, string[]> {
    const clean: Record<string, string[]> = {};
    for (const q of questions) {
      const given = Array.isArray(answers[q.id]) ? answers[q.id].filter((v) => typeof v === 'string') : [];
      if (q.type === 'open') {
        const text = (given[0] ?? '').slice(0, OPEN_ANSWER_MAX);
        if (text.trim()) clean[q.id] = [text];
      } else if (given.length) {
        clean[q.id] = given;
      }
    }
    return clean;
  }

  /**
   * Calificación automática con la regla indicada (Etapa 2B): 'proporcional' para los intentos nuevos; 'todo_o_nada'
   * (decisión del 29/10/2026) solo para terminar de calificar intentos anteriores a la 2B. Las abiertas suman al total,
   * pero no se califican aquí: las califica el instructor. `correctCount` cuenta las preguntas con el puntaje completo.
   */
  private grade(questions: Question[], answers: Record<string, string[]>, rule: GradingRule) {
    let earned = 0;
    let totalPoints = 0;
    let correctCount = 0;
    const questionScores: Record<string, number> = {};
    for (const q of questions) {
      totalPoints += q.points;
      if (q.type === 'open') continue;
      const points = questionPoints(q, answers[q.id], rule);
      questionScores[q.id] = points;
      earned += points;
      if (points === q.points) correctCount++;
    }
    return { earned, totalPoints, correctCount, questionScores };
  }

  /**
   * Etapa 2B. Entrega voluntaria (D3): todas las preguntas completas (selección múltiple con exactamente la cantidad
   * exigida, abiertas con texto). Tiempo agotado (P4): no exige completar nada, pero solo se admite cuando la duración
   * alcanzó el límite del examen. El temporizador de la demostración está en el navegador (RN-14): la garantía
   * definitiva corresponderá al servidor.
   */
  private submissionError(
    exam: Exam,
    questions: Question[],
    answers: Record<string, string[]>,
    durationSec: number,
    mode: SubmitMode,
    start?: ExamStart,
  ): string {
    if (mode === 'tiempo') {
      // Etapa 2B, Bloque 2 (R2): con el inicio registrado, el fin lo decide el repositorio y no la duración que
      // informa el navegador. Sin inicio registrado (datos anteriores a R2) se mantiene la regla del Bloque 1.
      const timeUp = start
        ? Date.now() >= Date.parse(start.endsAt) - TIMEOUT_TOLERANCE_SEC * 1000
        : durationSec >= exam.timeMinutes * 60 - TIMEOUT_TOLERANCE_SEC;
      return timeUp ? '' : 'La entrega automática solo se admite cuando se agotó el tiempo del examen.';
    }
    if (mode !== 'voluntaria') return 'Tipo de entrega no válido.';
    const pending = questions.flatMap((q, i) => (isComplete(q, answers[q.id]) ? [] : [i + 1]));
    if (!pending.length) return '';
    return pending.length === 1
      ? `Para entregar debes completar todas las preguntas. Falta completar la pregunta ${pending[0]}.`
      : `Para entregar debes completar todas las preguntas. Falta completar las preguntas ${pending.join(', ')}.`;
  }

  // ================= Internos: persistencia y migración =================
  /**
   * Semilla: el curso c1 sale del estado v2 de prueba más los cursos demo, por el mismo camino que los datos
   * guardados (v2 → v3 → v4).
   */
  private fresh(): DemoState {
    const v3 = this.withDemoCourses(migrateV2(SEED_V2));
    for (const course of v3.courses) course.coverImage ??= SEED_COVERS[course.id] ?? null;
    // Etapa 2B, Bloque 2 (R1): empresas ficticias asignadas a los estudiantes de prueba; sin recuperaciones.
    return withSeedRecoveryCollections(migrateV3toV4(v3));
  }

  /** Añade los cursos demo que falten, sin modificar ni reemplazar datos existentes. */
  private withDemoCourses(state: DemoStateV3): DemoStateV3 {
    const seed = structuredClone(SEED_DEMO_COURSES);
    const addMissing = <T extends { id: string }>(list: T[], items: T[]) => {
      for (const item of items) if (!list.some((x) => x.id === item.id)) list.push(item);
    };
    addMissing(state.courses, seed.courses);
    addMissing(state.modules, seed.modules);
    addMissing(state.videos, seed.videos);
    addMissing(state.exams, seed.exams);
    for (const e of structuredClone(SEED_DEMO_ENROLLMENTS)) {
      const userExists = state.users.some((u) => u.id === e.userId);
      const enrolled = state.enrollments.some((x) => x.userId === e.userId && x.courseId === e.courseId);
      if (userExists && !enrolled) state.enrollments.push(e);
    }
    return state;
  }

  /**
   * Carga el estado, en este orden: v4 (vigente) → v3 → v2 → semilla.
   * Regla: v3 y v2 solo se LEEN; nunca se modifican ni se borran. La aplicación solo escribe la clave v4
   * y, antes de migrar o al encontrar datos dañados, copias de respaldo que nunca sobrescriben otra copia.
   */
  private load(): DemoState {
    const legacyStatePresent = this.read(LEGACY_STORAGE_KEY) !== null;
    const notices: string[] = [];
    const set = (source: StorageStatus['source'], warning = '', migrationProblems: string[] = []) =>
      (this.status = { source, warning: [...notices, warning].filter(Boolean).join(' '), migrationProblems, legacyStatePresent });

    const raw = this.read(STORAGE_KEY);
    if (raw !== null) {
      const parsed = this.parse(raw);
      if (isDemoState(parsed)) {
        set('v4');
        // Etapa 2B, Bloque 2 (R1): completa en memoria las colecciones nuevas; no guarda ni toca las demás.
        return normalizeDemoState(parsed);
      }
      const copy = this.writeBackup(BACKUP_STORAGE_KEY, raw);
      notices.push(`Los datos guardados de la demostración no tienen un formato válido. Se guardó una copia en «${copy}».`);
    }

    const rawV3 = this.read(V3_STORAGE_KEY);
    if (rawV3 !== null) {
      const parsed = this.parse(rawV3);
      if (!isDemoStateV3(parsed)) {
        const copy = this.writeBackup(V3_INVALID_BACKUP_KEY, rawV3);
        set('seed', `Los datos guardados (v3) no tienen un formato válido. Se guardó una copia en «${copy}» y se cargaron los datos de prueba.`);
        return this.fresh();
      }
      return this.migrateFromV3(parsed, rawV3, set);
    }

    const rawV2 = this.read(LEGACY_STORAGE_KEY);
    if (rawV2 !== null) {
      const parsed = this.parse(rawV2);
      if (!isDemoStateV2(parsed)) {
        set(
          'seed',
          'Se encontraron datos de una versión anterior con un formato no reconocido. No se eliminaron y se cargaron los datos de prueba.',
        );
        return this.fresh();
      }
      const v3 = this.withDemoCourses(migrateV2(parsed));
      const v4 = migrateV3toV4(v3);
      const problems = [...verifyMigration(parsed, v3), ...verifyMigrationV4(v3, v4)];
      if (problems.length) {
        set(
          'seed',
          'No se pudieron migrar los datos de la versión anterior. No se eliminaron y se cargaron los datos de prueba.',
          problems,
        );
        return this.fresh();
      }
      // Se guarda el estado migrado sin borrar el anterior (v2), que se conserva hasta confirmar la migración.
      this.write(STORAGE_KEY, JSON.stringify(v4));
      set(
        'migrated-v2',
        'Se migraron los datos guardados por la versión anterior. Los datos anteriores se conservan en este navegador hasta confirmar la migración.',
      );
      return v4;
    }

    set('seed', notices.length ? 'Se cargaron los datos de prueba.' : '');
    return this.fresh();
  }

  /**
   * Migración v3 → v4 (B1.2). Antes copia v3 tal cual (solo si no hay copia previa); si la verificación falla,
   * carga los datos de prueba y avisa (decisión del 08/11/2026). En ningún caso modifica la clave v3.
   */
  private migrateFromV3(
    v3: DemoStateV3,
    rawV3: string,
    set: (source: StorageStatus['source'], warning?: string, problems?: string[]) => void,
  ): DemoState {
    if (this.read(V3_MIGRATION_BACKUP_KEY) === null) this.write(V3_MIGRATION_BACKUP_KEY, rawV3);
    const v4 = migrateV3toV4(v3);
    const problems = verifyMigrationV4(v3, v4);
    if (problems.length) {
      set(
        'seed',
        'No se pudieron migrar los datos guardados (v3) al rol Instructor. Se conservan sin cambios y se cargaron los datos de prueba.',
        problems,
      );
      return this.fresh();
    }
    this.write(STORAGE_KEY, JSON.stringify(v4));
    set(
      'migrated-v3',
      'Se actualizaron los datos guardados al rol Instructor (v4). Los datos anteriores (v3) se conservan sin cambios en este navegador.',
    );
    return v4;
  }

  /**
   * Guarda una copia de respaldo sin sobrescribir otra: si la clave ya tiene otro contenido, usa una clave con fecha.
   * Devuelve la clave usada.
   */
  private writeBackup(baseKey: string, raw: string): string {
    const existing = this.read(baseKey);
    if (existing === null) {
      this.write(baseKey, raw);
      return baseKey;
    }
    if (existing === raw) return baseKey;
    const key = `${baseKey}-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    this.write(key, raw);
    return key;
  }

  private parse(raw: string): unknown {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  private read(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null; // sin almacenamiento disponible
    }
  }

  private write(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* sin almacenamiento disponible */
    }
  }

  private save(): void {
    this.write(STORAGE_KEY, JSON.stringify(this.state));
  }
}
