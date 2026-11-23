/**
 * Regla de negocio (decisión del 27/10/2026, reemplaza a RN-07 y RN-10 en cuanto a los intentos):
 * cada alumno tiene un solo intento por examen de cada curso, y no es configurable.
 */
export const MAX_ATTEMPTS = 1;

/**
 * RN-15 (decisión B, sección 16.5 de PENDIENTES.md): un examen con al menos un intento registrado no admite
 * cambios en su configuración ni en sus preguntas, para no alterar los resultados históricos.
 */
export const EXAM_LOCKED_MESSAGE =
  'Esta evaluación no se puede modificar porque ya existen intentos registrados. Los cambios podrían afectar la ' +
  'integridad de los resultados históricos. La creación de una nueva versión de la evaluación aún no está disponible.';

/**
 * Etapa 2A (requisito 18): la suma de los puntajes de las preguntas debe ser EXACTAMENTE la nota máxima (escala 20 o
 * 100). Con el curso en borrador se informa; con el curso publicado se exige (igual que RN-03). No cambia el cálculo de
 * la nota: con la suma igual a la escala, «obtenido / total × escala» equivale a sumar los puntos obtenidos.
 */
export interface ScoreDistribution {
  total: number;
  max: number;
  /** total − max: negativo = faltan puntos; positivo = sobran. */
  difference: number;
  valid: boolean;
  message: string;
}

/** Redondeo a centésimas para comparar sumas con medios puntos sin errores de coma flotante. */
const cents = (n: number) => Math.round(n * 100) / 100;

export function scoreDistribution(questions: readonly Pick<Question, 'points'>[], scaleMax: number): ScoreDistribution {
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

export interface ExamConfig {
  timeMinutes: number;
  passScore: number;
  /** Siempre MAX_ATTEMPTS. Los datos guardados antes de la regla pueden traer otro valor, que no se usa. */
  maxAttempts: number;
  scaleMax: number; // 100 o 20: pendiente de definición
  /** Modo API (18/11/2026): desde cuándo se puede rendir (ISO 8601); null o ausente = sin restricción. */
  availableFrom?: string | null;
}

/**
 * Un curso puede tener varios exámenes (reunión del 23/10). Mientras no se defina la política,
 * la interfaz trabaja con un único examen activo por curso.
 */
export interface Exam extends ExamConfig {
  id: string;
  courseId: string;
  title: string;
  active: boolean;
  /**
   * Etapa 2B, Bloque 2 (R1): 'regular' (por defecto, también si falta) o 'recuperacion'. Un examen de recuperación
   * conserva la escala, la nota mínima y la duración del original (`parentExamId`).
   */
  kind?: ExamKind;
  /** Solo exámenes de recuperación: examen regular del que hereda la configuración académica. */
  parentExamId?: string;
}

export type ExamKind = 'regular' | 'recuperacion';

/** Tipo de examen; los exámenes guardados antes del Bloque 2 no lo tienen y son regulares. */
export function examKind(exam: Pick<Exam, 'kind'>): ExamKind {
  return exam.kind ?? 'regular';
}

/**
 * «open» = respuesta abierta (29/10/2026): excepción autorizada a RN-12. No tiene opciones ni respuesta correcta;
 * `points` es el puntaje máximo y la califica manualmente el administrador.
 */
export type QuestionType = 'single' | 'multiple' | 'truefalse' | 'open';

/** Límite de longitud de una respuesta abierta (técnico, para el almacenamiento del navegador). */
export const OPEN_ANSWER_MAX = 4000;
/** Alternativas por pregunta de selección (2 como mínimo). */
export const MAX_OPTIONS = 8;

export interface QuestionOption {
  id: string;
  text: string;
}

export interface Question {
  id: string;
  type: QuestionType;
  text: string;
  options: QuestionOption[];
  correct: string[]; // RN-12: respuesta correcta definida (vacía en las preguntas abiertas)
  points: number; // RN-12: puntuación asignada (en las abiertas, el puntaje máximo)
  /** Solo preguntas abiertas: criterio de calificación para quien califica (opcional, no se muestra al alumno). */
  rubric?: string;
  /**
   * Etapa 2B (P1): solo selección múltiple. Cantidad EXACTA de alternativas que debe marcar el alumno, con
   * correctas ≤ selectCount < alternativas. Si falta (preguntas anteriores a la 2B), vale la cantidad de correctas.
   */
  selectCount?: number;
}

/** Pregunta guardada, ligada a su examen. */
export interface ExamQuestion extends Question {
  examId: string;
}

/**
 * Etapa 2B, Bloque 1: calificación proporcional (decisiones D1–D4 del 09/11/2026).
 * - 'proporcional': la usan TODOS los intentos nuevos. Selección múltiple: aciertos / correctas × puntaje; las
 *   incorrectas no restan, pero ocupan espacios de selección. Selección única y verdadero/falso: igual que antes.
 * - 'todo_o_nada': regla de los intentos anteriores a la 2B (sin `gradingRule`). No se recalculan; solo se usa para
 *   terminar de calificar los que quedaron «En revisión».
 */
export type GradingRule = 'proporcional' | 'todo_o_nada';

/** Regla con la que se calificó (o se debe terminar de calificar) un intento. */
export function attemptRule(attempt: Pick<Attempt, 'gradingRule'>): GradingRule {
  return attempt.gradingRule ?? 'todo_o_nada';
}

/**
 * Cómo se entrega un intento (D3, P4): 'voluntaria' exige todas las preguntas completas; 'tiempo' (al agotarse el
 * tiempo) envía solo lo registrado y no exige completar nada.
 */
export type SubmitMode = 'voluntaria' | 'tiempo';

type Gradable = Pick<Question, 'type' | 'options' | 'correct' | 'points' | 'selectCount'>;

/** Alternativas que el alumno debe marcar: la cantidad configurada en selección múltiple; 1 en única y V/F; 0 en abiertas. */
export function requiredSelections(q: Pick<Question, 'type' | 'correct' | 'selectCount'>): number {
  if (q.type === 'open') return 0;
  if (q.type === 'multiple') return q.selectCount ?? q.correct.length;
  return 1;
}

/** Marcas válidas del alumno: sin repetidas y solo de alternativas que existen en la pregunta. */
function validSelections(q: Pick<Question, 'options'>, given: readonly string[] | undefined): string[] {
  const ids = new Set(q.options.map((o) => o.id));
  return [...new Set(given ?? [])].filter((id) => typeof id === 'string' && ids.has(id));
}

/** Cuántas alternativas válidas marcó el alumno. */
export function selectedCount(q: Pick<Question, 'options'>, given: readonly string[] | undefined): number {
  return validSelections(q, given).length;
}

/**
 * P1: en selección múltiple, correctas ≤ cantidad exigida < alternativas. Devuelve el mensaje de error o ''.
 * Las demás reglas de la pregunta (enunciado, opciones, puntaje) las valida el repositorio.
 */
export function selectionError(q: Pick<Question, 'type' | 'options' | 'correct' | 'selectCount'>): string {
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

/**
 * D3: la pregunta está completa para la entrega voluntaria. Selección múltiple: exactamente la cantidad exigida;
 * única y V/F: una marca; abierta: texto no vacío.
 */
export function isComplete(q: Pick<Question, 'type' | 'options' | 'correct' | 'selectCount'>, given: readonly string[] | undefined): boolean {
  if (q.type === 'open') return !!given?.[0]?.trim();
  return selectedCount(q, given) === requiredSelections(q);
}

/**
 * Puntos automáticos de una pregunta (sin redondear). Las abiertas valen 0 aquí: las califica el instructor.
 * Nunca es negativo ni supera el puntaje de la pregunta.
 */
export function questionPoints(q: Gradable, given: readonly string[] | undefined, rule: GradingRule): number {
  if (q.type === 'open') return 0;
  if (rule === 'todo_o_nada') {
    // Algoritmo original sin cambios (intentos anteriores a la 2B): coincidencia exacta con la respuesta correcta.
    const sorted = [...(given ?? [])].sort();
    const expected = [...q.correct].sort();
    return sorted.length === expected.length && sorted.every((v, i) => v === expected[i]) ? q.points : 0;
  }
  const marked = validSelections(q, given);
  // Más marcas que las exigidas (solo posible manipulando el envío): la pregunta vale 0.
  if (marked.length === 0 || marked.length > requiredSelections(q) || q.correct.length === 0) return 0;
  const hits = marked.filter((id) => q.correct.includes(id)).length;
  return Math.min(q.points, Math.max(0, (hits / q.correct.length) * q.points));
}

export interface Attempt {
  id: string;
  userId: string;
  courseId: string;
  examId: string;
  date: string; // ISO
  durationSec: number;
  score: number;
  scaleMax: number; // escala vigente al calificar
  correctCount: number;
  totalQuestions: number;
  passed: boolean;
  /** Respuestas enviadas (desde el 29/10/2026). En una pregunta abierta es `[texto]`. Los intentos anteriores no las tienen. */
  answers?: Record<string, string[]>;
  /**
   * Etapa 2B (D4): regla con la que se calificó. Los intentos nuevos guardan 'proporcional'; si falta, el intento es
   * anterior y se calificó con «todo o nada» (esa regla se conserva, también al terminar una revisión pendiente).
   */
  gradingRule?: GradingRule;
  /** Etapa 2B: puntos automáticos por pregunta, sin redondear (trazabilidad; las abiertas van en `review`). */
  questionScores?: Record<string, number>;
  /** Etapa 2B: suma de los puntajes máximos de las preguntas al momento de rendir (incluye las abiertas). */
  maxPoints?: number;
  /**
   * Etapa 2B, Bloque 2 (corrección de R3): 'recuperacion' para el intento de una recuperación (con `recoveryId`);
   * los intentos regulares no lo tienen (los anteriores tampoco).
   */
  kind?: 'regular' | 'recuperacion';
  recoveryId?: string;
  /**
   * Corrección de R3: el repositorio cerró el intento al agotarse el tiempo registrado sin que llegara la entrega
   * (el estudiante cerró el navegador o no volvió). Se calificaron solo las respuestas guardadas.
   */
  autoSubmitted?: true;
  /**
   * Solo en exámenes con preguntas abiertas. Mientras esté «en_revision», `score` y `passed` no son definitivos
   * y no deben mostrarse como aprobado o desaprobado. Sin este campo, el intento se calificó automáticamente.
   */
  review?: AttemptReview;
}

export interface AttemptReview {
  status: 'en_revision' | 'calificado';
  /** Puntaje asignado por el administrador a cada pregunta abierta (0 a su puntaje máximo). */
  manualScores: Record<string, number>;
  gradedAt?: string; // ISO, al completar la calificación
}

/**
 * Etapa 2B (P3): puntos obtenidos (automáticos + abiertas calificadas) frente al puntaje máximo, a partir de lo que se
 * guardó al rendir. Los intentos anteriores a la 2B no guardan el detalle por pregunta: devuelve null (no se recalculan).
 */
export function attemptPoints(
  attempt: Pick<Attempt, 'questionScores' | 'maxPoints' | 'review'>,
): { earned: number; max: number } | null {
  if (!attempt.questionScores || attempt.maxPoints === undefined) return null;
  const sum = (values: Record<string, number>) => Object.values(values).reduce((a, b) => a + b, 0);
  const earned = sum(attempt.questionScores) + sum(attempt.review?.manualScores ?? {});
  return { earned: Math.round(earned * 100) / 100, max: attempt.maxPoints };
}

/**
 * Etapa 2B, Bloque 2 (R4): condición académica en el curso. 'en_revision' = la nota vigente tiene preguntas
 * abiertas sin calificar; 'sin_resultado' = todavía no hay ningún intento (y no consumió su recuperación).
 */
export type AcademicCondition = 'aprobado' | 'desaprobado' | 'en_revision' | 'sin_resultado';

export interface CourseResult {
  /** Último intento regular (se conserva siempre, aunque la recuperación lo reemplace). */
  regular: Attempt | null;
  /** Intento de recuperación, si lo hay. */
  recovery: Attempt | null;
  /** Intento cuya nota vale: la recuperación si existe (aunque su nota sea menor); si no, el regular. */
  current: Attempt | null;
  /** La nota del intento regular ya no es la vigente porque hay una recuperación. */
  regularReplaced: boolean;
  /** Nota final: la del intento vigente; null mientras esté en revisión o si no hay intentos. */
  final: { score: number; scaleMax: number } | null;
  condition: AcademicCondition;
}

/**
 * R4 (regla confirmada: «la nota de recuperación reemplaza siempre la nota del examen original, incluso si es
 * menor»; D-11): nada se promedia ni se recalcula; cada intento conserva su nota. `noShow`: la recuperación quedó
 * como «No rindió»: sin intentos, la condición es «desaprobado» y no hay nota (no se inventa ninguna).
 */
export function courseResult(attempts: readonly Attempt[], noShow = false): CourseResult {
  const latest = (list: Attempt[]) => list.sort((a, b) => Date.parse(b.date) - Date.parse(a.date))[0] ?? null;
  const regular = latest(attempts.filter((a) => a.kind !== 'recuperacion'));
  const recovery = latest(attempts.filter((a) => a.kind === 'recuperacion'));
  const current = recovery ?? regular;
  const base = { regular, recovery, current, regularReplaced: !!recovery && !!regular };
  if (!current) return { ...base, final: null, condition: noShow ? 'desaprobado' : 'sin_resultado' };
  if (isPendingReview(current)) return { ...base, final: null, condition: 'en_revision' };
  return { ...base, final: { score: current.score, scaleMax: current.scaleMax }, condition: current.passed ? 'aprobado' : 'desaprobado' };
}

/** El intento tiene preguntas abiertas sin calificar: aún no hay aprobado ni desaprobado. */
export function isPendingReview(attempt: Pick<Attempt, 'review'>): boolean {
  return attempt.review?.status === 'en_revision';
}

/** Calificación manual de una pregunta abierta (administración). */
export interface OpenAnswerGrade {
  questionId: string;
  score: number;
}

export interface ExamAvailability {
  examId: string | null;
  available: boolean;
  /** Motivo por el que no se puede rendir (cadena vacía si está disponible). */
  reason: string;
  maxAttempts: number;
  remainingAttempts: number;
}
