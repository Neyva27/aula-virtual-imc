import { Injectable, signal } from '@angular/core';
import { DEMO_CONFIG } from '../config/demo.config';

export interface ExamSession {
  userId: string;
  /** Examen al que pertenece la sesión (E2). Las sesiones anteriores no lo tienen. */
  examId?: string;
  startedAt: number;
  endsAt: number;
  answers: Record<string, string[]>;
  index: number;
  /** Etapa 1: ya se mostró el aviso de 5 minutos en este intento (no se repite, tampoco al recargar). */
  timeWarningShown?: boolean;
}

/**
 * Examen en curso, SIMULADO en el navegador (sessionStorage).
 * En la versión real, el servidor controla el inicio, el tiempo y guarda las respuestas (RN-13, RN-14).
 */
@Injectable({ providedIn: 'root' })
export class ExamSessionService {
  private readonly key = 'imc-demo-exam-session';
  private readonly _session = signal<ExamSession | null>(this.restore());
  readonly session = this._session.asReadonly();

  start(userId: string, minutes: number, examId?: string): void {
    const now = Date.now();
    this.set({
      userId,
      ...(examId ? { examId } : {}),
      startedAt: now,
      endsAt: now + minutes * 60_000,
      answers: {},
      index: 0,
    });
  }

  /**
   * Etapa 2B, Bloque 2 (R2): usa el inicio registrado en el repositorio (fuente de verdad del tiempo). Si la sesión
   * del navegador ya es de ese examen, conserva la pregunta actual y el aviso de 5 minutos; se corrigen los horarios.
   * Si no hay sesión (otra pestaña) o es de otro examen, empieza una nueva. Corrección de R3: en ambos casos toma las
   * respuestas guardadas en el repositorio (`saved`) y devuelve las que solo estaban en este navegador.
   */
  adopt(
    userId: string,
    examId: string,
    startedAt: number,
    endsAt: number,
    saved: Record<string, string[]> = {},
  ): Record<string, string[]> {
    const s = this._session();
    // Una sesión anterior a E2 (sin examen) es del examen del curso principal.
    const sameExam = !!s && (s.examId ? s.examId === examId : examId === `${DEMO_CONFIG.legacyCourseId}-e1`);
    if (s && s.userId === userId && sameExam) {
      // Corrección de R3: mandan las respuestas guardadas en el repositorio; las que solo están en este navegador
      // (por ejemplo, de antes de guardarse en el repositorio) se conservan y se devuelven para subirlas.
      const localOnly = Object.fromEntries(Object.entries(s.answers).filter(([id, v]) => !(id in saved) && v.length > 0));
      this.set({ ...s, examId, startedAt, endsAt, answers: { ...s.answers, ...saved } });
      return localOnly;
    }
    this.set({ userId, examId, startedAt, endsAt, answers: { ...saved }, index: 0 });
    return {};
  }

  /**
   * Etapa 2B, Bloque 2 (R2): la sesión es de este usuario y examen, aunque su tiempo ya se haya agotado (al volver
   * al examen con el tiempo vencido se envía lo registrado, en lugar de reiniciarlo).
   */
  belongsToExam(userId: string, exam: { id: string; courseId: string }): boolean {
    const s = this._session();
    if (!s || s.userId !== userId) return false;
    return s.examId ? s.examId === exam.id : exam.courseId === DEMO_CONFIG.legacyCourseId;
  }

  setAnswer(questionId: string, values: string[]): void {
    const s = this._session();
    if (!s) return;
    this.set({ ...s, answers: { ...s.answers, [questionId]: values } });
  }

  setIndex(index: number): void {
    const s = this._session();
    if (!s) return;
    this.set({ ...s, index });
  }

  /** Registra que el aviso de 5 minutos ya se mostró en este intento. */
  markTimeWarningShown(): void {
    const s = this._session();
    if (!s || s.timeWarningShown) return;
    this.set({ ...s, timeWarningShown: true });
  }

  /** Sin `examId` se comporta como antes; con `examId`, la sesión debe pertenecer a ese examen. */
  isActiveFor(userId: string, examId?: string): boolean {
    const s = this._session();
    return !!s && s.userId === userId && (!examId || s.examId === examId) && Date.now() < s.endsAt;
  }

  /** Sesión activa del usuario para ese examen. Una sesión anterior a E2 (sin examen) es del curso principal. */
  isActiveForExam(userId: string, exam: { id: string; courseId: string }): boolean {
    const s = this._session();
    if (!s || s.userId !== userId || Date.now() >= s.endsAt) return false;
    return s.examId ? s.examId === exam.id : exam.courseId === DEMO_CONFIG.legacyCourseId;
  }

  clear(): void {
    this._session.set(null);
    try {
      sessionStorage.removeItem(this.key);
    } catch {
      /* sin almacenamiento disponible */
    }
  }

  private set(session: ExamSession): void {
    this._session.set(session);
    try {
      sessionStorage.setItem(this.key, JSON.stringify(session));
    } catch {
      /* sin almacenamiento disponible */
    }
  }

  private restore(): ExamSession | null {
    try {
      const raw = sessionStorage.getItem(this.key);
      const s = raw ? (JSON.parse(raw) as ExamSession) : null;
      // Se descarta una sesión con forma no reconocida en lugar de restaurarla a medias.
      const valid =
        !!s &&
        typeof s.userId === 'string' &&
        typeof s.startedAt === 'number' &&
        typeof s.endsAt === 'number' &&
        typeof s.answers === 'object' &&
        (s.examId === undefined || typeof s.examId === 'string');
      return valid ? s : null;
    } catch {
      return null;
    }
  }
}
