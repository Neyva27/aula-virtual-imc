import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '../../generated/prisma/enums.js';
import type { AuthUser } from '../../common/auth-user.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AcademicData, COURSE_NOT_FOUND, type Db, invalid, rule } from './academic.data.js';
import { LiveSessionsService } from './live-sessions.service.js';
import { RecoveriesService, type RecoveryRow, limaLabel } from './recoveries.service.js';
import {
  type AttemptRow,
  type CertificateRow,
  type CourseRow,
  type EnrollmentRow,
  type ExamRow,
  toAttempt,
  toCertificate,
  toCourseRecord,
  toEnrollment,
  toExam,
  toGradable,
  toStudentQuestion,
} from './academic.mappers.js';
import { MAX_ATTEMPTS, OPEN_ANSWER_MAX, TIMEOUT_TOLERANCE_SEC, cleanAnswers, grade, incompleteMessage, ruleIssues } from './academic.rules.js';

interface StartRow {
  id: string;
  studentId: string;
  examId: string;
  startedAt: Date;
  endsAt: Date;
  answers: unknown;
  closedAt: Date | null;
  attemptId: string | null;
}

const isUniqueViolation = (e: unknown) => typeof e === 'object' && e !== null && (e as { code?: unknown }).code === 'P2002';
const asAnswers = (v: unknown): Record<string, string[]> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, string[]>) : {};

/**
 * Módulo académico, operaciones del ESTUDIANTE (18/11/2026). La identidad sale siempre del token: el estudiante solo
 * accede a SUS matrículas, a cursos publicados y activos, y a sus propios intentos y certificados.
 * El tiempo del examen lo controla el servidor (RN-14): el inicio se registra aquí y lo vencido se entrega solo.
 */
@Injectable()
export class LearningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly data: AcademicData,
    private readonly live: LiveSessionsService,
    private readonly recoveries: RecoveriesService,
  ) {}

  private student(actor: AuthUser): string {
    if (actor.role !== Role.STUDENT) throw new ForbiddenException('No tienes permiso para realizar esta acción.');
    return actor.id;
  }

  private visible(course: CourseRow): boolean {
    return course.status === 'PUBLICADO' && course.active;
  }

  /** Matrícula del estudiante en un curso visible (si no, el mensaje que corresponde). */
  private async access(db: Db, studentId: string, courseId: string, notEnrolled = 'No tienes acceso a este curso.') {
    const course = (await db.course.findUnique({ where: { id: courseId } })) as CourseRow | null;
    if (!course) throw new NotFoundException(COURSE_NOT_FOUND);
    const enrollment = (await db.enrollment.findFirst({ where: { studentId, courseId } })) as EnrollmentRow | null;
    if (!enrollment) throw new NotFoundException(notEnrolled);
    if (!this.visible(course)) throw rule('Este curso aún no está disponible.');
    return { course, enrollment };
  }

  // ===================== Cursos y avance =====================

  async myCourses(actor: AuthUser) {
    const studentId = this.student(actor);
    await this.settle(studentId);
    const enrollments = (await this.prisma.enrollment.findMany({ where: { studentId } })) as EnrollmentRow[];
    const list = [];
    for (const enrollment of enrollments) {
      const course = (await this.prisma.course.findUnique({ where: { id: enrollment.courseId } })) as CourseRow | null;
      if (!course || !this.visible(course)) continue;
      const published = new Set((await this.data.publishedVideos(this.prisma, course.id)).map((v) => v.id));
      const completed = await this.data.completedIds(this.prisma, enrollment.id, published);
      list.push({
        course: toCourseRecord(course),
        enrollment: toEnrollment(enrollment, completed),
        totalVideos: published.size,
        completedVideos: completed.length,
        percent: published.size ? Math.round((completed.length / published.size) * 100) : 0,
        preview: false,
      });
    }
    return list;
  }

  async courseContent(actor: AuthUser, courseId: string) {
    const { course } = await this.access(this.prisma, this.student(actor), courseId);
    return this.data.content(this.prisma, course, true);
  }

  /** Sesiones en vivo del curso (20/11/2026): solo con matrícula en un curso disponible; incluye las canceladas. */
  async liveSessions(actor: AuthUser, courseId: string) {
    await this.access(this.prisma, this.student(actor), courseId);
    return this.live.studentList(courseId);
  }

  /** RN-11: marca un video publicado como completado. */
  async completeVideo(actor: AuthUser, courseId: string, videoId: string) {
    const studentId = this.student(actor);
    return this.prisma.$transaction(async (db) => {
      const { course, enrollment } = await this.access(db, studentId, courseId, 'No tienes un curso asignado.');
      const video = (await db.courseVideo.findUnique({ where: { id: videoId } })) as { courseId: string; published: boolean } | null;
      if (!video || video.courseId !== courseId) throw new NotFoundException('No se encontró el video.');
      if (!video.published) throw rule('Este video no está disponible.');
      if (!(await db.videoProgress.findFirst({ where: { enrollmentId: enrollment.id, videoId } }))) {
        await db.videoProgress.create({ data: { enrollmentId: enrollment.id, videoId } });
      }
      if (!enrollment.startedAt) await db.enrollment.update({ where: { id: enrollment.id }, data: { startedAt: new Date() } });
      await this.data.recompute(db, course);
      const fresh = (await db.enrollment.findUnique({ where: { id: enrollment.id } })) as EnrollmentRow;
      return toEnrollment(fresh, await this.data.completedIds(db, enrollment.id));
    });
  }

  async myEnrollments(actor: AuthUser, courseId?: string) {
    const studentId = this.student(actor);
    await this.settle(studentId);
    const rows = ((await this.prisma.enrollment.findMany({ where: { studentId } })) as EnrollmentRow[]).filter((e) => !courseId || e.courseId === courseId);
    return Promise.all(rows.map(async (e) => toEnrollment(e, await this.data.completedIds(this.prisma, e.id))));
  }

  async myAttempts(actor: AuthUser, filter: { courseId?: string; examId?: string }) {
    const studentId = this.student(actor);
    await this.settle(studentId);
    return ((await this.prisma.examAttempt.findMany({ where: { studentId } })) as AttemptRow[])
      .filter((a) => (!filter.courseId || a.courseId === filter.courseId) && (!filter.examId || a.examId === filter.examId))
      .sort((a, b) => a.submittedAt.getTime() - b.submittedAt.getTime())
      .map(toAttempt);
  }

  async myCertificates(actor: AuthUser, courseId?: string) {
    const studentId = this.student(actor);
    await this.settle(studentId);
    return ((await this.prisma.certificate.findMany({ where: { studentId } })) as CertificateRow[])
      .filter((c) => !courseId || c.courseId === courseId)
      .map(toCertificate);
  }

  // ===================== Examen =====================

  /** Examen regular activo de un curso al que el estudiante tiene acceso. */
  async myExam(actor: AuthUser, courseId: string) {
    const { course } = await this.access(this.prisma, this.student(actor), courseId);
    const exam = await this.data.activeExam(this.prisma, course.id);
    return exam ? toExam(exam) : null;
  }

  /** Preguntas para rendir: SIN respuestas correctas ni criterios de calificación. */
  async examQuestions(actor: AuthUser, examId: string) {
    const studentId = this.student(actor);
    const exam = (await this.prisma.exam.findUnique({ where: { id: examId } })) as ExamRow | null;
    if (!exam) throw new NotFoundException('No se encontró el examen.');
    await this.access(this.prisma, studentId, exam.courseId);
    if (exam.kind === 'RECUPERACION') {
      // 21/11/2026: las preguntas de un examen de recuperación solo las ve el estudiante que lo tiene autorizado.
      const current = await this.recoveries.current(this.prisma, studentId, exam.courseId);
      if (!current || current.examId !== exam.id) throw new NotFoundException('No se encontró el examen.');
    }
    return (await this.data.questions(this.prisma, examId)).map(toStudentQuestion);
  }

  private async availabilityOf(db: Db, studentId: string, course: CourseRow, enrollment: EnrollmentRow | null) {
    const exam = await this.data.activeExam(db, course.id);
    const maxAttempts = exam ? MAX_ATTEMPTS : 0;
    const used = exam ? await db.examAttempt.count({ where: { studentId, examId: exam.id, kind: 'REGULAR' } }) : 0;
    const base = { examId: exam?.id ?? null, maxAttempts, remainingAttempts: Math.max(0, maxAttempts - used) };
    const block = (reason: string) => ({ ...base, available: false, reason });
    if (!enrollment) return block('No tienes un curso asignado.');
    const reason = await this.data.examBlockReason(db, course);
    if (reason) return block(reason);
    const published = new Set((await this.data.publishedVideos(db, course.id)).map((v) => v.id));
    if ((await this.data.completedIds(db, enrollment.id, published)).length < published.size) {
      return block('Debes completar todos los videos antes de rendir el examen.'); // RN-11
    }
    if (enrollment.status === 'APROBADO') return block('Ya aprobaste este examen.');
    if (enrollment.status === 'EN_REVISION') {
      return block('Tu evaluación está en revisión: el resultado se mostrará cuando el instructor termine de calificarla.');
    }
    if (base.remainingAttempts <= 0) return block('Alcanzaste el límite de intentos permitidos.'); // RN-07
    if (exam?.availableFrom && Date.now() < exam.availableFrom.getTime()) {
      const when = exam.availableFrom.toLocaleString('es-PE', { timeZone: 'America/Lima', dateStyle: 'long', timeStyle: 'short' });
      return block(`El examen estará disponible desde el ${when} (hora de Lima).`);
    }
    return { ...base, available: true, reason: '' };
  }

  async availability(actor: AuthUser, courseId: string) {
    const studentId = this.student(actor);
    await this.settle(studentId);
    const course = (await this.prisma.course.findUnique({ where: { id: courseId } })) as CourseRow | null;
    if (!course) throw new NotFoundException(COURSE_NOT_FOUND);
    const enrollment = (await this.prisma.enrollment.findFirst({ where: { studentId, courseId } })) as EnrollmentRow | null;
    // 21/11/2026: con una recuperación no anulada, el regular queda cerrado y se informa la recuperación.
    const recovery = await this.recoveries.current(this.prisma, studentId, courseId);
    if (recovery) return this.recoveryAvailability(this.prisma, course, enrollment, recovery);
    return this.availabilityOf(this.prisma, studentId, course, enrollment);
  }

  /** Situación de la recuperación del estudiante autenticado (solo la suya; requiere matrícula). */
  async myRecovery(actor: AuthUser, courseId: string) {
    const studentId = this.student(actor);
    await this.settle(studentId);
    const course = (await this.prisma.course.findUnique({ where: { id: courseId } })) as CourseRow | null;
    if (!course) throw new NotFoundException(COURSE_NOT_FOUND);
    if (!(await this.prisma.enrollment.findFirst({ where: { studentId, courseId } }))) throw new NotFoundException('No tienes acceso a este curso.');
    return this.recoveries.state(this.prisma, studentId, courseId);
  }

  /**
   * Disponibilidad con una recuperación no anulada (portada de la demostración): solo dentro de su ventana para
   * iniciar, con los requisitos de siempre (curso disponible, RN-03, RN-11 y suma exacta del examen). Un solo intento.
   */
  private async recoveryAvailability(db: Db, course: CourseRow, enrollment: EnrollmentRow | null, recovery: RecoveryRow) {
    const base = { examId: recovery.examId, maxAttempts: MAX_ATTEMPTS, remainingAttempts: recovery.attemptId ? 0 : MAX_ATTEMPTS };
    const block = (reason: string) => ({ ...base, available: false, reason });
    if (!enrollment) return block('No tienes un curso asignado.');
    if (recovery.attemptId) return block('Ya rendiste tu recuperación.');
    if (this.recoveries.isNoShow(recovery)) return block('El plazo de tu recuperación terminó sin que la iniciaras.');
    if (!recovery.startedAt && Date.now() < new Date(recovery.opensAt).getTime()) {
      return block(`Tu recuperación estará disponible desde el ${limaLabel(recovery.opensAt)} (hora de Lima).`);
    }
    if (!this.visible(course)) return block('El curso no está disponible: la recuperación se habilitará cuando el curso se publique.');
    const published = await this.data.publishedVideos(db, course.id);
    const issues = ruleIssues(published);
    if (issues.length) return block(`El curso no cumple las reglas de videos (RN-03): ${issues.join(' ')}`);
    const exam = (await db.exam.findUnique({ where: { id: recovery.examId } })) as ExamRow | null;
    if (!exam) return block('No se encontró el examen de la recuperación.');
    const examReason = await this.recoveries.examReason(db, exam);
    if (examReason) return block(examReason);
    const ids = new Set(published.map((v) => v.id));
    if ((await this.data.completedIds(db, enrollment.id, ids)).length < ids.size) {
      return block('Debes completar todos los videos antes de rendir el examen.'); // RN-11
    }
    return { ...base, available: true, reason: '' };
  }

  /** Inicio de la recuperación: uno solo (recargas y otras pestañas recuperan el mismo, con sus respuestas). */
  private async startRecovery(studentId: string, course: CourseRow, recovery: RecoveryRow) {
    const exam = (await this.prisma.exam.findUnique({ where: { id: recovery.examId } })) as ExamRow;
    const fresh = await this.prisma.$transaction(async (db) => {
      const row = (await db.examRecovery.findUnique({ where: { id: recovery.id } })) as RecoveryRow;
      if (row.startedAt) return row;
      const enrollment = (await db.enrollment.findFirst({ where: { studentId, courseId: course.id } })) as EnrollmentRow | null;
      const availability = await this.recoveryAvailability(db, course, enrollment, row);
      if (!availability.available) throw rule(availability.reason);
      const now = new Date();
      return (await db.examRecovery.update({
        where: { id: row.id },
        data: { startedAt: now, endsAt: new Date(now.getTime() + exam.timeMinutes * 60_000) },
      })) as RecoveryRow;
    });
    if (fresh.closedAt || fresh.attemptId) throw rule('Tu recuperación ya fue entregada.');
    return { exam: toExam(exam), startedAt: fresh.startedAt!.toISOString(), endsAt: fresh.endsAt!.toISOString(), answers: asAnswers(fresh.answers) };
  }

  /**
   * R2: inicio registrado en el servidor. Uno por estudiante y examen: si ya existe y no se entregó (recarga, otra
   * pestaña), devuelve el mismo inicio y el tiempo no se reinicia. No crea intentos.
   */
  async start(actor: AuthUser, courseId: string) {
    const studentId = this.student(actor);
    await this.settle(studentId);
    const course = (await this.prisma.course.findUnique({ where: { id: courseId } })) as CourseRow | null;
    if (!course) throw new NotFoundException(COURSE_NOT_FOUND);
    // 21/11/2026: con una recuperación no anulada se inicia la recuperación (solo dentro de su ventana).
    const recovery = await this.recoveries.current(this.prisma, studentId, courseId);
    if (recovery) return this.startRecovery(studentId, course, recovery);
    const exam = await this.data.activeExam(this.prisma, courseId);
    if (!exam) throw rule('El curso no tiene un examen activo.');
    let start = (await this.prisma.examStart.findFirst({ where: { studentId, examId: exam.id } })) as StartRow | null;
    if (!start) {
      const enrollment = (await this.prisma.enrollment.findFirst({ where: { studentId, courseId } })) as EnrollmentRow | null;
      const availability = await this.availabilityOf(this.prisma, studentId, course, enrollment);
      if (!availability.available) throw rule(availability.reason);
      const now = new Date();
      try {
        start = (await this.prisma.examStart.create({
          data: { studentId, examId: exam.id, startedAt: now, endsAt: new Date(now.getTime() + exam.timeMinutes * 60_000) },
        })) as StartRow;
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        start = (await this.prisma.examStart.findFirst({ where: { studentId, examId: exam.id } })) as StartRow; // otra pestaña
      }
    }
    if (start.closedAt) throw rule('Tu examen ya fue entregado.');
    return { exam: toExam(exam), startedAt: start.startedAt.toISOString(), endsAt: start.endsAt.toISOString(), answers: asAnswers(start.answers) };
  }

  /** Guarda respuestas del examen iniciado (por pregunta; una respuesta vacía se quita). */
  async saveAnswers(actor: AuthUser, courseId: string, answers: Record<string, unknown>) {
    const studentId = this.student(actor);
    await this.settle(studentId);
    // 21/11/2026: con una recuperación no anulada, las respuestas son las de la recuperación.
    const recovery = await this.recoveries.current(this.prisma, studentId, courseId);
    if (recovery) {
      if (!recovery.startedAt || !recovery.endsAt) throw rule('No tienes un examen iniciado en este curso.');
      if (recovery.closedAt || recovery.attemptId) throw rule('Tu recuperación ya fue entregada.');
      if (Date.now() >= recovery.endsAt.getTime() + TIMEOUT_TOLERANCE_SEC * 1000) throw rule('El tiempo del examen terminó.');
      const next = this.mergeAnswers((await this.data.questions(this.prisma, recovery.examId)).map(toGradable), asAnswers(recovery.answers), answers);
      await this.prisma.examRecovery.update({ where: { id: recovery.id }, data: { answers: next, answersUpdatedAt: new Date() } });
      return next;
    }
    const exam = await this.data.activeExam(this.prisma, courseId);
    const start = exam ? ((await this.prisma.examStart.findFirst({ where: { studentId, examId: exam.id } })) as StartRow | null) : null;
    if (!exam || !start) throw rule('No tienes un examen iniciado en este curso.');
    if (start.closedAt) throw rule('Tu examen ya fue entregado.');
    if (Date.now() >= start.endsAt.getTime() + TIMEOUT_TOLERANCE_SEC * 1000) throw rule('El tiempo del examen terminó.');
    const next = this.mergeAnswers((await this.data.questions(this.prisma, exam.id)).map(toGradable), asAnswers(start.answers), answers);
    await this.prisma.examStart.update({ where: { id: start.id }, data: { answers: next, answersUpdatedAt: new Date() } });
    return next;
  }

  /** Une las respuestas nuevas con las guardadas (por pregunta; solo preguntas y opciones válidas; vacía = se quita). */
  private mergeAnswers(questions: ReturnType<typeof toGradable>[], saved: Record<string, string[]>, answers: Record<string, unknown>) {
    const next: Record<string, string[]> = { ...saved };
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
    return next;
  }

  /**
   * Entrega. 'voluntaria' exige todo completo (D3); 'tiempo' solo cuando el tiempo registrado terminó y califica las
   * respuestas guardadas (P4). Un solo intento (RN-07): el índice único lo garantiza aunque lleguen dos entregas.
   */
  async submit(actor: AuthUser, examId: string, answers: Record<string, unknown>, durationSec: number, mode: 'voluntaria' | 'tiempo' = 'voluntaria') {
    const studentId = this.student(actor);
    const closedNow = await this.settle(studentId);
    const already = closedNow.find((a) => a.examId === examId);
    if (already) return toAttempt(already);
    const exam = (await this.prisma.exam.findUnique({ where: { id: examId } })) as ExamRow | null;
    if (!exam) throw new NotFoundException('No se encontró el examen.');
    // 21/11/2026: con una recuperación no anulada se entrega la recuperación (el regular queda cerrado).
    const recovery = await this.recoveries.current(this.prisma, studentId, exam.courseId);
    if (recovery) return this.submitRecovery(studentId, exam, recovery, answers ?? {}, durationSec, mode);
    if (!exam.active) throw rule('Este examen no está activo.');
    const course = (await this.prisma.course.findUnique({ where: { id: exam.courseId } })) as CourseRow;
    const enrollment = (await this.prisma.enrollment.findFirst({ where: { studentId, courseId: exam.courseId } })) as EnrollmentRow | null;
    const availability = await this.availabilityOf(this.prisma, studentId, course, enrollment);
    if (!availability.available) throw rule(availability.reason);
    const start = (await this.prisma.examStart.findFirst({ where: { studentId, examId } })) as StartRow | null;
    if (!start) throw rule('Debes iniciar el examen antes de entregarlo.');
    if (start.closedAt) throw rule('Tu examen ya fue entregado.');
    const questions = (await this.data.questions(this.prisma, examId)).map(toGradable);
    let graded: Record<string, string[]>;
    if (mode === 'tiempo') {
      if (Date.now() < start.endsAt.getTime() - TIMEOUT_TOLERANCE_SEC * 1000) {
        throw rule('La entrega automática solo se admite cuando se agotó el tiempo del examen.');
      }
      graded = asAnswers(start.answers);
    } else {
      graded = cleanAnswers(questions, answers ?? {});
      const incomplete = incompleteMessage(questions, graded);
      if (incomplete) throw invalid(incomplete);
    }
    const elapsed = Math.round((Math.min(Date.now(), start.endsAt.getTime()) - start.startedAt.getTime()) / 1000);
    try {
      const attempt = await this.prisma.$transaction((db) =>
        this.record(db, studentId, exam, course, graded, Math.max(0, Math.min(durationSec || elapsed, exam.timeMinutes * 60)), { start }, false),
      );
      return toAttempt(attempt);
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('Ya rendiste este examen: solo se permite un intento.');
      throw error;
    }
  }

  /**
   * Entrega de la recuperación: del examen autorizado, con su inicio registrado y una sola vez (RN-07: índice único
   * por estudiante, examen y tipo). Se puede entregar después del cierre de la ventana si se inició a tiempo.
   */
  private async submitRecovery(
    studentId: string,
    exam: ExamRow,
    recovery: RecoveryRow,
    answers: Record<string, unknown>,
    durationSec: number,
    mode: 'voluntaria' | 'tiempo',
  ) {
    if (exam.id !== recovery.examId) throw rule('Este examen no corresponde a tu recuperación.');
    if (recovery.attemptId || recovery.closedAt) throw rule('Tu recuperación ya fue entregada.');
    if (!recovery.startedAt || !recovery.endsAt) throw rule('Debes iniciar la recuperación antes de entregarla.');
    if (!(await this.prisma.enrollment.findFirst({ where: { studentId, courseId: exam.courseId } }))) throw rule('No tienes un curso asignado.');
    const questions = (await this.data.questions(this.prisma, exam.id)).map(toGradable);
    let graded: Record<string, string[]>;
    if (mode === 'tiempo') {
      if (Date.now() < recovery.endsAt.getTime() - TIMEOUT_TOLERANCE_SEC * 1000) {
        throw rule('La entrega automática solo se admite cuando se agotó el tiempo del examen.');
      }
      graded = asAnswers(recovery.answers);
    } else {
      graded = cleanAnswers(questions, answers);
      const incomplete = incompleteMessage(questions, graded);
      if (incomplete) throw invalid(incomplete);
    }
    const course = (await this.prisma.course.findUnique({ where: { id: exam.courseId } })) as CourseRow;
    const elapsed = Math.round((Math.min(Date.now(), recovery.endsAt.getTime()) - recovery.startedAt.getTime()) / 1000);
    try {
      const attempt = await this.prisma.$transaction(async (db) => {
        const fresh = (await db.examRecovery.findUnique({ where: { id: recovery.id } })) as RecoveryRow;
        if (fresh.attemptId || fresh.closedAt) throw rule('Tu recuperación ya fue entregada.');
        return this.record(db, studentId, exam, course, graded, Math.max(0, Math.min(durationSec || elapsed, exam.timeMinutes * 60)), { recovery: fresh }, false);
      });
      return toAttempt(attempt);
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('Ya rendiste tu recuperación: solo se permite un intento.');
      throw error;
    }
  }

  /**
   * Registra el intento calificado (regla proporcional), cierra el inicio (regular) o la recuperación, actualiza la
   * matrícula y certifica si aprueba. R4 (regla del proyecto): la nota de la recuperación pasa a ser la vigente, aunque
   * sea menor; el intento regular NO se modifica (se conserva en el historial).
   */
  private async record(
    db: Db,
    studentId: string,
    exam: ExamRow,
    course: CourseRow,
    answers: Record<string, string[]>,
    durationSec: number,
    close: { start: StartRow } | { recovery: RecoveryRow },
    autoSubmitted: boolean,
  ) {
    const questions = (await this.data.questions(db, exam.id)).map(toGradable);
    const clean = cleanAnswers(questions, answers);
    const { earned, totalPoints, correctCount, questionScores } = grade(questions, clean, 'proporcional');
    const pendingReview = questions.some((q) => q.type === 'open');
    const score = pendingReview ? 0 : totalPoints ? Math.round((earned / totalPoints) * exam.scaleMax) : 0;
    const passed = !pendingReview && score >= exam.passScore;
    const attempt = (await db.examAttempt.create({
      data: {
        studentId,
        courseId: exam.courseId,
        examId: exam.id,
        kind: 'recovery' in close ? 'RECUPERACION' : 'REGULAR',
        durationSec,
        score,
        scaleMax: exam.scaleMax,
        correctCount,
        totalQuestions: questions.length,
        passed,
        answers: clean,
        gradingRule: 'PROPORCIONAL',
        questionScores,
        maxPoints: totalPoints,
        autoSubmitted,
        reviewStatus: pendingReview ? 'EN_REVISION' : null,
        manualScores: pendingReview ? {} : undefined,
      },
    })) as AttemptRow;
    if ('start' in close) await db.examStart.update({ where: { id: close.start.id }, data: { closedAt: new Date(), attemptId: attempt.id } });
    else await db.examRecovery.update({ where: { id: close.recovery.id }, data: { closedAt: new Date(), attemptId: attempt.id } });
    const enrollment = (await db.enrollment.findFirst({ where: { studentId, courseId: exam.courseId } })) as EnrollmentRow | null;
    if (enrollment) {
      await db.enrollment.update({
        where: { id: enrollment.id },
        data: { status: pendingReview ? 'EN_REVISION' : passed ? 'APROBADO' : 'DESAPROBADO' },
      });
    }
    if (passed) await this.data.issueCertificate(db, attempt, course);
    return attempt;
  }

  /**
   * Cierre por tiempo (corrección de R3): un examen iniciado cuyo tiempo terminó sin entrega se entrega solo con las
   * respuestas guardadas en el servidor (nunca se inventan). Idempotente. Devuelve los intentos creados ahora.
   */
  async settle(studentId?: string): Promise<AttemptRow[]> {
    const limit = new Date(Date.now() - TIMEOUT_TOLERANCE_SEC * 1000);
    const open = ((await this.prisma.examStart.findMany({ where: { closedAt: null, ...(studentId ? { studentId } : {}) } })) as StartRow[]).filter(
      (s) => s.endsAt.getTime() <= limit.getTime(),
    );
    const created: AttemptRow[] = [];
    for (const start of open) {
      try {
        const attempt = await this.prisma.$transaction(async (db) => {
          const fresh = (await db.examStart.findUnique({ where: { id: start.id } })) as StartRow | null;
          if (!fresh || fresh.closedAt) return null;
          if ((await db.examAttempt.count({ where: { studentId: start.studentId, examId: start.examId, kind: 'REGULAR' } })) > 0) {
            await db.examStart.update({ where: { id: start.id }, data: { closedAt: new Date() } });
            return null;
          }
          const exam = (await db.exam.findUnique({ where: { id: start.examId } })) as ExamRow;
          const course = (await db.course.findUnique({ where: { id: exam.courseId } })) as CourseRow;
          const durationSec = Math.round((fresh.endsAt.getTime() - fresh.startedAt.getTime()) / 1000);
          return this.record(db, start.studentId, exam, course, asAnswers(fresh.answers), durationSec, { start: fresh }, true);
        });
        if (attempt) created.push(attempt);
      } catch (error) {
        if (!isUniqueViolation(error)) throw error; // otra solicitud lo cerró a la vez
      }
    }
    // 21/11/2026: recuperaciones iniciadas cuyo tiempo terminó: se entregan con sus respuestas guardadas.
    const openRecoveries = ((await this.prisma.examRecovery.findMany({
      where: { cancelledAt: null, attemptId: null, closedAt: null, ...(studentId ? { studentId } : {}) },
    })) as RecoveryRow[]).filter((r) => r.startedAt && r.endsAt && r.endsAt.getTime() <= limit.getTime());
    for (const r of openRecoveries) {
      try {
        const attempt = await this.prisma.$transaction(async (db) => {
          const fresh = (await db.examRecovery.findUnique({ where: { id: r.id } })) as RecoveryRow | null;
          if (!fresh || fresh.closedAt || fresh.attemptId) return null;
          const exam = (await db.exam.findUnique({ where: { id: fresh.examId } })) as ExamRow;
          const course = (await db.course.findUnique({ where: { id: exam.courseId } })) as CourseRow;
          const durationSec = Math.round((fresh.endsAt!.getTime() - fresh.startedAt!.getTime()) / 1000);
          return this.record(db, fresh.studentId, exam, course, asAnswers(fresh.answers), durationSec, { recovery: fresh }, true);
        });
        if (attempt) created.push(attempt);
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }
    }
    await this.recoveries.markNoShows(this.prisma, studentId ? { studentId } : {});
    return created;
  }
}
