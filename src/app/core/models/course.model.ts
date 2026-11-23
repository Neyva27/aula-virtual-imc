export type CourseStatus = 'borrador' | 'publicado';

/** Niveles oficiales (23/11/2026). Sin nivel (null o ausente): pendiente de clasificación; nunca se asigna por defecto. */
export const COURSE_LEVELS = [
  { value: 'persona_autorizada', label: 'Persona autorizada' },
  { value: 'persona_competente', label: 'Persona competente' },
  { value: 'persona_certificada', label: 'Persona certificada' },
] as const;
export type CourseLevel = (typeof COURSE_LEVELS)[number]['value'];
export const COURSE_LEVEL_PENDING = 'Pendiente de clasificación';
export const courseLevelLabel = (level: CourseLevel | null | undefined): string =>
  COURSE_LEVELS.find((l) => l.value === level)?.label ?? COURSE_LEVEL_PENDING;

// ================= Entidades (varios cursos, E2) =================
// Relación uno a muchos: Curso 1─N Módulo 1─N Video, y Curso 1─N Examen (exam.model.ts).
// Un video pertenece a un único curso (reunión del 23/10).

export interface CourseRecord {
  id: string;
  name: string;
  description: string; // campo independiente: nunca va incrustado en la portada
  status: CourseStatus;
  trainingHours: number | null; // null = por definir (pendiente D12)
  level?: CourseLevel | null; // null o ausente = pendiente de clasificación
  coverImage: string | null; // ruta relativa o URL https; null = portada de respaldo
  isDemo: boolean; // curso de demostración, no oficial de IMC
}

export interface CourseModule {
  id: string;
  courseId: string;
  order: number;
  title: string;
  description?: string; // opcional: los módulos guardados antes no la tienen
}

/** Alta o edición de un módulo del curso (sección «Contenido del curso»). */
export interface CourseModuleInput {
  id?: string;
  title: string;
  description?: string;
}

/** Fuentes provisionales: YouTube y Google Drive no son el alojamiento definitivo (pendiente S8). */
export type VideoSource =
  | { kind: 'youtube'; videoId: string }
  | { kind: 'drive'; fileId: string }
  | { kind: 'url'; url: string }
  | { kind: 'placeholder' };

export interface VideoRecord {
  id: string;
  courseId: string;
  moduleId: string;
  order: number; // orden dentro del módulo
  title: string;
  description?: string;
  durationSec: number; // duración real; RN-03 se valida sobre este valor
  published: boolean;
  source: VideoSource;
  sourceCredit?: string; // atribución de contenido de terceros
  /** Material complementario (enlace https), modo API (18/11/2026). */
  materialUrl?: string;
}

/** Clases en vivo con Google Meet (20/11/2026): enlace externo, del curso y opcionalmente de uno de sus módulos. */
export type LiveSessionStatus = 'programada' | 'cancelada';

export interface LiveSession {
  id: string;
  courseId: string;
  /** Módulo relacionado (opcional); null = clase de todo el curso. */
  moduleId: string | null;
  /** Título y posición (1, 2…) del módulo; vacío y 0 si la clase no tiene módulo. */
  moduleTitle: string;
  moduleOrder: number;
  title: string;
  description?: string;
  /** Inicio en ISO 8601 (UTC); se muestra en hora de Lima. */
  startsAt: string;
  meetUrl: string;
  /** Enlace https de la grabación; solo existe si el Instructor lo agregó. */
  recordingUrl?: string;
  status: LiveSessionStatus;
}

/** Ventana para unirse: desde que empieza hasta 4 horas después; luego la clase se considera finalizada. */
export const LIVE_JOIN_WINDOW_MS = 4 * 3_600_000;

export type LivePhase = 'proxima' | 'en_curso' | 'finalizada' | 'cancelada';

export function livePhase(s: Pick<LiveSession, 'status' | 'startsAt'>, now = Date.now()): LivePhase {
  if (s.status === 'cancelada') return 'cancelada';
  const start = Date.parse(s.startsAt);
  if (now < start) return 'proxima';
  return now < start + LIVE_JOIN_WINDOW_MS ? 'en_curso' : 'finalizada';
}

export interface LiveSessionInput {
  moduleId?: string | null;
  title: string;
  description?: string | null;
  startsAt: string;
  meetUrl: string;
}

export interface CourseContent {
  course: CourseRecord;
  modules: (CourseModule & { videos: VideoRecord[] })[];
  /** Incumplimientos de RN-03 que impiden publicar el curso y habilitar el examen. */
  ruleIssues: string[];
}

/** Tarjeta del tablero del alumno (E3). */
export interface ParticipantCourse {
  course: CourseRecord;
  enrollment: Enrollment;
  totalVideos: number;
  completedVideos: number;
  percent: number;
  /** Curso en borrador visible solo en modo demostración. */
  preview: boolean;
}

export interface CourseInput {
  name: string;
  description: string;
  trainingHours: number | null;
  coverImage: string | null;
  /** Omitido al editar: se conserva. null: pendiente de clasificación. */
  level?: CourseLevel | null;
}

export interface CourseRecordPatch extends CourseInput {
  status: CourseStatus;
}

/** Alta o edición de un video de un curso (administración, E5). */
export interface CourseVideoInput {
  id?: string;
  /** Módulo del mismo curso; si se omite, el primero (o el actual al editar). */
  moduleId?: string;
  title: string;
  description?: string;
  /** Duración real en segundos (mayor que 0). Sin mínimo ni máximo desde el 20/11/2026. */
  durationSec: number;
  published: boolean;
  /** Enlace de YouTube, de Google Drive u otro enlace https; vacío = sin archivo de reproducción. */
  url?: string;
  /** M4: fuente elegida en el formulario. Si se indica, el enlace debe corresponder a esa fuente. */
  sourceKind?: VideoSourceChoice;
  /** Material complementario (enlace https; vacío = sin material). */
  materialUrl?: string;
}

/** Opciones de fuente del formulario de videos (M4). «url» y «none» conservan lo que ya existía. */
/** Fuente elegida en el formulario (21/11/2026: sin «Sin archivo»; un video nuevo necesita enlace). */
export type VideoSourceChoice = 'youtube' | 'drive' | 'url';
export const VIDEO_SOURCE_REQUIRED = 'Ingresa el enlace del video: YouTube, Google Drive u otro enlace https.';

/** Requisitos para publicar un curso. */
export interface PublicationCheck {
  canPublish: boolean;
  /** Impiden publicar: RN-03 y examen activo con preguntas. */
  blocking: string[];
  /** Informativos: no impiden publicar (por ejemplo, horas sin definir, PENDIENTES D12). */
  warnings: string[];
}

// ================= Vista heredada de un solo curso =================
// Forma que usan las pantallas actuales y el estado v2 de localStorage.
// Se obtiene del curso principal (DEMO_CONFIG.legacyCourseId). Se retira en E3.

export interface Video {
  id: string;
  order: number;
  title: string;
  description?: string;
  durationMin: number; // minutos enteros, mayor que 0 (sin límite de duración desde el 20/11/2026)
  published: boolean;
  url?: string;
}

export interface Course {
  id: string;
  name: string;
  description: string;
  status: CourseStatus;
  trainingHours: number; // dato configurable (pendiente de definición)
  videos: Video[]; // RN-03: entre 5 y 7 videos
}

// RN-09. «en_revision» (29/10/2026): rindió un examen con preguntas abiertas aún sin calificar.
export type ParticipantStatus =
  | 'pendiente'
  | 'en_progreso'
  | 'listo_examen'
  | 'en_revision'
  | 'aprobado'
  | 'desaprobado';

/** Una inscripción por participante y curso. */
export interface Enrollment {
  userId: string;
  courseId: string;
  completedVideoIds: string[];
  startDate?: string; // ISO
  status: ParticipantStatus;
}

// RN-03: para publicar, cada MÓDULO necesita al menos 1 video publicado propio (21/11/2026; antes 5). Sin máximo de videos
// por curso ni por módulo. Los cursos ya publicados conservan el acceso de sus participantes.
// Duración (20/11/2026): sin mínimo ni máximo; solo debe ser mayor que 0.
// 21/11/2026: basta UN video publicado por módulo para publicar; el Instructor decide cuántos agrega.
export const MIN_VIDEOS = 1;

export interface CoursePatch {
  name: string;
  description: string;
  status: CourseStatus;
  trainingHours: number;
}

export interface VideoInput {
  id?: string;
  title: string;
  description?: string;
  durationMin: number;
  url?: string;
  published: boolean;
}

export interface ParticipantInput {
  fullName: string;
  email: string;
  dni: string;
  whatsapp?: string;
}
