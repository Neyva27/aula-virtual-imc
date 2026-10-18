import { Injectable } from '@angular/core';
import { Observable, of, delay, throwError } from 'rxjs';
import { DataRepository } from './data-repository';
import { User } from '../models/user.model';
import {
  Course,
  CoursePatch,
  Enrollment,
  MAX_VIDEOS,
  MAX_VIDEO_MIN,
  MIN_VIDEOS,
  MIN_VIDEO_MIN,
  ParticipantInput,
  VideoInput,
} from '../models/course.model';
import { Attempt, ExamConfig, Question } from '../models/exam.model';
import { Certificate } from '../models/certificate.model';
import { DEMO_CONFIG } from '../config/demo.config';
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
const STORAGE_KEY = 'imc-demo-state-v2';

interface DemoState {
  users: User[];
  course: Course;
  exam: ExamConfig;
  questions: Question[];
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
 * Todo lo que aquí se valida o calcula debe hacerlo el servidor en la versión real.
 */
@Injectable()
export class MockDataRepository extends DataRepository {
  private state: DemoState = this.load();

  // ================= Lecturas =================
  getUsers(): Observable<User[]> {
    return respond(this.state.users);
  }

  getCourse(): Observable<Course> {
    return respond(this.state.course);
  }

  getEnrollment(userId: string): Observable<Enrollment | null> {
    return respond(this.state.enrollments.find((e) => e.userId === userId) ?? null);
  }

  getEnrollments(): Observable<Enrollment[]> {
    return respond(this.state.enrollments);
  }

  getExamConfig(): Observable<ExamConfig> {
    return respond(this.state.exam);
  }

  getQuestions(): Observable<Question[]> {
    return respond(this.state.questions);
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

  // ================= Participante =================
  markVideoCompleted(userId: string, videoId: string): Observable<Enrollment> {
    const enrollment = this.state.enrollments.find((e) => e.userId === userId);
    if (!enrollment) return fail('No tienes un curso asignado.');

    if (!enrollment.completedVideoIds.includes(videoId)) {
      enrollment.completedVideoIds.push(videoId);
    }
    if (!enrollment.startDate) enrollment.startDate = today();
    this.recompute();
    this.save();
    return respond(enrollment);
  }

  submitAttempt(
    userId: string,
    answers: Record<string, string[]>,
    durationSec: number,
  ): Observable<Attempt> {
    const enrollment = this.state.enrollments.find((e) => e.userId === userId);
    const user = this.state.users.find((u) => u.id === userId);
    if (!enrollment || !user) return fail('No tienes un curso asignado.');

    const total = this.publishedCount();
    if (this.completedPublished(enrollment) < total) {
      return fail('Debes completar todos los videos antes de rendir el examen.'); // RN-11
    }
    if (enrollment.status === 'aprobado') return fail('Ya aprobaste este examen.');

    const used = this.state.attempts.filter((a) => a.userId === userId).length;
    if (used >= this.state.exam.maxAttempts) {
      return fail('Alcanzaste el límite de intentos permitidos.'); // RN-07
    }

    const { earned, totalPoints, correctCount } = this.grade(answers);
    const score = totalPoints ? Math.round((earned / totalPoints) * this.state.exam.scaleMax) : 0;
    const passed = score >= this.state.exam.passScore;

    const attempt: Attempt = {
      id: `att-${Date.now()}`,
      userId,
      date: new Date().toISOString(),
      durationSec,
      score,
      correctCount,
      totalQuestions: this.state.questions.length,
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
        courseName: this.state.course.name,
        approvalDate: today(),
        issueDate: today(),
        score,
        trainingHours: this.state.course.trainingHours,
        entityName: DEMO_CONFIG.entityName,
        status: 'vigente',
      });
    }

    this.save();
    return respond(attempt);
  }

  // ================= Administración =================
  addParticipant(input: ParticipantInput): Observable<User> {
    const fullName = input.fullName.trim();
    const email = input.email.trim().toLowerCase();
    const dni = input.dni.trim();
    if (fullName.length < 3) return fail('Ingresa nombres y apellidos.');
    if (!/^\S+@\S+\.\S+$/.test(email)) return fail('Ingresa un correo electrónico válido.');
    if (!/^\d{8}$/.test(dni)) return fail('El DNI debe tener 8 dígitos.');
    // RN-01: cada correo debe ser único
    if (this.state.users.some((u) => u.email.toLowerCase() === email)) {
      return fail('Ya existe un usuario con ese correo electrónico.');
    }
    if (this.state.users.some((u) => u.dni === dni)) {
      return fail('Ya existe un participante con ese DNI.');
    }

    const user: User = { id: `u${Date.now()}`, fullName, email, dni, role: 'participant' };
    this.state.users.push(user);
    this.state.enrollments.push({
      userId: user.id,
      courseId: this.state.course.id,
      completedVideoIds: [],
      status: 'pendiente',
    });
    this.save();
    return respond(user);
  }

  updateCourse(patch: CoursePatch): Observable<Course> {
    const name = patch.name.trim();
    const description = patch.description.trim();
    if (!name) return fail('Ingresa el nombre del curso.');
    if (!description) return fail('Ingresa la descripción del curso.');
    if (!(patch.trainingHours >= 1)) return fail('Las horas de formación deben ser al menos 1.');
    if (patch.status === 'publicado' && this.publishedCount() < MIN_VIDEOS) {
      return fail(`Para publicar el curso necesitas al menos ${MIN_VIDEOS} videos publicados.`);
    }
    Object.assign(this.state.course, {
      name,
      description,
      status: patch.status,
      trainingHours: patch.trainingHours,
    });
    this.save();
    return respond(this.state.course);
  }

  saveVideo(input: VideoInput): Observable<Course> {
    const title = input.title.trim();
    if (!title) return fail('Ingresa el título del video.');
    if (
      !Number.isInteger(input.durationMin) ||
      input.durationMin < MIN_VIDEO_MIN ||
      input.durationMin > MAX_VIDEO_MIN
    ) {
      return fail(`La duración debe estar entre ${MIN_VIDEO_MIN} y ${MAX_VIDEO_MIN} minutos.`); // RN-03
    }
    const course = this.state.course;
    const data = {
      title,
      description: input.description?.trim() || undefined,
      durationMin: input.durationMin,
      url: input.url?.trim() || undefined,
      published: input.published,
    };

    if (input.id) {
      const video = course.videos.find((v) => v.id === input.id);
      if (!video) return fail('No se encontró el video.');
      if (video.published && !data.published && this.publishedCount() - 1 < MIN_VIDEOS) {
        return fail(`El curso necesita al menos ${MIN_VIDEOS} videos publicados.`);
      }
      Object.assign(video, data);
    } else {
      if (course.videos.length >= MAX_VIDEOS) {
        return fail(`Un curso admite como máximo ${MAX_VIDEOS} videos.`); // RN-03
      }
      course.videos.push({ id: `v${Date.now()}`, order: course.videos.length + 1, ...data });
    }
    this.recompute();
    this.save();
    return respond(course);
  }

  moveVideo(videoId: string, delta: -1 | 1): Observable<Course> {
    const videos = [...this.state.course.videos].sort((a, b) => a.order - b.order);
    const i = videos.findIndex((v) => v.id === videoId);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= videos.length) return respond(this.state.course);
    [videos[i], videos[j]] = [videos[j], videos[i]];
    videos.forEach((v, idx) => (v.order = idx + 1));
    this.state.course.videos = videos;
    this.save();
    return respond(this.state.course);
  }

  setVideoPublished(videoId: string, published: boolean): Observable<Course> {
    const video = this.state.course.videos.find((v) => v.id === videoId);
    if (!video) return fail('No se encontró el video.');
    if (video.published && !published && this.publishedCount() - 1 < MIN_VIDEOS) {
      return fail(`El curso necesita al menos ${MIN_VIDEOS} videos publicados.`);
    }
    video.published = published;
    this.recompute();
    this.save();
    return respond(this.state.course);
  }

  deleteVideo(videoId: string): Observable<Course> {
    const course = this.state.course;
    if (course.videos.length - 1 < MIN_VIDEOS) {
      return fail(`Un curso debe tener como mínimo ${MIN_VIDEOS} videos.`); // RN-03
    }
    const video = course.videos.find((v) => v.id === videoId);
    if (!video) return fail('No se encontró el video.');
    if (video.published && this.publishedCount() - 1 < MIN_VIDEOS) {
      return fail(`El curso necesita al menos ${MIN_VIDEOS} videos publicados.`);
    }
    course.videos = course.videos
      .filter((v) => v.id !== videoId)
      .sort((a, b) => a.order - b.order);
    course.videos.forEach((v, idx) => (v.order = idx + 1));
    this.state.enrollments.forEach((e) => {
      e.completedVideoIds = e.completedVideoIds.filter((id) => id !== videoId);
    });
    this.recompute();
    this.save();
    return respond(course);
  }

  updateExamConfig(config: ExamConfig): Observable<ExamConfig> {
    if (!Number.isInteger(config.timeMinutes) || config.timeMinutes < 1 || config.timeMinutes > 240) {
      return fail('El tiempo debe estar entre 1 y 240 minutos.');
    }
    if (config.scaleMax !== 20 && config.scaleMax !== 100) {
      return fail('La escala de nota debe ser 20 o 100.');
    }
    if (!(config.passScore >= 0 && config.passScore <= config.scaleMax)) {
      return fail(`La nota mínima debe estar entre 0 y ${config.scaleMax}.`);
    }
    if (!Number.isInteger(config.maxAttempts) || config.maxAttempts < 1 || config.maxAttempts > 10) {
      return fail('Los intentos permitidos deben estar entre 1 y 10.');
    }
    this.state.exam = { ...config };
    this.save();
    return respond(this.state.exam);
  }

  saveQuestion(question: Question): Observable<Question[]> {
    const text = question.text.trim();
    const options = question.options.map((o) => ({ id: o.id, text: o.text.trim() }));
    if (!text) return fail('Escribe el enunciado de la pregunta.');
    if (options.length < 2 || options.some((o) => !o.text)) {
      return fail('Completa el texto de todas las opciones (mínimo 2).');
    }
    const ids = new Set(options.map((o) => o.id));
    const correct = question.correct.filter((id) => ids.has(id));
    if (correct.length === 0) return fail('Marca la respuesta correcta.'); // RN-12
    if (question.type !== 'multiple' && correct.length !== 1) {
      return fail('Esta pregunta debe tener una sola respuesta correcta.');
    }
    if (!(question.points > 0)) return fail('El puntaje debe ser mayor que 0.'); // RN-12

    const clean: Question = { ...question, text, options, correct };
    const list = this.state.questions;
    const idx = list.findIndex((q) => q.id === question.id);
    if (idx >= 0) {
      list[idx] = clean;
    } else {
      list.push({ ...clean, id: `q${Date.now()}` });
    }
    this.save();
    return respond(list);
  }

  deleteQuestion(questionId: string): Observable<Question[]> {
    if (this.state.questions.length <= 1) return fail('El examen necesita al menos una pregunta.');
    this.state.questions = this.state.questions.filter((q) => q.id !== questionId);
    this.save();
    return respond(this.state.questions);
  }

  resetDemo(): void {
    this.state = this.fresh();
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* sin almacenamiento disponible */
    }
  }

  // ================= Internos =================
  private publishedIds(): Set<string> {
    return new Set(this.state.course.videos.filter((v) => v.published).map((v) => v.id));
  }

  private publishedCount(): number {
    return this.publishedIds().size;
  }

  private completedPublished(e: Enrollment): number {
    const ids = this.publishedIds();
    return e.completedVideoIds.filter((id) => ids.has(id)).length;
  }

  /** Recalcula el estado de quienes aún no rinden/aprueban según los videos publicados. */
  private recompute(): void {
    const total = this.publishedCount();
    for (const e of this.state.enrollments) {
      if (e.status === 'aprobado' || e.status === 'desaprobado') continue;
      const done = this.completedPublished(e);
      e.status = done === 0 ? 'pendiente' : done < total ? 'en_progreso' : 'listo_examen';
    }
  }

  /** Selección múltiple: correcta solo si coincide exactamente con la respuesta. */
  private grade(answers: Record<string, string[]>) {
    let earned = 0;
    let totalPoints = 0;
    let correctCount = 0;
    for (const q of this.state.questions) {
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
      users: SEED_USERS,
      course: SEED_COURSE,
      exam: SEED_EXAM,
      questions: SEED_QUESTIONS,
      enrollments: SEED_ENROLLMENTS,
      attempts: SEED_ATTEMPTS,
      certificates: SEED_CERTIFICATES,
    });
  }

  private load(): DemoState {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const p = JSON.parse(raw) as DemoState;
        if (
          Array.isArray(p.users) &&
          Array.isArray(p.questions) &&
          Array.isArray(p.enrollments) &&
          Array.isArray(p.attempts) &&
          Array.isArray(p.certificates) &&
          p.course &&
          Array.isArray(p.course.videos) &&
          p.exam
        ) {
          return p;
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
