import { AdminPermission, Role, type PrismaClient } from '../generated/prisma/client.js';
import { BootstrapRefusedError } from './bootstrap-instructor.js';

export interface GeneralAdminGrantResult {
  userId: string;
  email: string;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(raw: string): string {
  const email = raw.trim().toLowerCase();
  if (!EMAIL.test(email) || email.length > 191) throw new BootstrapRefusedError('El correo electrónico no es válido.');
  return email;
}

/**
 * B2.2a (`admin:grant-general`): otorga el permiso IMC_GENERAL_ADMIN a la PRIMERA cuenta de administración general.
 * Controles:
 * - Solo a una cuenta que ya existe: activa, con rol INSTRUCTOR y con perfil de Instructor. No crea usuarios, no cambia
 *   el rol, la contraseña, el cambio obligatorio ni las sesiones.
 * - Se niega si ya hay una cuenta ACTIVA con el permiso: es un mecanismo de arranque, no de gestión. Otorgar permisos
 *   adicionales o retirarlos queda para un mecanismo posterior (pendiente de decisión).
 * - Todo en una transacción, con registro en la bitácora (actor NULL: lo ejecuta un operador con acceso al servidor).
 * No existe ninguna ruta HTTP que otorgue permisos: un usuario no puede otorgárselos a sí mismo desde la plataforma.
 */
export async function grantFirstGeneralAdmin(prisma: PrismaClient, rawEmail: string): Promise<GeneralAdminGrantResult> {
  const email = normalizeEmail(rawEmail);
  const permission = AdminPermission.IMC_GENERAL_ADMIN;

  return prisma.$transaction(async (tx) => {
    const holders = await tx.instructorPermission.findMany({ where: { permission }, select: { instructorId: true } });
    if (holders.length) {
      const activeHolders = await tx.user.count({ where: { id: { in: holders.map((h) => h.instructorId) }, active: true } });
      if (activeHolders > 0) {
        throw new BootstrapRefusedError(
          'Ya existe una cuenta activa con el permiso de administración general. Este comando solo habilita la primera.',
        );
      }
    }

    const user = await tx.user.findUnique({ where: { email }, select: { id: true, email: true, role: true, active: true } });
    if (!user) throw new BootstrapRefusedError('No existe una cuenta con ese correo electrónico.');
    if (user.role !== Role.INSTRUCTOR) throw new BootstrapRefusedError('La cuenta no tiene el rol Instructor.');
    if (!user.active) throw new BootstrapRefusedError('La cuenta está desactivada.');
    if (!(await tx.instructor.findUnique({ where: { userId: user.id } }))) {
      throw new BootstrapRefusedError('La cuenta no tiene perfil de Instructor (¿falta aplicar la migración de B2.1?).');
    }

    await tx.instructorPermission.create({ data: { instructorId: user.id, permission, grantedById: null } });
    await tx.auditLog.create({
      data: { action: 'GENERAL_ADMIN_GRANTED', actorId: null, entity: 'user', entityId: user.id, data: { method: 'cli', permission } },
    });
    return { userId: user.id, email: user.email };
  });
}
