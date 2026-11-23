import 'dotenv/config';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { envFlag } from '../../src/config/env.validation.js';
import { createPrismaFromUrl, databaseName } from '../../src/ops/prisma-from-url.js';

/**
 * URL de la base de PRUEBAS (TEST_DATABASE_URL en backend/.env). Por seguridad, el nombre de la base debe terminar
 * en «_test»: las pruebas vacían sus tablas y nunca deben apuntar a aula_imc_dev ni a una base real.
 */
export function testDatabaseUrl(): string {
  const url = process.env['TEST_DATABASE_URL'];
  if (!url) throw new Error('Falta TEST_DATABASE_URL en backend/.env (ver .env.example).');
  const name = databaseName(url);
  if (!name.endsWith('_test')) {
    throw new Error(`TEST_DATABASE_URL apunta a «${name}». Por seguridad, la base de pruebas debe terminar en _test.`);
  }
  return url;
}

export function testPrisma(): PrismaClient {
  return createPrismaFromUrl(testDatabaseUrl(), envFlag(process.env['DB_ALLOW_PUBLIC_KEY_RETRIEVAL']));
}

/** Vacía las tablas de B1.1, B2.1, B2.2a y B2.3c en la base de pruebas (orden compatible con las claves foráneas). */
export async function emptyTestTables(prisma: PrismaClient): Promise<void> {
  testDatabaseUrl(); // vuelve a comprobar que sea una base _test
  await prisma.auditLog.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.accountActivationToken.deleteMany(); // B2.3c
  // B2.1: primero las tablas que dependen de estudiantes, instructores, cursos y empresas.
  await prisma.enrollment.deleteMany();
  await prisma.course.deleteMany();
  await prisma.studentCompany.deleteMany();
  await prisma.instructorCompany.deleteMany();
  await prisma.instructorPermission.deleteMany(); // B2.2a: depende de instructors
  await prisma.student.deleteMany(); // antes que users: students.registered_by → users (17/11/2026)
  await prisma.instructor.deleteMany();
  await prisma.user.deleteMany();
  await prisma.company.deleteMany();
}
