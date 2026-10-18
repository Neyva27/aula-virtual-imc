import { Injectable, signal } from '@angular/core';

export interface ExamSession {
  userId: string;
  startedAt: number;
  endsAt: number;
  answers: Record<string, string[]>;
  index: number;
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

  start(userId: string, minutes: number): void {
    const now = Date.now();
    this.set({ userId, startedAt: now, endsAt: now + minutes * 60_000, answers: {}, index: 0 });
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

  isActiveFor(userId: string): boolean {
    const s = this._session();
    return !!s && s.userId === userId && Date.now() < s.endsAt;
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
      return raw ? (JSON.parse(raw) as ExamSession) : null;
    } catch {
      return null;
    }
  }
}
