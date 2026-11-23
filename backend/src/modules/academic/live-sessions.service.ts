import { Injectable, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '../../common/auth-user.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AcademicData, type Db, invalid } from './academic.data.js';
import type { LiveSessionInputDto } from './academic.dto.js';
import type { ModuleRow } from './academic.mappers.js';
import { LIVE_DESCRIPTION_MAX, LIVE_TITLE_MAX, normalizeMeetUrl, sourceFromUrl } from './academic.rules.js';

/** Sesión en vivo tal como está en la base (`course_live_sessions`). */
export interface LiveSessionRow {
  id: string;
  courseId: string;
  moduleId: string | null;
  title: string;
  description: string | null;
  startsAt: Date;
  meetUrl: string;
  recordingUrl: string | null;
  status: 'PROGRAMADA' | 'CANCELADA';
  createdById: string | null;
}

export const LIVE_SESSION_NOT_FOUND = 'No se encontró la sesión en vivo.';
/** Margen para registrar una sesión que empieza «ahora» (el reloj del navegador puede ir algo atrasado). */
const PAST_GRACE_MS = 5 * 60 * 1000;

/** Forma que recibe el frontend: fechas ISO (UTC) y estado en minúsculas. */
export function toLiveSession(s: LiveSessionRow, modules: readonly ModuleRow[]) {
  const index = s.moduleId ? modules.findIndex((m) => m.id === s.moduleId) : -1;
  return {
    id: s.id,
    courseId: s.courseId,
    // Módulo opcional (20/11/2026): sin módulo, la clase es de todo el curso.
    moduleId: index >= 0 ? s.moduleId : null,
    moduleTitle: index >= 0 ? modules[index].title : '',
    moduleOrder: index + 1,
    title: s.title,
    ...(s.description ? { description: s.description } : {}),
    startsAt: new Date(s.startsAt).toISOString(),
    meetUrl: s.meetUrl,
    // Solo si existe: nunca se muestra un enlace de grabación vacío.
    ...(s.recordingUrl ? { recordingUrl: s.recordingUrl } : {}),
    status: s.status === 'CANCELADA' ? ('cancelada' as const) : ('programada' as const),
  };
}

/**
 * Sesiones en vivo con Google Meet (20/11/2026). Enlaces externos: no hay videoconferencia propia ni integración con
 * la API de Google. Cada sesión pertenece a un módulo de un curso.
 * - Instructor: solo sobre SUS cursos (`ownedCourse`, lo ajeno responde 404). Crea, edita, cancela y reprograma.
 * - Estudiante: solo de los cursos en que está matriculado y que están disponibles (misma regla que el contenido).
 *   Las canceladas se siguen mostrando con el estado «Cancelada».
 */
@Injectable()
export class LiveSessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly data: AcademicData,
  ) {}

  private async list(db: Db, courseId: string) {
    const modules = await this.data.modules(db, courseId);
    const rows = (await db.courseLiveSession.findMany({ where: { courseId } })) as LiveSessionRow[];
    return rows
      .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime() || a.title.localeCompare(b.title, 'es'))
      .map((s) => toLiveSession(s, modules));
  }

  /** Sesiones del curso para el Instructor dueño, por fecha de inicio. */
  async instructorList(actor: AuthUser, courseId: string) {
    await this.data.ownedCourse(this.prisma, actor, courseId);
    return this.list(this.prisma, courseId);
  }

  /** Sesiones del curso para el estudiante matriculado (el acceso lo comprueba quien llama). */
  async studentList(courseId: string) {
    return this.list(this.prisma, courseId);
  }

  private parseInput(input: LiveSessionInputDto) {
    const title = input.title?.trim() ?? '';
    if (!title) throw invalid('Ingresa el título de la sesión en vivo.');
    if (title.length > LIVE_TITLE_MAX) throw invalid(`El título admite como máximo ${LIVE_TITLE_MAX} caracteres.`);
    const description = input.description?.trim() || null;
    if (description && description.length > LIVE_DESCRIPTION_MAX) {
      throw invalid(`La descripción admite como máximo ${LIVE_DESCRIPTION_MAX} caracteres.`);
    }
    const startsAt = new Date(input.startsAt ?? '');
    if (!input.startsAt || Number.isNaN(startsAt.getTime()) || startsAt.getUTCFullYear() > 2100) {
      throw invalid('Ingresa una fecha y hora de inicio válidas.');
    }
    const meetUrl = normalizeMeetUrl(input.meetUrl);
    if (!meetUrl) throw invalid('El enlace debe ser de Google Meet, con el formato https://meet.google.com/abc-defg-hij.');
    return { title, description, startsAt, meetUrl, moduleId: input.moduleId?.trim() || null };
  }

  private assertFuture(startsAt: Date) {
    if (startsAt.getTime() < Date.now() - PAST_GRACE_MS) throw invalid('La fecha y hora de inicio ya pasaron. Elige una fecha futura.');
  }

  private async assertModule(db: Db, courseId: string, moduleId: string | null) {
    if (!moduleId) return;
    const modules = await this.data.modules(db, courseId);
    if (!modules.some((m) => m.id === moduleId)) throw new NotFoundException('No se encontró el módulo.');
  }

  private async owned(db: Db, courseId: string, sessionId: string) {
    const session = (await db.courseLiveSession.findUnique({ where: { id: sessionId } })) as LiveSessionRow | null;
    if (!session || session.courseId !== courseId) throw new NotFoundException(LIVE_SESSION_NOT_FOUND);
    return session;
  }

  async create(actor: AuthUser, courseId: string, input: LiveSessionInputDto) {
    const data = this.parseInput(input);
    this.assertFuture(data.startsAt);
    return this.prisma.$transaction(async (db) => {
      await this.data.ownedCourse(db, actor, courseId);
      await this.assertModule(db, courseId, data.moduleId);
      await db.courseLiveSession.create({ data: { ...data, courseId, status: 'PROGRAMADA', createdById: actor.id } });
      return this.list(db, courseId);
    });
  }

  /** Edita título, descripción, módulo, fecha y enlace. Una fecha nueva debe ser futura; la que no cambia, no. */
  async update(actor: AuthUser, courseId: string, sessionId: string, input: LiveSessionInputDto) {
    const data = this.parseInput(input);
    return this.prisma.$transaction(async (db) => {
      await this.data.ownedCourse(db, actor, courseId);
      const session = await this.owned(db, courseId, sessionId);
      if (new Date(session.startsAt).getTime() !== data.startsAt.getTime()) this.assertFuture(data.startsAt);
      await this.assertModule(db, courseId, data.moduleId);
      await db.courseLiveSession.update({ where: { id: sessionId }, data });
      return this.list(db, courseId);
    });
  }

  /** Cancela o vuelve a programar. La sesión nunca se borra: el estudiante ve las canceladas. */
  async setStatus(actor: AuthUser, courseId: string, sessionId: string, status: 'programada' | 'cancelada') {
    return this.prisma.$transaction(async (db) => {
      await this.data.ownedCourse(db, actor, courseId);
      const session = await this.owned(db, courseId, sessionId);
      if (status === 'programada' && session.status === 'CANCELADA') this.assertFuture(new Date(session.startsAt));
      await db.courseLiveSession.update({ where: { id: sessionId }, data: { status: status === 'cancelada' ? 'CANCELADA' : 'PROGRAMADA' } });
      return this.list(db, courseId);
    });
  }

  /**
   * Grabación (20/11/2026): enlace https (Google Drive, YouTube u otra fuente compatible) que el Instructor agrega
   * cuando la clase ya se realizó; null la quita. La plataforma no graba: solo guarda el enlace indicado.
   */
  async setRecording(actor: AuthUser, courseId: string, sessionId: string, recordingUrl: string | null) {
    const url = recordingUrl?.trim() || null;
    if (url) {
      const source = url.length <= 500 ? sourceFromUrl(url) : null;
      if (!source || source.kind === 'placeholder') {
        throw invalid('El enlace de la grabación debe ser https (Google Drive, YouTube u otra fuente compatible).');
      }
    }
    return this.prisma.$transaction(async (db) => {
      await this.data.ownedCourse(db, actor, courseId);
      const session = await this.owned(db, courseId, sessionId);
      if (url && session.status === 'CANCELADA') throw invalid('La clase está cancelada: no se le puede agregar una grabación.');
      if (url && new Date(session.startsAt).getTime() > Date.now()) throw invalid('La grabación se agrega cuando la clase ya se realizó.');
      await db.courseLiveSession.update({ where: { id: sessionId }, data: { recordingUrl: url } });
      return this.list(db, courseId);
    });
  }

  /** Al eliminar un módulo, sus clases pasan al módulo de destino o, sin destino, quedan sin módulo (nunca se borran). */
  static async detachModule(db: Db, moduleId: string, targetModuleId: string | null) {
    await db.courseLiveSession.updateMany({ where: { moduleId }, data: { moduleId: targetModuleId } });
  }
}

