import { randomInt } from 'node:crypto';
import { Role, type PrismaClient } from '../generated/prisma/client.js';

export class BootstrapRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BootstrapRefusedError';
  }
}

export interface FirstInstructorInput {
  email: string;
  firstNames: string;
  lastNames: string;
}

export interface FirstInstructorResult {
  id: string;
  email: string;
  /** Se muestra UNA sola vez al operador y nunca se guarda: en la base solo queda su hash. */
  temporaryPassword: string;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Sin caracteres ambiguos (0/O, 1/l/I) para dictarla o copiarla sin errores.
const LOWER = 'abcdefghijkmnopqrstuvwxyz';
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITS = '23456789';
const ALL = LOWER + UPPER + DIGITS;

/**
 * Contraseña temporal de 20 caracteres (≈ 117 bits) con al menos una minúscula, una mayúscula y un dígito,
 * generada con el generador criptográfico de Node. Cumple la política de ChangePasswordDto.
 */
export function generateTemporaryPassword(length = 20): string {
  const pick = (set: string) => set[randomInt(set.length)];
  const chars = [pick(LOWER), pick(UPPER), pick(DIGITS), ...Array.from({ length: length - 3 }, () => pick(ALL))];
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

export function validateInstructorInput(input: FirstInstructorInput): FirstInstructorInput {
  const email = input.email.trim().toLowerCase();
  const firstNames = input.firstNames.trim().replace(/\s+/g, ' ');
  const lastNames = input.lastNames.trim().replace(/\s+/g, ' ');
  const problems: string[] = [];
  if (!EMAIL.test(email) || email.length > 191) problems.push('El correo electrónico no es válido.');
  if (firstNames.length < 2 || firstNames.length > 100) problems.push('Los nombres deben tener entre 2 y 100 caracteres.');
  if (lastNames.length < 2 || lastNames.length > 100) problems.push('Los apellidos deben tener entre 2 y 100 caracteres.');
  if (problems.length) throw new BootstrapRefusedError(problems.join(' '));
  return { email, firstNames, lastNames };
}

/**
 * Punto C (admin:create): crea el PRIMER Instructor de una base sin instructores activos.
 * - Se niega si ya existe un Instructor activo: los demás se crean desde la administración (B2).
 * - Contraseña temporal fuerte, guardada solo como hash, con cambio obligatorio en el primer ingreso.
 * - Registra la acción en la bitácora, sin la contraseña.
 */
export async function createFirstInstructor(
  prisma: PrismaClient,
  rawInput: FirstInstructorInput,
  hashPassword: (plain: string) => Promise<string>,
): Promise<FirstInstructorResult> {
  const input = validateInstructorInput(rawInput);
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);

  const user = await prisma.$transaction(async (tx) => {
    if ((await tx.user.count({ where: { role: Role.INSTRUCTOR, active: true } })) > 0) {
      throw new BootstrapRefusedError(
        'Ya existe un Instructor activo. Este comando solo crea el primero; los demás se crean desde la administración.',
      );
    }
    if (await tx.user.findUnique({ where: { email: input.email }, select: { id: true } })) {
      throw new BootstrapRefusedError('Ya existe un usuario con ese correo electrónico.');
    }
    // B2.1: el Instructor se crea con su perfil (`instructors`) en la misma operación; sin empresas asignadas.
    const created = await tx.user.create({
      data: { ...input, role: Role.INSTRUCTOR, passwordHash, mustChangePassword: true, instructor: { create: {} } },
      select: { id: true, email: true },
    });
    await tx.auditLog.create({
      data: { action: 'INSTRUCTOR_BOOTSTRAP', actorId: null, entity: 'user', entityId: created.id, data: { method: 'cli' } },
    });
    return created;
  });

  return { id: user.id, email: user.email, temporaryPassword };
}
