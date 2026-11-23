/**
 * Módulo académico: conversión de las filas de MySQL a los modelos que ya usan las pantallas del frontend
 * (src/app/core/models/*.model.ts). Así las pantallas existentes funcionan con datos reales sin rehacerse.
 */
import type { GradableQuestion, QuestionKind, Rule, VideoSource } from './academic.rules.js';
import { MAX_ATTEMPTS } from './academic.rules.js';
import { type CourseLevelColumn, levelFromColumn } from './course-levels.js';

type Status = 'BORRADOR' | 'PUBLICADO';
type EnrollmentStatus = 'PENDIENTE' | 'EN_PROGRESO' | 'LISTO_EXAMEN' | 'EN_REVISION' | 'APROBADO' | 'DESAPROBADO';

export interface CourseRow {
  id: string;
  name: string;
  description: string;
  status: Status;
  trainingHours: number | null;
  /** NULL o ausente = pendiente de clasificación. */
  level?: CourseLevelColumn | null;
  coverImage: string | null;
  active: boolean;
  createdById: string | null;
}
export interface ModuleRow {
  id: string;
  courseId: string;
  position: number;
  title: string;
  description: string | null;
}
export interface VideoRow {
  id: string;
  courseId: string;
  moduleId: string;
  position: number;
  title: string;
  description: string | null;
  durationSec: number;
  published: boolean;
  sourceKind: 'YOUTUBE' | 'DRIVE' | 'URL' | 'PLACEHOLDER';
  sourceRef: string | null;
  sourceCredit: string | null;
  materialUrl: string | null;
}
export interface EnrollmentRow {
  id: string;
  studentId: string;
  courseId: string;
  status: EnrollmentStatus;
  startedAt: Date | null;
}
export interface ExamRow {
  id: string;
  courseId: string;
  title: string;
  active: boolean;
  kind: 'REGULAR' | 'RECUPERACION';
  parentExamId: string | null;
  timeMinutes: number;
  passScore: number;
  scaleMax: number;
  availableFrom: Date | null;
}
export interface QuestionRow {
  id: string;
  examId: string;
  position: number;
  type: 'SINGLE' | 'MULTIPLE' | 'TRUEFALSE' | 'OPEN';
  text: string;
  options: unknown;
  correct: unknown;
  points: number;
  selectCount: number | null;
  rubric: string | null;
}
export interface AttemptRow {
  id: string;
  studentId: string;
  courseId: string;
  examId: string;
  kind: 'REGULAR' | 'RECUPERACION';
  submittedAt: Date;
  durationSec: number;
  score: number;
  scaleMax: number;
  correctCount: number;
  totalQuestions: number;
  passed: boolean;
  answers: unknown;
  gradingRule: 'PROPORCIONAL' | 'TODO_O_NADA';
  questionScores: unknown;
  maxPoints: number;
  autoSubmitted: boolean;
  reviewStatus: 'EN_REVISION' | 'CALIFICADO' | null;
  manualScores: unknown;
  gradedAt: Date | null;
}
export interface CertificateRow {
  id: string;
  code: string;
  studentId: string;
  courseId: string;
  /** NULL en los certificados importados (23/11/2026), igual que la aprobación y la nota: no se inventan. */
  attemptId: string | null;
  participantName: string;
  participantFirstNames?: string | null;
  participantLastNames?: string | null;
  participantDni: string | null;
  participantCompany?: string | null;
  courseName: string;
  courseLevel?: CourseLevelColumn | null;
  approvalDate: Date | null;
  issueDate: Date;
  score: number | null;
  scaleMax: number | null;
  trainingHours: number | null;
  entityName: string;
  status: 'VIGENTE' | 'REVOCADO';
  importId?: string | null;
}

/** Fecha (AAAA-MM-DD) en hora de Lima, como la guardaba la demostración. */
export function limaDate(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export const toCourseRecord = (c: CourseRow) => ({
  id: c.id,
  name: c.name,
  description: c.description,
  status: c.status === 'PUBLICADO' ? ('publicado' as const) : ('borrador' as const),
  trainingHours: c.trainingHours,
  level: levelFromColumn(c.level),
  coverImage: c.coverImage,
  isDemo: false,
  active: c.active,
});

export const toModule = (m: ModuleRow) => ({
  id: m.id,
  courseId: m.courseId,
  order: m.position,
  title: m.title,
  ...(m.description ? { description: m.description } : {}),
});

export function videoSource(v: Pick<VideoRow, 'sourceKind' | 'sourceRef'>): VideoSource {
  if (v.sourceKind === 'YOUTUBE' && v.sourceRef) return { kind: 'youtube', videoId: v.sourceRef };
  if (v.sourceKind === 'DRIVE' && v.sourceRef) return { kind: 'drive', fileId: v.sourceRef };
  if (v.sourceKind === 'URL' && v.sourceRef) return { kind: 'url', url: v.sourceRef };
  return { kind: 'placeholder' };
}

export function sourceColumns(source: VideoSource): Pick<VideoRow, 'sourceKind' | 'sourceRef'> {
  if (source.kind === 'youtube') return { sourceKind: 'YOUTUBE', sourceRef: source.videoId };
  if (source.kind === 'drive') return { sourceKind: 'DRIVE', sourceRef: source.fileId };
  if (source.kind === 'url') return { sourceKind: 'URL', sourceRef: source.url };
  return { sourceKind: 'PLACEHOLDER', sourceRef: null };
}

export const toVideo = (v: VideoRow) => ({
  id: v.id,
  courseId: v.courseId,
  moduleId: v.moduleId,
  order: v.position,
  title: v.title,
  ...(v.description ? { description: v.description } : {}),
  durationSec: v.durationSec,
  published: v.published,
  source: videoSource(v),
  ...(v.sourceCredit ? { sourceCredit: v.sourceCredit } : {}),
  ...(v.materialUrl ? { materialUrl: v.materialUrl } : {}),
});

export const enrollmentStatus = (s: EnrollmentStatus) =>
  s.toLowerCase() as 'pendiente' | 'en_progreso' | 'listo_examen' | 'en_revision' | 'aprobado' | 'desaprobado';

export const toEnrollment = (e: EnrollmentRow, completedVideoIds: string[]) => ({
  userId: e.studentId,
  courseId: e.courseId,
  completedVideoIds,
  ...(e.startedAt ? { startDate: limaDate(e.startedAt) } : {}),
  status: enrollmentStatus(e.status),
});

export const toExam = (e: ExamRow) => ({
  id: e.id,
  courseId: e.courseId,
  title: e.title,
  active: e.active,
  kind: e.kind === 'RECUPERACION' ? ('recuperacion' as const) : ('regular' as const),
  ...(e.parentExamId ? { parentExamId: e.parentExamId } : {}),
  timeMinutes: e.timeMinutes,
  passScore: e.passScore,
  scaleMax: e.scaleMax,
  maxAttempts: MAX_ATTEMPTS,
  availableFrom: e.availableFrom ? e.availableFrom.toISOString() : null,
});

const asStrings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const asOptions = (v: unknown) =>
  Array.isArray(v)
    ? v.filter((o): o is { id: string; text: string } => !!o && typeof o.id === 'string' && typeof o.text === 'string')
    : [];

export function toGradable(q: QuestionRow): GradableQuestion {
  return {
    id: q.id,
    type: q.type.toLowerCase() as QuestionKind,
    text: q.text,
    options: asOptions(q.options),
    correct: asStrings(q.correct),
    points: q.points,
    ...(q.selectCount != null ? { selectCount: q.selectCount } : {}),
    ...(q.rubric ? { rubric: q.rubric } : {}),
  };
}

/** Pregunta para el Instructor (con respuesta correcta y criterio). */
export const toExamQuestion = (q: QuestionRow) => ({ ...toGradable(q), examId: q.examId });

/**
 * Pregunta para el ESTUDIANTE: sin respuesta correcta ni criterio de calificación. La cantidad a marcar se envía
 * explícita para que la pantalla no la deduzca de las correctas.
 */
export function toStudentQuestion(q: QuestionRow) {
  const g = toGradable(q);
  const selectCount = g.type === 'multiple' ? (g.selectCount ?? g.correct.length) : undefined;
  return {
    id: g.id,
    examId: q.examId,
    type: g.type,
    text: g.text,
    options: g.options,
    correct: [] as string[],
    points: g.points,
    ...(selectCount !== undefined ? { selectCount } : {}),
  };
}

const asScores = (v: unknown): Record<string, number> =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([, n]) => typeof n === 'number')) as Record<string, number>
    : {};
const asAnswers = (v: unknown): Record<string, string[]> =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, a]) => [k, asStrings(a)]))
    : {};

export const ruleOf = (r: AttemptRow['gradingRule']): Rule => (r === 'TODO_O_NADA' ? 'todo_o_nada' : 'proporcional');

/** `withAnswers`: el Instructor ve las respuestas; el estudiante también ve las suyas. */
export function toAttempt(a: AttemptRow) {
  return {
    id: a.id,
    userId: a.studentId,
    courseId: a.courseId,
    examId: a.examId,
    date: a.submittedAt.toISOString(),
    durationSec: a.durationSec,
    score: a.score,
    scaleMax: a.scaleMax,
    correctCount: a.correctCount,
    totalQuestions: a.totalQuestions,
    passed: a.passed,
    answers: asAnswers(a.answers),
    gradingRule: ruleOf(a.gradingRule),
    questionScores: asScores(a.questionScores),
    maxPoints: a.maxPoints,
    ...(a.kind === 'RECUPERACION' ? { kind: 'recuperacion' as const } : {}),
    ...(a.autoSubmitted ? { autoSubmitted: true as const } : {}),
    ...(a.reviewStatus
      ? {
          review: {
            status: a.reviewStatus === 'EN_REVISION' ? ('en_revision' as const) : ('calificado' as const),
            manualScores: asScores(a.manualScores),
            ...(a.gradedAt ? { gradedAt: a.gradedAt.toISOString() } : {}),
          },
        }
      : {}),
  };
}

export const toCertificate = (c: CertificateRow) => ({
  id: c.id,
  code: c.code,
  userId: c.studentId,
  courseId: c.courseId,
  attemptId: c.attemptId ?? '',
  participantName: c.participantName,
  ...(c.participantFirstNames ? { participantFirstNames: c.participantFirstNames } : {}),
  ...(c.participantLastNames ? { participantLastNames: c.participantLastNames } : {}),
  ...(c.participantDni ? { participantDni: c.participantDni } : {}),
  ...(c.participantCompany ? { participantCompany: c.participantCompany } : {}),
  courseName: c.courseName,
  ...(c.courseLevel ? { courseLevel: levelFromColumn(c.courseLevel) } : {}),
  ...(c.importId ? { imported: true as const } : {}),
  approvalDate: c.approvalDate ? limaDate(c.approvalDate) : null,
  issueDate: limaDate(c.issueDate),
  score: c.score,
  scaleMax: c.scaleMax,
  trainingHours: c.trainingHours,
  entityName: c.entityName,
  status: c.status === 'VIGENTE' ? ('vigente' as const) : ('revocado' as const),
});

/** Verificación pública: sin DNI, intento ni identificadores internos. */
export const toPublicCertificate = (c: CertificateRow) => ({
  id: c.code,
  code: c.code,
  userId: '',
  courseId: '',
  attemptId: '',
  participantName: c.participantName,
  courseName: c.courseName,
  approvalDate: c.approvalDate ? limaDate(c.approvalDate) : null,
  issueDate: limaDate(c.issueDate),
  score: c.score,
  scaleMax: c.scaleMax,
  trainingHours: c.trainingHours,
  entityName: c.entityName,
  status: c.status === 'VIGENTE' ? ('vigente' as const) : ('revocado' as const),
});

/**
 * Validación pública por DNI (20/11/2026): EXCLUSIVAMENTE titular, curso, código, fecha de emisión y estado. Sin DNI,
 * nota, escala, horas, entidad ni identificadores internos (la consulta es pública y sin sesión).
 */
export const toPublicDniCertificate = (c: CertificateRow) => ({
  id: c.code,
  code: c.code,
  participantName: c.participantName,
  courseName: c.courseName,
  issueDate: limaDate(c.issueDate),
  status: c.status === 'VIGENTE' ? ('vigente' as const) : ('revocado' as const),
});
