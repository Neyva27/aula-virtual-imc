import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '../generated/prisma/enums.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthUser } from '../common/auth-user.js';

/** Mensajes estables. Un estudiante o una empresa fuera del alcance se informan igual que uno inexistente (404). */
export const STUDENT_NOT_FOUND = 'No se encontró el estudiante.';
export const COMPANY_NOT_FOUND = 'No se encontró una de las empresas indicadas.';
export const INSTRUCTOR_ONLY = 'No tienes permiso para realizar esta acción.';

/**
 * Filtro de Prisma para listar solo los estudiantes de las empresas indicadas (para las consultas de B2.2).
 * Con una lista vacía no coincide ningún estudiante.
 */
export function studentsInCompanies(companyIds: readonly string[]): Prisma.StudentWhereInput {
  return { companies: { some: { companyId: { in: [...companyIds] } } } };
}

/**
 * Autorización del Instructor sobre estudiantes y empresas.
 *
 * Estudiantes (regla vigente desde el 17/11/2026): cada Instructor ve y gestiona SOLO a los estudiantes que registró
 * (`students.registered_by`), tengan o no empresas. Ver `canAccessStudent`.
 *
 * Empresas (B2.1): un Instructor solo puede asignar estudiantes a las empresas que tiene asignadas
 * (`instructor_companies`); las empresas ya no determinan qué estudiantes ve.
 *
 * Texto original de B2.1 (regla de visibilidad SUSTITUIDA el 17/11/2026): un Instructor solo podía ver y gestionar a
 * los estudiantes de las empresas que tenía asignadas, y solo podía asignar estudiantes a esas empresas.
 *
 * - La identidad sale SIEMPRE del usuario autenticado (`AuthUser`, que JwtAuthGuard toma del token y comprueba en la
 *   base), nunca de un `instructorId` o `userId` enviado por el cliente.
 * - Un estudiante es visible solo para quien lo registró; uno sin `registered_by` no es visible para nadie.
 * - Lo que está fuera del alcance responde 404, igual que lo inexistente, para no revelar si existe
 *   (docs/ARQUITECTURA_BACKEND.md, sección 8).
 */
@Injectable()
export class CompanyScopeService {
  constructor(private readonly prisma: PrismaService) {}

  /** Empresas asignadas al Instructor autenticado (sin repetir). Cualquier otro rol recibe 403. */
  async companyIdsOf(actor: AuthUser): Promise<string[]> {
    if (actor.role !== Role.INSTRUCTOR) throw new ForbiddenException(INSTRUCTOR_ONLY);
    const rows = await this.prisma.instructorCompany.findMany({
      where: { instructorId: actor.id },
      select: { companyId: true },
    });
    return [...new Set(rows.map((r) => r.companyId))];
  }

  /**
   * Integración (17/11/2026, decisión confirmada): un estudiante es visible SOLO para el Instructor que lo registró
   * (`students.registered_by`). Las empresas ya no dan visibilidad. Los estudiantes sin `registered_by` (anteriores a
   * esta regla) no son visibles para ningún Instructor. Cualquier otro rol recibe 403.
   */
  async canAccessStudent(actor: AuthUser, studentId: string): Promise<boolean> {
    if (actor.role !== Role.INSTRUCTOR) throw new ForbiddenException(INSTRUCTOR_ONLY);
    const student = await this.prisma.student.findUnique({ where: { userId: studentId }, select: { registeredById: true } });
    return student !== null && student.registeredById === actor.id;
  }

  /** Lanza 404 si el estudiante no existe o no lo registró el Instructor autenticado (mismo 404 en ambos casos). */
  async assertStudentInScope(actor: AuthUser, studentId: string, message = STUDENT_NOT_FOUND): Promise<void> {
    if (!(await this.canAccessStudent(actor, studentId))) throw new NotFoundException(message);
  }

  /**
   * Opción A (20/11/2026, decisión confirmada): el Instructor puede elegir CUALQUIER empresa registrada para SUS
   * participantes; ya no solo las de `instructor_companies`. Basta una empresa inexistente para rechazar la operación
   * completa (404). La regla del 12/11/2026 (una empresa inactiva no admite nuevas asignaciones, 409) la aplica cada
   * operación de asignación. El aislamiento de participantes NO cambia: sigue siendo `students.registered_by`
   * (`assertStudentInScope`), así que elegir una empresa nunca da acceso a participantes de otro Instructor.
   */
  async assertCompaniesInScope(actor: AuthUser, companyIds: readonly string[]): Promise<void> {
    if (actor.role !== Role.INSTRUCTOR) throw new ForbiddenException(INSTRUCTOR_ONLY);
    const ids = [...new Set(companyIds)];
    if (!ids.length) return;
    const found = await this.prisma.company.count({ where: { id: { in: ids } } });
    if (found !== ids.length) throw new NotFoundException(COMPANY_NOT_FOUND);
  }

  /** Lanza 403 si quien llama no es Instructor. */
  assertInstructor(actor: AuthUser): void {
    if (actor.role !== Role.INSTRUCTOR) throw new ForbiddenException(INSTRUCTOR_ONLY);
  }
}
