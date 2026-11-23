import { Injectable, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '../../common/auth-user.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AcademicData, type Db, invalid, rule } from './academic.data.js';
import type { RecoveryInputDto } from './academic.dto.js';
import { type AttemptRow, type CourseRow, type EnrollmentRow, type ExamRow } from './academic.mappers.js';

/** Recuperación tal como está en `exam_recoveries`. */
export interface RecoveryRow {
  id: string;
  studentId: string;
  courseId: string;
  regularExamId: string;
  examId: string;
  reason: 'DESAPROBADO' | 'AUSENTE';
  mode: 'ORIGINAL' | 'INDEPENDIENTE';
  opensAt: Date;
  closesAt: Date;
  authorizedById: string | null;
  authorizedAt: Date;
  cancelledAt: Date | null;
  startedAt: Date | null;
  endsAt: Date | null;
  answers: unknown;
  answersUpdatedAt: Date | null;
  closedAt: Date | null;
  attemptId: string | null;
  noShowAt: Date | null;
}

export type RecoveryStatus = 'pendiente' | 'autorizada' | 'anulada' | 'rendida' | 'no_rindio';

export const RECOVERY_NOT_FOUND = 'No se encontró la recuperación.';
export const ORIGINAL_ONLY = 'Las recuperaciones solo se rinden con el examen original del curso.';

const iso = (d: Date) => new Date(d).toISOString();

/** Fecha y hora de Lima para los mensajes («22 de noviembre de 2026, 09:00»). */
export function limaLabel(d: Date): string {
  return new Date(d).toLocaleString('es-PE', { timeZone: 'America/Lima', dateStyle: 'long', timeStyle: 'short' });
}

/** Forma `Recovery` del frontend (recovery.model.ts). */
export function toRecovery(r: RecoveryRow) {
  return {
    id: r.id,
    userId: r.studentId,
    courseId: r.courseId,
    regularExamId: r.regularExamId,
    examId: r.examId,
    reason: r.reason === 'AUSENTE' ? ('ausente' as const) : ('desaprobado' as const),
    mode: r.mode === 'ORIGINAL' ? ('original' as const) : ('independiente' as const),
    opensAt: iso(r.opensAt),
    closesAt: iso(r.closesAt),
    authorizedBy: r.authorizedById ?? '',
    authorizedAt: iso(r.authorizedAt),
    ...(r.cancelledAt ? { cancelledAt: iso(r.cancelledAt) } : {}),
    ...(r.startedAt ? { startedAt: iso(r.startedAt) } : {}),
    ...(r.attemptId ? { attemptId: r.attemptId } : {}),
    ...(r.noShowAt ? { noShowAt: iso(r.noShowAt) } : {}),
  };
}

/**
 * Recuperación de exámenes (21/11/2026), portada de la demostración (Etapa 2B, Bloque 2, R3–R8) con persistencia real.
 * - Solo el Instructor dueño del curso autoriza, anula y consulta (lo ajeno responde 404).
 * - Se autoriza EXCLUSIVAMENTE a quien desaprobó el examen regular (decisión del 21/11/2026: no a ausentes ni a
 *   aprobados ni a quien tiene el regular pendiente de calificación). Nunca se habilita sola.
 * - Una sola recuperación no anulada por estudiante y curso (una oportunidad). Anularla antes del inicio no la consume.
 * - Decisión definitiva (20/11/2026): la recuperación usa EXCLUSIVAMENTE el examen original del curso (modalidad
 *   ORIGINAL): mismas preguntas, escala, nota mínima y duración; nunca se duplica ni se modifica (RN-15). La modalidad
 *   INDEPENDIENTE ya no se autoriza; las filas históricas que la tengan se siguen leyendo y rindiendo sin cambios.
 * - Solo sobre participantes registrados por el Instructor (`students.registered_by`); lo ajeno responde 404.
 * - La ventana solo limita el INICIO; quien inicia a tiempo tiene la duración completa.
 * - El intento regular nunca se toca; el de recuperación es otro ExamAttempt (kind RECUPERACION, RN-07 por índice).
 */
@Injectable()
export class RecoveriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly data: AcademicData,
  ) {}

  // ===================== Consultas compartidas =====================

  /** La recuperación no anulada del estudiante en el curso (como máximo una). */
  async current(db: Db, studentId: string, courseId: string): Promise<RecoveryRow | null> {
    const rows = (await db.examRecovery.findMany({ where: { studentId, courseId, cancelledAt: null } })) as RecoveryRow[];
    return rows[0] ?? null;
  }

  /** Una autorización sin inicio cuya ventana ya cerró es «No rindió recuperación» (registro definitivo). */
  isNoShow(r: RecoveryRow, now = Date.now()): boolean {
    return !!r.noShowAt || (!r.startedAt && !r.attemptId && now >= new Date(r.closesAt).getTime());
  }

  /** Guarda `noShowAt` una sola vez en las autorizaciones vencidas sin inicio (no crea intento ni nota). */
  async markNoShows(db: Db, where: { studentId?: string; courseId?: string } = {}): Promise<void> {
    const rows = (await db.examRecovery.findMany({ where: { ...where, cancelledAt: null, startedAt: null, attemptId: null, noShowAt: null } })) as RecoveryRow[];
    const now = Date.now();
    for (const r of rows) {
      if (now >= new Date(r.closesAt).getTime()) await db.examRecovery.update({ where: { id: r.id }, data: { noShowAt: new Date() } });
    }
  }

  /** Último intento regular del estudiante en el examen regular. */
  private async lastRegular(db: Db, studentId: string, examId: string): Promise<AttemptRow | null> {
    const attempts = (await db.examAttempt.findMany({ where: { studentId, examId, kind: 'REGULAR' } })) as AttemptRow[];
    return attempts.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime())[0] ?? null;
  }

  /** Quién puede recibir una recuperación: solo quien desaprobó el examen regular (intento calificado y no aprobado). */
  async eligibility(db: Db, studentId: string, courseId: string): Promise<{ regular: ExamRow } | { error: string }> {
    const enrollment = (await db.enrollment.findFirst({ where: { studentId, courseId } })) as EnrollmentRow | null;
    if (!enrollment) return { error: 'El estudiante no está inscrito en este curso.' };
    const regular = await this.data.activeExam(db, courseId);
    if (!regular) return { error: 'El curso no tiene un examen activo.' };
    const last = await this.lastRegular(db, studentId, regular.id);
    if (!last) {
      if (enrollment.status === 'APROBADO') return { error: 'El estudiante aprobó el examen regular: no corresponde una recuperación.' };
      return { error: 'El estudiante no ha rendido el examen regular: la recuperación solo se autoriza a quien lo desaprobó.' };
    }
    if (last.reviewStatus === 'EN_REVISION') return { error: 'El examen regular del estudiante está pendiente de calificación.' };
    if (last.passed) return { error: 'El estudiante aprobó el examen regular: no corresponde una recuperación.' };
    return { regular };
  }

  /** Situación de recuperación del estudiante en el curso (se calcula; no se guarda). */
  async state(db: Db, studentId: string, courseId: string) {
    const base = { userId: studentId, courseId };
    const current = await this.current(db, studentId, courseId);
    if (current) {
      const recovery = toRecovery(current);
      if (current.attemptId) return { ...base, status: 'rendida' as RecoveryStatus, reason: 'Recuperación rendida.', recovery };
      if (this.isNoShow(current)) return { ...base, status: 'no_rindio' as RecoveryStatus, reason: 'No rindió la recuperación.', recovery };
      const reason = current.startedAt
        ? 'Recuperación en curso.'
        : Date.now() < new Date(current.opensAt).getTime()
          ? `Disponible desde el ${limaLabel(current.opensAt)} (hora de Lima).`
          : `Disponible hasta el ${limaLabel(current.closesAt)} (hora de Lima).`;
      return { ...base, status: 'autorizada' as RecoveryStatus, reason, recovery };
    }
    const cancelled = ((await db.examRecovery.findMany({ where: { studentId, courseId } })) as RecoveryRow[])
      .filter((r) => r.cancelledAt)
      .sort((a, b) => new Date(a.cancelledAt!).getTime() - new Date(b.cancelledAt!).getTime())
      .at(-1);
    const eligibility = await this.eligibility(db, studentId, courseId);
    if ('error' in eligibility) return { ...base, status: null, reason: eligibility.error, recovery: cancelled ? toRecovery(cancelled) : null };
    return {
      ...base,
      status: (cancelled ? 'anulada' : 'pendiente') as RecoveryStatus,
      reason: 'Desaprobó el examen regular.',
      recovery: cancelled ? toRecovery(cancelled) : null,
    };
  }

  // ===================== Instructor =====================

  /** El examen de la recuperación se puede rendir: tiene preguntas y su suma coincide con la nota máxima (Etapa 2A). */
  async examReason(db: Db, exam: ExamRow): Promise<string> {
    if ((await this.data.questions(db, exam.id)).length === 0) return 'El examen de recuperación aún no tiene preguntas.';
    const mismatch = await this.data.scoreMismatch(db, exam);
    if (mismatch && !mismatch.grandfathered) return `El examen de recuperación no cumple la suma de puntajes. ${mismatch.message}`;
    return '';
  }

  /** Solo el examen original (decisión del 20/11/2026): no se elige otro examen ni se crea uno nuevo. */
  private examFor(input: RecoveryInputDto, regular: ExamRow): ExamRow {
    if ((input.mode && input.mode !== 'original') || (input.recoveryExamId && input.recoveryExamId !== regular.id)) {
      throw invalid(ORIGINAL_ONLY);
    }
    return regular;
  }

  /** Participantes registrados por el Instructor (aislamiento por `students.registered_by`). */
  private async ownStudentIds(db: Db, actor: AuthUser): Promise<Set<string>> {
    const rows = (await db.student.findMany({ where: { registeredById: actor.id }, select: { userId: true } })) as { userId: string }[];
    return new Set(rows.map((r) => r.userId));
  }

  private window(opensAt: string, closesAt: string): { opens: Date; closes: Date } {
    const opens = new Date(opensAt ?? '');
    const closes = new Date(closesAt ?? '');
    if (!opensAt || !closesAt || Number.isNaN(opens.getTime()) || Number.isNaN(closes.getTime())) {
      throw invalid('Indica la fecha y hora de apertura y de cierre de la recuperación (con su zona horaria).');
    }
    if (closes.getTime() <= opens.getTime()) throw invalid('La fecha y hora de cierre deben ser posteriores a la apertura.');
    if (closes.getTime() <= Date.now()) throw invalid('La fecha y hora de cierre ya pasaron.');
    return { opens, closes };
  }

  async authorize(actor: AuthUser, input: RecoveryInputDto) {
    if (input.mode && input.mode !== 'original') throw invalid(ORIGINAL_ONLY);
    return this.prisma.$transaction(async (db) => {
      const course = await this.data.ownedCourse(db, actor, input.courseId);
      if (!(await this.ownStudentIds(db, actor)).has(input.userId)) throw new NotFoundException('El estudiante no está inscrito en este curso.');
      if (course.status !== 'PUBLICADO') throw rule('El curso está en borrador: no se pueden autorizar recuperaciones.');
      // Dos autorizaciones simultáneas del mismo estudiante: la fila del estudiante se bloquea hasta el final.
      await db.$queryRaw`SELECT user_id FROM students WHERE user_id = ${input.userId} FOR UPDATE`;
      await this.markNoShows(db, { studentId: input.userId, courseId: course.id });
      if (await this.current(db, input.userId, course.id)) {
        throw rule('El estudiante ya tiene una recuperación en este curso: solo se permite una oportunidad.');
      }
      const eligibility = await this.eligibility(db, input.userId, course.id);
      if ('error' in eligibility) {
        if (eligibility.error.startsWith('El estudiante no está inscrito')) throw new NotFoundException(eligibility.error);
        throw rule(eligibility.error);
      }
      const exam = this.examFor(input, eligibility.regular);
      const { opens, closes } = this.window(input.opensAt, input.closesAt);
      const row = (await db.examRecovery.create({
        data: {
          studentId: input.userId,
          courseId: course.id,
          regularExamId: eligibility.regular.id,
          examId: exam.id,
          reason: 'DESAPROBADO',
          mode: 'ORIGINAL',
          opensAt: opens,
          closesAt: closes,
          authorizedById: actor.id,
        },
      })) as RecoveryRow;
      await db.auditLog.create({
        data: { action: 'RECOVERY_AUTHORIZED', actorId: actor.id, entity: 'exam_recovery', entityId: row.id, data: { courseId: course.id, mode: row.mode } },
      });
      return toRecovery(row);
    });
  }

  /** Solo antes de que el estudiante la inicie (ni iniciada, ni rendida, ni vencida). */
  async cancel(actor: AuthUser, recoveryId: string) {
    return this.prisma.$transaction(async (db) => {
      const row = (await db.examRecovery.findUnique({ where: { id: recoveryId } })) as RecoveryRow | null;
      if (!row) throw new NotFoundException(RECOVERY_NOT_FOUND);
      await this.data.ownedCourse(db, actor, row.courseId).catch(() => {
        throw new NotFoundException(RECOVERY_NOT_FOUND);
      });
      if (row.cancelledAt) throw rule('Esta recuperación ya fue anulada.');
      if (row.attemptId) throw rule('No se puede anular: la recuperación ya fue rendida.');
      if (row.startedAt) throw rule('No se puede anular: el estudiante ya inició la recuperación.');
      if (this.isNoShow(row)) throw rule('No se puede anular: el plazo de la recuperación ya terminó (no rindió la recuperación).');
      const updated = (await db.examRecovery.update({ where: { id: recoveryId }, data: { cancelledAt: new Date() } })) as RecoveryRow;
      await db.auditLog.create({ data: { action: 'RECOVERY_CANCELLED', actorId: actor.id, entity: 'exam_recovery', entityId: row.id } });
      return toRecovery(updated);
    });
  }

  private async ownedCourseIds(actor: AuthUser, courseId?: string): Promise<string[]> {
    if (courseId) return [(await this.data.ownedCourse(this.prisma, actor, courseId)).id];
    return ((await this.prisma.course.findMany({ where: { createdById: actor.id } })) as CourseRow[]).map((c) => c.id);
  }

  async list(actor: AuthUser, filter: { courseId?: string; userId?: string }) {
    const courseIds = await this.ownedCourseIds(actor, filter.courseId);
    if (!courseIds.length) return [];
    await this.markNoShows(this.prisma);
    const own = await this.ownStudentIds(this.prisma, actor);
    const rows = (await this.prisma.examRecovery.findMany({ where: { courseId: { in: courseIds } } })) as RecoveryRow[];
    return rows
      .filter((r) => own.has(r.studentId) && (!filter.userId || r.studentId === filter.userId))
      .sort((a, b) => new Date(a.authorizedAt).getTime() - new Date(b.authorizedAt).getTime())
      .map(toRecovery);
  }

  async states(actor: AuthUser, filter: { courseId?: string; userId?: string }) {
    const courseIds = await this.ownedCourseIds(actor, filter.courseId);
    if (!courseIds.length) return [];
    await this.markNoShows(this.prisma);
    const own = await this.ownStudentIds(this.prisma, actor);
    const enrollments = ((await this.prisma.enrollment.findMany({ where: { courseId: { in: courseIds } } })) as EnrollmentRow[]).filter(
      (e) => own.has(e.studentId) && (!filter.userId || e.studentId === filter.userId),
    );
    const list = [];
    for (const e of enrollments) list.push(await this.state(this.prisma, e.studentId, e.courseId));
    return list;
  }
}
