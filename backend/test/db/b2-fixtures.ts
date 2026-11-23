/**
 * B2.4: datos propios de las pruebas de B2.2 y B2.3 contra MySQL real (aula_imc_test). No dependen de la semilla de
 * demostración. Todos los valores son ficticios y reconocibles:
 * - correos con el dominio reservado `.test` (RFC 2606);
 * - DNI 1000000X (no son DNI reales) y RUC «PRUEBA-000X», marcadores de 11 caracteres claramente no reales (el formato
 *   institucional del RUC sigue pendiente y no se valida su contenido);
 * - identificadores con el prefijo `db-`.
 */
import request from 'supertest';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { PasswordService } from '../../src/modules/auth/password.service.js';
import type { TestApp } from '../support/test-app.js';

export const API = '/api/v1';
/** Contraseña de las cuentas de prueba (cumple la política: letras y números, 8 o más caracteres). */
export const FIXTURE_PASSWORD = 'ClavePrueba2026';

const passwords = new PasswordService();
let hashed: Promise<string> | null = null;
/** El hash argon2id es lento: se calcula una sola vez por archivo de pruebas. */
const fixtureHash = () => (hashed ??= passwords.hash(FIXTURE_PASSWORD));

export async function createCompany(prisma: PrismaClient, id: string, name: string, ruc: string, active = true): Promise<void> {
  await prisma.company.create({ data: { id, name, ruc, active } });
}

/** Instructor con perfil; opcionalmente con el permiso de administración general y empresas asignadas. */
export async function createInstructor(
  prisma: PrismaClient,
  id: string,
  options: { generalAdmin?: boolean; companyIds?: string[]; active?: boolean } = {},
): Promise<void> {
  await prisma.user.create({
    data: {
      id,
      email: `${id}@prueba.test`,
      role: 'INSTRUCTOR',
      firstNames: 'Instructor',
      lastNames: id,
      passwordHash: await fixtureHash(),
      active: options.active ?? true,
      instructor: { create: {} },
    },
  });
  if (options.generalAdmin) await prisma.instructorPermission.create({ data: { instructorId: id, permission: 'IMC_GENERAL_ADMIN' } });
  for (const companyId of options.companyIds ?? []) await prisma.instructorCompany.create({ data: { instructorId: id, companyId } });
}

/**
 * Estudiante activo (ya activado) con perfil y sus empresas. `registeredBy`: Instructor que lo registró (regla del
 * 17/11/2026: solo ese Instructor lo ve). Sin él, el estudiante no es visible para nadie (como los anteriores a la regla).
 */
export async function createStudent(
  prisma: PrismaClient,
  id: string,
  dni: string,
  companyIds: string[],
  names: { firstNames?: string; lastNames?: string; active?: boolean; registeredBy?: string } = {},
): Promise<void> {
  await prisma.user.create({
    data: {
      id,
      email: `${id}@prueba.test`,
      role: 'STUDENT',
      firstNames: names.firstNames ?? 'Estudiante',
      lastNames: names.lastNames ?? id,
      passwordHash: await fixtureHash(),
      active: names.active ?? true,
      student: { create: { dni, ...(names.registeredBy ? { registeredBy: { connect: { id: names.registeredBy } } } : {}) } },
    },
  });
  for (const companyId of companyIds) await prisma.studentCompany.create({ data: { studentId: id, companyId } });
}

/** Token de acceso de una cuenta de prueba. Se pide ANTES de construir la petición que lo usa. */
export async function bearer(t: TestApp, email: string, password = FIXTURE_PASSWORD): Promise<string> {
  const res = await request(t.http).post(`${API}/auth/login`).send({ email, password });
  if (res.status !== 200) throw new Error(`No se pudo iniciar sesión con ${email} (HTTP ${res.status}).`);
  return res.body.accessToken as string;
}

/**
 * Deja el servidor HTTP escuchando en un puerto local efímero. Necesario para enviar solicitudes SIMULTÁNEAS con
 * supertest (si no escucha, supertest lo abre en cada solicitud y dos a la vez chocan).
 */
export async function listen(t: TestApp): Promise<void> {
  const server = t.http as { listening: boolean; listen: (port: number, host: string, cb: () => void) => void };
  if (!server.listening) await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
}
