/**
 * Módulo académico (18/11/2026): reglas de negocio PURAS, portadas sin cambios desde el frontend (exam.model.ts,
 * mock-data-repository.ts, utils/youtube.ts y utils/drive.ts), donde se validaron con el equipo en la demostración.
 * El servidor es ahora la fuente de verdad: valida y califica con estas mismas reglas.
 */

// ===================== RN-03: videos del curso =====================
/**
 * RN-03 (21/11/2026): para publicar el curso, cada MÓDULO necesita al menos UN video publicado propio (antes eran
 * cinco). El Instructor decide cuántos videos agrega a cada módulo; no hay máximo por curso ni por módulo.
 * Duración (20/11/2026): sin mínimo ni máximo. Solo se exige una duración real válida, en segundos enteros mayor que 0.
 */
export const MIN_VIDEOS = 1;
/** 21/11/2026: un video nuevo debe tener fuente de reproducción (se eliminó la opción «Sin archivo»). */
export const VIDEO_SOURCE_REQUIRED = 'Ingresa el enlace del video: YouTube, Google Drive u otro enlace https.';
/** Tope de la columna `duration_sec` (INT de MySQL): no es una regla de negocio, solo evita un desbordamiento. */
export const MAX_DURATION_SEC = 2_147_483_647;
export const MODULE_TITLE_MAX = 120;
/** Sesiones en vivo (20/11/2026). */
export const LIVE_TITLE_MAX = 150;
export const LIVE_DESCRIPTION_MAX = 2000;

/**
 * Enlace de Google Meet (20/11/2026): solo https://meet.google.com/<código>, con el código de reunión de Meet
 * (abc-defg-hij), opcionalmente con parámetros. Devuelve el enlace limpio, o null si no es un enlace de Meet.
 */
export function normalizeMeetUrl(value: string | null | undefined): string | null {
  const v = value?.trim() ?? '';
  if (v.length > 500) return null;
  const match = /^https:\/\/meet\.google\.com\/([a-z]{3}-[a-z]{4}-[a-z]{3})(\?[^\s#]*)?$/i.exec(v);
  return match ? `https://meet.google.com/${match[1].toLowerCase()}${match[2] ?? ''}` : null;
}
export const MODULE_DESCRIPTION_MAX = 500;

// ===================== Evaluaciones =====================
/** Decisión del 27/10/2026: un solo intento por examen de cada curso, no configurable (reemplaza RN-07/RN-10). */
export const MAX_ATTEMPTS = 1;
export const OPEN_ANSWER_MAX = 4000;
export const MAX_OPTIONS = 8;
/** Margen para la entrega por tiempo agotado (latencia de red). */
export const TIMEOUT_TOLERANCE_SEC = 5;
/** Configuración inicial de un examen nuevo (valores de la demostración, pendientes de confirmar). */
export const DEFAULT_EXAM = { timeMinutes: 20, passScore: 60, scaleMax: 100 } as const;
/** Entidad capacitadora que figura en el certificado (pendiente de confirmar con la empresa). */
export const CERTIFICATE_ENTITY = 'IM Corporación SST Perú';

/** RN-15: un examen con intentos registrados no admite cambios. */
export const EXAM_LOCKED_MESSAGE =
  'Esta evaluación no se puede modificar porque ya existen intentos registrados. Los cambios podrían afectar la ' +
  'integridad de los resultados históricos. La creación de una nueva versión de la evaluación aún no está disponible.';

export type QuestionKind = 'single' | 'multiple' | 'truefalse' | 'open';
export type Rule = 'proporcional' | 'todo_o_nada';

export interface QuestionOption {
  id: string;
  text: string;
}

export interface GradableQuestion {
  id: string;
  type: QuestionKind;
  text: string;
  options: QuestionOption[];
  correct: string[];
  points: number;
  selectCount?: number;
  rubric?: string;
}

const cents = (n: number) => Math.round(n * 100) / 100;

/** Etapa 2A: la suma de los puntajes debe ser EXACTAMENTE la nota máxima. */
export function scoreDistribution(questions: readonly Pick<GradableQuestion, 'points'>[], scaleMax: number) {
  const total = cents(questions.reduce((sum, q) => sum + q.points, 0));
  const difference = cents(total - scaleMax);
  const valid = difference === 0;
  const points = (n: number) => `${n} ${n === 1 ? 'punto' : 'puntos'}`;
  const message = valid
    ? 'La distribución de puntajes es correcta.'
    : `La suma de los puntajes es ${total}. Debe ser exactamente ${scaleMax} ` +
      `(${difference < 0 ? `faltan ${points(-difference)}` : `sobran ${points(difference)}`}).`;
  return { total, max: scaleMax, difference, valid, message };
}

/** Alternativas que el alumno debe marcar. */
export function requiredSelections(q: Pick<GradableQuestion, 'type' | 'correct' | 'selectCount'>): number {
  if (q.type === 'open') return 0;
  if (q.type === 'multiple') return q.selectCount ?? q.correct.length;
  return 1;
}

function validSelections(q: Pick<GradableQuestion, 'options'>, given: readonly string[] | undefined): string[] {
  const ids = new Set(q.options.map((o) => o.id));
  return [...new Set(given ?? [])].filter((id) => typeof id === 'string' && ids.has(id));
}

/** P1: en selección múltiple, correctas ≤ cantidad exigida < alternativas. */
export function selectionError(q: Pick<GradableQuestion, 'type' | 'options' | 'correct' | 'selectCount'>): string {
  if (q.type !== 'multiple') return '';
  const correct = q.correct.length;
  const total = q.options.length;
  const k = requiredSelections(q);
  if (correct >= total) return 'En selección múltiple, al menos una alternativa debe ser incorrecta.';
  if (!Number.isInteger(k)) return 'La cantidad de alternativas a seleccionar debe ser un número entero.';
  if (k < correct) {
    return `La cantidad de alternativas a seleccionar no puede ser menor que la cantidad de respuestas correctas (${correct}).`;
  }
  if (k >= total) return `La cantidad de alternativas a seleccionar debe ser menor que el total de alternativas (${total}).`;
  return '';
}

/** D3: la pregunta está completa para la entrega voluntaria. */
export function isComplete(q: Pick<GradableQuestion, 'type' | 'options' | 'correct' | 'selectCount'>, given: readonly string[] | undefined): boolean {
  if (q.type === 'open') return !!given?.[0]?.trim();
  return validSelections(q, given).length === requiredSelections(q);
}

/** Puntos automáticos de una pregunta (las abiertas valen 0: las califica el Instructor). */
export function questionPoints(q: GradableQuestion, given: readonly string[] | undefined, rule: Rule): number {
  if (q.type === 'open') return 0;
  if (rule === 'todo_o_nada') {
    const sorted = [...(given ?? [])].sort();
    const expected = [...q.correct].sort();
    return sorted.length === expected.length && sorted.every((v, i) => v === expected[i]) ? q.points : 0;
  }
  const marked = validSelections(q, given);
  if (marked.length === 0 || marked.length > requiredSelections(q) || q.correct.length === 0) return 0;
  const hits = marked.filter((id) => q.correct.includes(id)).length;
  return Math.min(q.points, Math.max(0, (hits / q.correct.length) * q.points));
}

/** Calificación automática (Etapa 2B). Las abiertas suman al total pero no se califican aquí. */
export function grade(questions: readonly GradableQuestion[], answers: Record<string, string[]>, rule: Rule) {
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

/** Respuestas que se guardan: solo preguntas del examen; las abiertas como un único texto recortado. */
export function cleanAnswers(questions: readonly GradableQuestion[], answers: Record<string, unknown>): Record<string, string[]> {
  const clean: Record<string, string[]> = {};
  for (const q of questions) {
    const raw = answers[q.id];
    const given = Array.isArray(raw) ? raw.filter((v): v is string => typeof v === 'string') : [];
    if (q.type === 'open') {
      const text = (given[0] ?? '').slice(0, OPEN_ANSWER_MAX);
      if (text.trim()) clean[q.id] = [text];
    } else if (given.length) {
      clean[q.id] = given;
    }
  }
  return clean;
}

/** Mensaje si la entrega voluntaria tiene preguntas incompletas (cadena vacía si está completa). */
export function incompleteMessage(questions: readonly GradableQuestion[], answers: Record<string, string[]>): string {
  const pending = questions.flatMap((q, i) => (isComplete(q, answers[q.id]) ? [] : [i + 1]));
  if (!pending.length) return '';
  return pending.length === 1
    ? `Para entregar debes completar todas las preguntas. Falta completar la pregunta ${pending[0]}.`
    : `Para entregar debes completar todas las preguntas. Falta completar las preguntas ${pending.join(', ')}.`;
}

// ===================== Fuentes de video =====================
export type VideoSource =
  | { kind: 'youtube'; videoId: string }
  | { kind: 'drive'; fileId: string }
  | { kind: 'url'; url: string }
  | { kind: 'placeholder' };
export type VideoSourceChoice = 'youtube' | 'drive' | 'url';

const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const DRIVE_ID = /^[A-Za-z0-9_-]{25,}$/;

export function parseYouTubeId(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
  const host = parsed.hostname.replace(/^(www|m)\./, '');
  let id: string | null = null;
  if (host === 'youtu.be') id = parsed.pathname.split('/')[1] ?? null;
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const [, first, second] = parsed.pathname.split('/');
    id = first === 'watch' ? parsed.searchParams.get('v') : ['embed', 'shorts', 'live'].includes(first) ? second : null;
  }
  return id && YT_ID.test(id) ? id : null;
}

export function parseDriveFileId(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;
  if (parsed.hostname !== 'drive.google.com' && parsed.hostname !== 'docs.google.com') return null;
  const [, first, second, third] = parsed.pathname.split('/');
  let id: string | null = null;
  if (first === 'file' && second === 'd') id = third ?? null;
  else if (parsed.hostname === 'drive.google.com' && (first === 'open' || first === 'uc')) id = parsed.searchParams.get('id');
  return id && DRIVE_ID.test(id) ? id : null;
}

export function isDriveHost(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === 'drive.google.com' || host === 'docs.google.com';
  } catch {
    return false;
  }
}

/** Enlace vacío = sin archivo; YouTube; archivo de Drive; otro enlace https (p. ej. MP4 en un almacenamiento). */
export function sourceFromUrl(url: string): VideoSource | null {
  if (!url) return { kind: 'placeholder' };
  const videoId = parseYouTubeId(url);
  if (videoId) return { kind: 'youtube', videoId };
  const fileId = parseDriveFileId(url);
  if (fileId) return { kind: 'drive', fileId };
  if (isDriveHost(url)) return null;
  return /^https:\/\/\S+$/i.test(url) ? { kind: 'url', url } : null;
}

export function sourceUrl(source: VideoSource): string | undefined {
  if (source.kind === 'youtube') return `https://www.youtube.com/watch?v=${source.videoId}`;
  if (source.kind === 'drive') return `https://drive.google.com/file/d/${source.fileId}/view`;
  return source.kind === 'url' ? source.url : undefined;
}

/** M4: el enlace debe corresponder a la fuente elegida en el formulario. */
export function sourceMismatch(choice: VideoSourceChoice, source: VideoSource): string {
  const expected = { youtube: 'youtube', drive: 'drive', url: 'url' }[choice];
  if (source.kind === expected) return '';
  if (choice === 'youtube') return 'El enlace no es un video de YouTube válido (por ejemplo, https://www.youtube.com/watch?v=…).';
  if (choice === 'drive') return 'El enlace no es un archivo de Google Drive válido (por ejemplo, https://drive.google.com/file/d/…/view).';
  return 'Para enlaces de YouTube o de Google Drive, elige esa fuente.';
}

/** Ruta pública de las portadas subidas (19/11/2026); el archivo vive en disco, no en MySQL (course-cover.storage.ts). */
export const COVER_URL_PREFIX = '/api/v1/public/course-covers/';
/** Nombre de archivo administrado: UUID v4 en minúsculas y extensión permitida. Nada más (ni rutas ni puntos extra). */
const MANAGED_COVER_FILE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$/;

/** Devuelve el nombre si es un nombre de portada administrada válido; si no, null. */
export function managedCoverFile(name: string | null | undefined): string | null {
  return name && MANAGED_COVER_FILE.test(name) ? name : null;
}

/** Devuelve el nombre del archivo si `url` es una portada subida a este servidor; si no, null. */
export function managedCoverOf(url: string | null | undefined): string | null {
  if (!url?.startsWith(COVER_URL_PREFIX)) return null;
  return managedCoverFile(url.slice(COVER_URL_PREFIX.length));
}

/**
 * Portada: ruta relativa del proyecto, URL https o ruta de una portada subida; null si está vacía; undefined si no es
 * válida. Máximo 500 caracteres (columna `courses.cover_image`).
 */
export function normalizeCover(value: string | null | undefined): string | null | undefined {
  const v = value?.trim();
  if (!v) return null;
  if (v.length > 500) return undefined;
  if (managedCoverOf(v)) return v;
  if (/^https:\/\/\S+$/i.test(v)) return v;
  if (!v.includes('..') && /^[\w-]+(\/[\w.-]+)*\.(svg|png|jpe?g|webp)$/i.test(v)) return v;
  return undefined;
}

export function mmss(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

/**
 * RN-03 para un curso YA PUBLICADO (acceso de los estudiantes al examen): al menos 1 video publicado en total
 * (21/11/2026), sin máximo y sin límite de duración. No bloquea de forma retroactiva por módulos sin videos publicados.
 */
export function ruleIssues(published: readonly unknown[]): string[] {
  return published.length < MIN_VIDEOS ? ['El curso no tiene videos publicados; se requiere al menos 1 video publicado.'] : [];
}

/**
 * RN-03 para PUBLICAR un curso: revisa módulo por módulo. Cada módulo necesita al menos 1 video publicado propio
 * (21/11/2026; antes eran 5). Sin máximo de videos y sin límite de duración (20/11/2026).
 */
export function moduleRuleIssues(modules: readonly { id: string; title: string }[], published: readonly { moduleId: string }[]): string[] {
  return modules.flatMap((m, i) => {
    const count = published.filter((v) => v.moduleId === m.id).length;
    return count < MIN_VIDEOS
      ? [`Módulo ${i + 1} «${m.title}»: no tiene videos publicados; se requiere al menos 1 video publicado por módulo.`]
      : [];
  });
}
