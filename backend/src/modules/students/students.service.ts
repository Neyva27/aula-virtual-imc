import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '../../generated/prisma/enums.js';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CompanyScopeService, STUDENT_NOT_FOUND } from '../../authz/company-scope.service.js';
import type { AuthUser } from '../../common/auth-user.js';
import {
  DEFAULT_PAGE_SIZE,
  type AssignStudentCompaniesDto,
  type AssignStudentCompaniesResultDto,
  type ListStudentsQueryDto,
  type RemoveStudentCompanyResultDto,
  type StudentCompanyDto,
  type StudentDto,
  type StudentPageDto,
  type UpdateStudentContactDto,
} from './student.dto.js';

export const STUDENT_INACTIVE = 'La cuenta del estudiante está desactivada y no admite nuevas asignaciones.';
export const companyInactiveForStudents = (name: string) => `La empresa «${name}» está desactivada y no admite nuevas asignaciones.`;
export const STUDENT_COMPANY_NOT_FOUND = 'El estudiante no está asociado a esa empresa.';
export const LAST_COMPANY = 'No se puede retirar la única empresa del estudiante: debe conservar al menos una.';
export const STUDENT_COMPANIES_CONFLICT = 'Las empresas del estudiante cambiaron mientras se procesaba la solicitud. Vuelve a intentarlo.';

/** Acciones de la bitácora de B2.3b. */
export type StudentCompanyAuditAction = 'STUDENT_COMPANY_ASSIGNED' | 'STUDENT_COMPANY_REMOVED';

/** Contexto de una operación: el actor sale SIEMPRE del token (request.user), nunca de la petición. */
export interface InstructorContext {
  actor: AuthUser;
  ip: string | null;
}

/**
 * B2.3b. Las escrituras sobre las empresas de un estudiante se ejecutan con:
 * - READ COMMITTED: cada lectura ve lo último confirmado (no una instantánea anterior al bloqueo);
 * - un bloqueo de la fila del estudiante (`SELECT … FOR UPDATE`) como PRIMERA sentencia, que serializa las operaciones
 *   concurrentes sobre el mismo estudiante. Así la regla «al menos una empresa» no depende de una comprobación previa
 *   que pueda quedar obsoleta: dos retiros simultáneos de sus dos últimas empresas no pueden pasar ambos.
 */
const WRITE_TX = { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted } as const;

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002';
}

const USER_SELECT = { id: true, email: true, firstNames: true, lastNames: true, active: true, activationPending: true } satisfies Prisma.UserSelect;
type UserRow = Prisma.UserGetPayload<{ select: typeof USER_SELECT }>;

const unique = (ids: readonly string[]) => [...new Set(ids)];
/** Minúsculas y sin tildes (búsqueda que no distingue «Pérez» de «perez»). */
const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * B2.3a: consulta de estudiantes dentro del alcance del Instructor autenticado. B2.3b: asignación y retiro de
 * empresas de estudiantes existentes (ver assignCompanies y removeCompany).
 *
 * - El alcance sale SIEMPRE de `CompanyScopeService` con el `AuthUser` del token. Ningún identificador enviado por el
 *   cliente determina la identidad ni amplía el alcance.
 * - Regla vigente (17/11/2026): un estudiante es visible SOLO para el Instructor que lo registró
 *   (`students.registered_by`), tenga o no empresas. El permiso IMC_GENERAL_ADMIN no da alcance.
 * - Opción A (20/11/2026): el Instructor puede elegir cualquier empresa registrada (activa para asignar). El filtro
 *   `companyId` admite cualquier empresa existente (si no, 404) y filtra SOLO dentro de sus estudiantes. Se muestran
 *   todas las empresas de sus participantes.
 * - Fuera del alcance o inexistente: 404 con el mismo mensaje (`assertStudentInScope`).
 */
@Injectable()
export class StudentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: CompanyScopeService,
  ) {}

  async list(actor: AuthUser, query: ListStudentsQueryDto): Promise<StudentPageDto> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const empty: StudentPageDto = { items: [], total: 0, page, pageSize };

    this.scope.assertInstructor(actor); // 403 a quien no es Instructor
    if (query.companyId !== undefined) await this.scope.assertCompaniesInScope(actor, [query.companyId]); // inexistente → 404

    // Estudiantes registrados por este Instructor (dos pasos: sin filtros por relación).
    let candidateIds = (
      await this.prisma.student.findMany({ where: { registeredById: actor.id }, select: { userId: true } })
    ).map((s) => s.userId);
    if (query.companyId !== undefined && candidateIds.length) {
      const inCompany = new Set(
        (
          await this.prisma.studentCompany.findMany({
            where: { companyId: query.companyId, studentId: { in: candidateIds } },
            select: { studentId: true },
          })
        ).map((l) => l.studentId),
      );
      candidateIds = candidateIds.filter((id) => inCompany.has(id));
    }
    if (!candidateIds.length) return empty;
    if (query.q) candidateIds = await this.matchingSearch(candidateIds, query.q);
    if (!candidateIds.length) return empty;

    const where: Prisma.UserWhereInput = { id: { in: candidateIds }, role: Role.STUDENT };

    const total = await this.prisma.user.count({ where });
    if (!total) return empty;
    const users = await this.prisma.user.findMany({
      where,
      select: USER_SELECT,
      orderBy: [{ lastNames: 'asc' }, { firstNames: 'asc' }, { id: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { items: await this.toDtos(users), total, page, pageSize };
  }

  /**
   * Búsqueda avanzada (20/11/2026), SOLO entre los estudiantes del Instructor: por nombres, apellidos, nombre completo,
   * DNI, correo, razón social o RUC de sus empresas. Cada palabra debe aparecer en alguno de esos datos (sin distinguir
   * mayúsculas ni tildes): «juan perez» encuentra a «Juan Pérez», «gloria» o «20100190797» a los de esa empresa.
   */
  private async matchingSearch(candidateIds: string[], q: string): Promise<string[]> {
    const tokens = fold(q).split(/\s+/).filter(Boolean);
    if (!tokens.length) return candidateIds;
    const users = await this.prisma.user.findMany({
      where: { id: { in: candidateIds } },
      select: { id: true, firstNames: true, lastNames: true, email: true },
    });
    const dniOf = new Map(
      (await this.prisma.student.findMany({ where: { userId: { in: candidateIds } }, select: { userId: true, dni: true } })).map((st) => [st.userId, st.dni]),
    );
    const links = await this.prisma.studentCompany.findMany({ where: { studentId: { in: candidateIds } }, select: { studentId: true, companyId: true } });
    const companies = links.length
      ? await this.prisma.company.findMany({ where: { id: { in: unique(links.map((l) => l.companyId)) } }, select: { id: true, name: true, ruc: true } })
      : [];
    const companyOf = new Map(companies.map((c) => [c.id, c]));
    return users
      .filter((u) => {
        const own = links.filter((l) => l.studentId === u.id).map((l) => companyOf.get(l.companyId));
        const haystack = fold(
          [u.firstNames, u.lastNames, u.email, dniOf.get(u.id) ?? '', ...own.flatMap((c) => (c ? [c.name, c.ruc] : []))].join(' '),
        );
        return tokens.every((t) => haystack.includes(t));
      })
      .map((u) => u.id);
  }

  /**
   * Empresas que el Instructor puede elegir (opción A, 20/11/2026): todas las ACTIVAS registradas, ordenadas por nombre.
   * Alimenta el selector con búsqueda del registro y el filtro del listado. Solo lectura.
   */
  async myCompanies(actor: AuthUser): Promise<StudentCompanyDto[]> {
    // Opción A (20/11/2026): todas las empresas ACTIVAS registradas, para buscarlas por nombre (razón social) o RUC.
    this.scope.assertInstructor(actor);
    const companies = await this.prisma.company.findMany({
      where: { active: true },
      select: { id: true, name: true, ruc: true, active: true },
    });
    return companies.sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }

  async findOne(actor: AuthUser, id: string): Promise<StudentDto> {
    await this.scope.assertStudentInScope(actor, id); // inexistente o fuera del alcance → mismo 404
    const user = await this.prisma.user.findUnique({ where: { id }, select: USER_SELECT });
    // assertStudentInScope ya garantiza que existe; se comprueba por si desapareciera entre ambas consultas.
    if (!user) throw new NotFoundException(STUDENT_NOT_FOUND);
    return (await this.toDtos([user]))[0];
  }

  /**
   * B2.3b: asigna empresas del Instructor a un estudiante de su alcance. Todo o nada:
   * 404 si el estudiante o alguna empresa están fuera del alcance (o no existen); 409 si la cuenta del estudiante o
   * alguna empresa indicada están inactivas (se rechaza la solicitud completa). Las asociaciones existentes no se
   * duplican. Una fila de bitácora por asociación creada, en la misma transacción.
   */
  async assignCompanies(
    studentId: string,
    input: AssignStudentCompaniesDto,
    ctx: InstructorContext,
  ): Promise<AssignStudentCompaniesResultDto> {
    const companyIds = unique(input.companyIds);
    // Alcance antes de cualquier escritura (la identidad es ctx.actor, del token).
    await this.scope.assertStudentInScope(ctx.actor, studentId);
    await this.scope.assertCompaniesInScope(ctx.actor, companyIds);

    const result = await this.atomic(async (tx) => {
      await this.lockStudent(tx, studentId);
      const user = await tx.user.findUnique({ where: { id: studentId }, select: { active: true } });
      if (!user) throw new NotFoundException(STUDENT_NOT_FOUND);
      if (!user.active) throw new ConflictException(STUDENT_INACTIVE);
      const companies = await tx.company.findMany({ where: { id: { in: companyIds } }, select: { id: true, name: true, active: true } });
      const inactive = companyIds.map((id) => companies.find((c) => c.id === id)).find((c) => c && !c.active);
      if (inactive) throw new ConflictException(companyInactiveForStudents(inactive.name));

      const existing = new Set(
        (await tx.studentCompany.findMany({ where: { studentId, companyId: { in: companyIds } }, select: { companyId: true } })).map(
          (l) => l.companyId,
        ),
      );
      const created = companyIds.filter((id) => !existing.has(id));
      for (const companyId of created) {
        await tx.studentCompany.create({ data: { studentId, companyId, assignedById: ctx.actor.id } });
        await this.audit(tx, ctx, 'STUDENT_COMPANY_ASSIGNED', studentId, companyId, 'assign');
      }
      return { created, alreadyAssigned: companyIds.filter((id) => existing.has(id)) };
    });
    return { ...result, student: await this.findOne(ctx.actor, studentId) };
  }

  /**
   * B2.3b: retira la asociación del estudiante con una empresa del Instructor. Solo borra esa fila de
   * `student_companies` (nunca el usuario, su perfil, matrículas ni historial). Permitido aunque la empresa esté
   * inactiva. 409 si es la única empresa del estudiante (contando TODAS sus empresas, también las de otros
   * Instructores): la comprobación se hace tras el bloqueo de la fila del estudiante.
   */
  async removeCompany(studentId: string, companyId: string, ctx: InstructorContext): Promise<RemoveStudentCompanyResultDto> {
    await this.scope.assertStudentInScope(ctx.actor, studentId);
    await this.scope.assertCompaniesInScope(ctx.actor, [companyId]);

    await this.atomic(async (tx) => {
      await this.lockStudent(tx, studentId);
      const key = { studentId_companyId: { studentId, companyId } };
      if (!(await tx.studentCompany.findUnique({ where: key, select: { studentId: true } }))) {
        throw new NotFoundException(STUDENT_COMPANY_NOT_FOUND);
      }
      if ((await tx.studentCompany.count({ where: { studentId } })) <= 1) throw new ConflictException(LAST_COMPANY);
      await tx.studentCompany.delete({ where: key });
      await this.audit(tx, ctx, 'STUDENT_COMPANY_REMOVED', studentId, companyId, 'remove');
    });
    return { studentId, companyId, stillVisible: await this.scope.canAccessStudent(ctx.actor, studentId) };
  }

  /** Actualiza el WhatsApp de un participante propio (404 si no). Bitácora sin el número. No crea ni duplica cuentas. */
  async updateContact(studentId: string, input: UpdateStudentContactDto, ctx: InstructorContext): Promise<StudentDto> {
    await this.scope.assertStudentInScope(ctx.actor, studentId);
    await this.prisma.$transaction(async (tx) => {
      await tx.student.update({ where: { userId: studentId }, data: { whatsapp: input.whatsapp } });
      await tx.auditLog.create({
        data: { action: 'STUDENT_CONTACT_UPDATED', actorId: ctx.actor.id, entity: 'student', entityId: studentId, ip: ctx.ip, data: { whatsapp: input.whatsapp ? 'set' : 'cleared' } },
      });
    });
    return this.findOne(ctx.actor, studentId);
  }

  /** Bloquea la fila del estudiante hasta el final de la transacción (consulta parametrizada). */
  private async lockStudent(tx: Prisma.TransactionClient, studentId: string): Promise<void> {
    await tx.$queryRaw`SELECT user_id FROM students WHERE user_id = ${studentId} FOR UPDATE`;
  }

  /** Transacción de escritura; una carrera por clave duplicada se informa como 409 sin aplicar nada. */
  private async atomic<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    try {
      return await this.prisma.$transaction(work, WRITE_TX);
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException(STUDENT_COMPANIES_CONFLICT);
      throw error;
    }
  }

  /** Bitácora en la misma transacción: solo identificadores y la operación, sin correo, DNI ni nombres. */
  private async audit(
    tx: Prisma.TransactionClient,
    ctx: InstructorContext,
    action: StudentCompanyAuditAction,
    studentId: string,
    companyId: string,
    operation: 'assign' | 'remove',
  ): Promise<void> {
    await tx.auditLog.create({
      data: { action, actorId: ctx.actor.id, entity: 'student', entityId: studentId, ip: ctx.ip, data: { companyId, operation } },
    });
  }

  /** Completa DNI y empresas visibles (intersección con el alcance del Instructor), conservando el orden recibido. */
  /** Opción A (20/11/2026): se muestran TODAS las empresas del participante (solo se listan participantes propios). */
  private async toDtos(users: readonly UserRow[]): Promise<StudentDto[]> {
    if (!users.length) return [];
    const ids = users.map((u) => u.id);
    const students = await this.prisma.student.findMany({ where: { userId: { in: ids } }, select: { userId: true, dni: true, whatsapp: true } });
    const links = await this.prisma.studentCompany.findMany({
      where: { studentId: { in: ids } },
      select: { studentId: true, companyId: true },
    });
    const companies = links.length
      ? await this.prisma.company.findMany({
          where: { id: { in: unique(links.map((l) => l.companyId)) } },
          select: { id: true, name: true, ruc: true, active: true },
        })
      : [];
    const dniOf = new Map(students.map((s) => [s.userId, s.dni]));
    const whatsappOf = new Map(students.map((s) => [s.userId, s.whatsapp]));
    const companyOf = new Map(companies.map((c) => [c.id, c]));
    return users.map((u) => ({
      id: u.id,
      email: u.email,
      firstNames: u.firstNames,
      lastNames: u.lastNames,
      fullName: `${u.firstNames} ${u.lastNames}`,
      dni: dniOf.get(u.id) ?? '',
      whatsapp: whatsappOf.get(u.id) ?? null,
      active: u.active,
      activationPending: u.activationPending,
      companies: links
        .filter((l) => l.studentId === u.id && companyOf.has(l.companyId))
        .map((l) => companyOf.get(l.companyId)!)
        .sort((a, b) => a.name.localeCompare(b.name, 'es')),
    }));
  }
}
