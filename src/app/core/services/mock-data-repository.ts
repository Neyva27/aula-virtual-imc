import { Injectable } from '@angular/core';
import { Observable, of, delay, throwError } from 'rxjs';
import { DataRepository } from './data-repository';
import { User } from '../models/user.model';
import { Course, Enrollment } from '../models/course.model';
import { Attempt, ExamConfig, Question } from '../models/exam.model';
import { Certificate } from '../models/certificate.model';
import {
  SEED_ATTEMPTS,
  SEED_CERTIFICATES,
  SEED_COURSE,
  SEED_ENROLLMENTS,
  SEED_EXAM,
  SEED_QUESTIONS,
  SEED_USERS,
} from '../data/seed';

const LATENCY_MS = 250; // simula la espera de una API
const STORAGE_KEY = 'imc-demo-state-v1';

interface DemoState {
  enrollments: Enrollment[];
  attempts: Attempt[];
  certificates: Certificate[];
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

/**
 * Datos de demostración con estado guardado en localStorage (solo para presentar el flujo).
 * Todo lo que aquí se "calcula" (progreso, calificación, intentos, emisión del certificado)
 * debe hacerlo el servidor en la versión real.
 */
@Injectable()
export class MockDataRepository extends DataRepository {
  private state: DemoState = this.load();

  // ---------- Lecturas ----------
  getUsers(): Observable<User[]> {
    return respond(SEED_USERS);
  }

  getCourse(): Observable<Course> {
    return respond(SEED_COURSE);
  }

  getEnrollment(userId: string): Observable<Enrollment | null> {
    return respond(this.state.enrollments.find((e) => e.userId === userId) ?? null);
  }

  getEnrollments(): Observable<Enrollment[]> {
    return respond(this.state.enrollments);
  }

  getExamConfig(): Observable<ExamConfig> {
    return respond(SEED_EXAM);
  }

  getQuestions(): Observable<Question[]> {
    return respond(SEED_QUESTIONS);
  }

  getAttempts(userId?: string): Observable<Attempt[]> {
    const list = userId ? this.state.attempts.filter((a) => a.userId === userId) : this.state.attempts;
    return respond(list);
  }

  getCertificates(userId?: string): Observable<Certificate[]> {
    const list = userId
      ? this.state.certificates.filter((c) => c.userId === userId)
      : this.state.certificates;
    return respond(list);
  }

  findCertificateByCode(code: string): Observable<Certificate | null> {
    const wanted = code.trim().toUpperCase();
    return respond(this.state.certificates.find((c) => c.code.toUpperCase() === wanted) ?? null);
  }

  findCertificatesByDni(dni: string): Observable<Certificate[]> {
    return respond(this.state.certificates.filter((c) => c.participantDni === dni.trim()));
  }

  // ---------- Escrituras simuladas ----------
  markVideoCompleted(userId: string, videoId: string): Observable<Enrollment> {
    const enrollment = this.state.enrollments.find((e) => e.userId === userId);
    if (!enrollment) return fail('No tienes un curso asignado.');

    if (!enrollment.completedVideoIds.includes(videoId)) {
      enrollment.completedVideoIds.push(videoId);
    }
    if (!enrollment.startDate) enrollment.startDate = today();

    const total = SEED_COURSE.videos.filter((v) => v.published).length;
    if (enrollment.status === 'pendiente' || enrollment.status === 'en_progreso') {
      enrollment.status = enrollment.completedVideoIds.length >= total ? 'listo_examen' : 'en_progreso';
    }
    this.save();
    return respond(enrollment);
  }

  submitAttempt(
    userId: string,
    answers: Record<string, string[]>,
    durationSec: number,
  ): Observable<Attempt> {
    const enrollment = this.state.enrollments.find((e) => e.userId === userId);
    const user = SEED_USERS.find((u) => u.id === userId);
    if (!enrollment || !user) return fail('No tienes un curso asignado.');

    const total = SEED_COURSE.videos.filter((v) => v.published).length;
    if (enrollment.completedVideoIds.length < total) {
      return fail('Debes completar todos los videos antes de rendir el examen.'); // RN-11
    }
    if (enrollment.status === 'aprobado') return fail('Ya aprobaste este examen.');

    const used = this.state.attempts.filter((a) => a.userId === userId).length;
    if (used >= SEED_EXAM.maxAttempts) return fail('Alcanzaste el límite de intentos permitidos.'); // RN-07

    const { earned, totalPoints, correctCount } = this.grade(answers);
    const score = Math.round((earned / totalPoints) * SEED_EXAM.scaleMax);
    const passed = score >= SEED_EXAM.passScore;

    const attempt: Attempt = {
      id: `att-${Date.now()}`,
      userId,
      date: new Date().toISOString(),
      durationSec,
      score,
      correctCount,
      totalQuestions: SEED_QUESTIONS.length,
      passed,
    };
    this.state.attempts.push(attempt);
    enrollment.status = passed ? 'aprobado' : 'desaprobado';

    // Un solo certificado válido por aprobación (RN-08)
    const alreadyIssued = this.state.certificates.some(
      (c) => c.attemptId === attempt.id || (c.userId === userId && c.status === 'vigente'),
    );
    if (passed && !alreadyIssued) {
      let n = this.state.certificates.length + 1;
      let code: string;
      do {
        code = `IMC-DEMO-${String(n).padStart(4, '0')}`;
        n++;
      } while (this.state.certificates.some((c) => c.code === code));

      this.state.certificates.push({
        id: `cert-${Date.now()}`,
        code,
        userId,
        attemptId: attempt.id,
        participantName: user.fullName,
        participantDni: user.dni,
        courseName: SEED_COURSE.name,
        approvalDate: today(),
        issueDate: today(),
        score,
        trainingHours: SEED_COURSE.trainingHours,
        entityName: SEED_CERTIFICATES[0]?.entityName ?? 'IM Corporación SST Perú',
        status: 'vigente',
      });
    }

    this.save();
    return respond(attempt);
  }

  resetDemo(): void {
    this.state = this.fresh();
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* sin almacenamiento disponible */
    }
  }

  // ---------- Internos ----------
  /** Selección múltiple: se considera correcta solo si coincide exactamente con la respuesta. */
  private grade(answers: Record<string, string[]>) {
    let earned = 0;
    let totalPoints = 0;
    let correctCount = 0;
    for (const q of SEED_QUESTIONS) {
      totalPoints += q.points;
      const given = [...(answers[q.id] ?? [])].sort();
      const expected = [...q.correct].sort();
      const ok = given.length === expected.length && given.every((v, i) => v === expected[i]);
      if (ok) {
        earned += q.points;
        correctCount++;
      }
    }
    return { earned, totalPoints, correctCount };
  }

  private fresh(): DemoState {
    return structuredClone({
      enrollments: SEED_ENROLLMENTS,
      attempts: SEED_ATTEMPTS,
      certificates: SEED_CERTIFICATES,
    });
  }

  private load(): DemoState {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as DemoState;
        if (
          Array.isArray(parsed.enrollments) &&
          Array.isArray(parsed.attempts) &&
          Array.isArray(parsed.certificates)
        ) {
          return parsed;
        }
      }
    } catch {
      /* se usan los datos semilla */
    }
    return this.fresh();
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch {
      /* sin almacenamiento disponible */
    }
  }
}
