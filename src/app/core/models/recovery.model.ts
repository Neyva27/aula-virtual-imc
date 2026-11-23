import { Exam } from './exam.model';

/**
 * Etapa 2B, Bloque 2 (R1): estructuras de la recuperación de exámenes (documento consolidado del 10/11/2026).
 * Solo modelos: la autorización, la anulación, el inicio y el envío se implementan en los subbloques siguientes.
 * Todas las fechas son ISO 8601 con la zona horaria explícita (Lima, -05:00).
 */

/** Por qué se autoriza: el intento regular se calificó y no aprobó, o el estudiante no tiene ningún intento. */
export type RecoveryReason = 'desaprobado' | 'ausente';

/**
 * Modalidad. Decisión definitiva (20/11/2026): las nuevas recuperaciones son SIEMPRE 'original' (el examen regular
 * tal cual, sin duplicarlo ni modificarlo: RN-15). 'independiente' se conserva solo para leer datos históricos.
 */
export type RecoveryMode = 'original' | 'independiente';

/**
 * R3: datos para autorizar. Las fechas deben traer la zona horaria explícita (por ejemplo, `2026-11-12T09:00-05:00`)
 * para no depender del reloj ni de la configuración regional del navegador; se guardan en hora de Lima (-05:00).
 */
export interface RecoveryInput {
  userId: string;
  courseId: string;
  /** Opcional: siempre 'original' (examen original del curso). */
  mode?: 'original';
  /** Compatibilidad: si se envía, debe ser el examen original. */
  recoveryExamId?: string;
  opensAt: string;
  closesAt: string;
}

/**
 * Recuperación autorizada por el Instructor para un estudiante en un curso. Nunca crea un intento por sí misma
 * (un ausente no tiene intento ficticio). Como máximo una no anulada por estudiante y curso.
 */
export interface Recovery {
  id: string;
  userId: string;
  courseId: string;
  /** Examen regular del curso al que corresponde la recuperación. */
  regularExamId: string;
  /** Examen que se rinde: el mismo regular (reutilizado) o un examen de recuperación (`Exam.kind = 'recuperacion'`). */
  examId: string;
  reason: RecoveryReason;
  /** R3: modalidad elegida (`examId` es el examen regular en 'original'). */
  mode: RecoveryMode;
  /** Inicio y cierre exactos de la ventana. */
  opensAt: string;
  closesAt: string;
  /** Instructor que la autorizó. */
  authorizedBy: string;
  authorizedAt: string;
  /** Anulada antes de iniciarse: no consume la oportunidad. */
  cancelledAt?: string;
  /** Inicio registrado: desde aquí ya no se puede anular. */
  startedAt?: string;
  /** Intento de recuperación enviado. */
  attemptId?: string;
  /**
   * Corrección de R3: fecha en que el repositorio constató que la ventana cerró sin que el estudiante la iniciara.
   * Se guarda una sola vez y es definitiva: el estado queda «No rindió recuperación» aunque luego cambien las fechas.
   * Nunca se registra en una recuperación iniciada o anulada. No crea intento ni nota.
   */
  noShowAt?: string;
}

/**
 * Estado que se muestra. Corrección de R3: «no_rindio» sale de `noShowAt` (registro permanente de una ventana que
 * cerró sin inicio); una recuperación iniciada se entrega siempre (por el estudiante o automáticamente) y queda
 * «rendida».
 */
export type RecoveryStatus = 'pendiente' | 'autorizada' | 'anulada' | 'rendida' | 'no_rindio';

/** R4: textos de los estados de recuperación para las pantallas. */
export const RECOVERY_STATUS_LABELS: Record<RecoveryStatus, string> = {
  pendiente: 'Pendiente',
  autorizada: 'Autorizada',
  anulada: 'Anulada',
  rendida: 'Rendida',
  no_rindio: 'No rindió recuperación',
};

/**
 * R3: situación de recuperación de un estudiante en un curso, calculada al consultar (no se guarda).
 * - `status: null`: no puede recibir una recuperación (aprobó, está pendiente de calificación, está rindiendo el
 *   examen regular o no está inscrito); `reason` explica por qué.
 * - `recovery`: la autorización vigente (no anulada) o, si no hay, la última anulada; null si nunca tuvo una.
 * Una autorización que cerró sin inicio queda como 'no_rindio' (`noShowAt`) y consume la oportunidad: no se crea
 * ningún intento ni nota; si había un intento regular desaprobado, esa nota se conserva.
 */
export interface RecoveryState {
  userId: string;
  courseId: string;
  status: RecoveryStatus | null;
  reason: string;
  recovery: Recovery | null;
}

/**
 * Etapa 2B, Bloque 2 (R2): resultado de `startExam`. Si el estudiante ya había iniciado ese examen (recarga u otra
 * pestaña), es el mismo inicio registrado: el tiempo no se reinicia.
 */
export interface StartedExam {
  exam: Exam;
  startedAt: string;
  endsAt: string;
  /** Corrección de R3: respuestas guardadas en el repositorio para este inicio (vacío si aún no hay). */
  answers: Record<string, string[]>;
}

/** Inicio de un examen registrado en el repositorio (regular o de recuperación). */
export interface ExamStart {
  userId: string;
  examId: string;
  /** Solo si el inicio corresponde a una recuperación. */
  recoveryId?: string;
  startedAt: string;
  /**
   * Fin del intento: inicio + duración configurada. Corrección de R3 (regla E): en una recuperación, el cierre de la
   * ventana solo limita el inicio; quien empezó a tiempo tiene la duración completa.
   */
  endsAt: string;
  /**
   * Corrección de R3: respuestas guardadas mientras el estudiante responde (por pregunta), para recargas, otras
   * pestañas y la entrega automática. Solo las preguntas respondidas; nunca se inventan.
   */
  answers?: Record<string, string[]>;
  answersUpdatedAt?: string;
  /** Corrección de R3: el inicio ya se entregó (voluntaria, por tiempo o cierre automático). Se marca una sola vez. */
  closedAt?: string;
  /** Intento registrado al entregar (no existe si el estudiante ya tenía su intento por otra vía, datos anteriores). */
  attemptId?: string;
}
