/**
 * B1.1 y B2.1 contra MySQL real (aula_imc_test): migraciones, semilla, restricciones de la base y flujo de autenticación.
 * Ejecutar con `npm run test:db` después de crear las bases (prisma/sql/crear-bases-locales.sql).
 */
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { DEMO_STUDENTS, seedDemo } from '../../prisma/seed-data.js';
import { CLIENT_HEADER, createTestApp, DEMO_PASSWORD, refreshCookieOf, type TestApp } from '../support/test-app.js';
import { emptyTestTables, testDatabaseUrl, testPrisma } from './test-database.js';

const API = '/api/v1';

describe('MySQL: esquema y semilla', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = testPrisma();
  });
  beforeEach(() => emptyTestTables(prisma));
  afterAll(() => prisma.$disconnect());

  it('la semilla crea 1 empresa, 7 usuarios, 6 estudiantes y el perfil del Instructor, y es idempotente', async () => {
    expect(await seedDemo(prisma, DEMO_PASSWORD)).toEqual({
      companies: 1,
      users: 7,
      students: 6,
      instructors: 1,
      studentCompanies: 6,
      instructorCompanies: 1,
    });
    expect(await seedDemo(prisma, DEMO_PASSWORD)).toEqual({
      companies: 0,
      users: 0,
      students: 0,
      instructors: 0,
      studentCompanies: 0,
      instructorCompanies: 0,
    });
    expect(await prisma.user.count()).toBe(7);
    expect(await prisma.user.count({ where: { role: 'INSTRUCTOR' } })).toBe(1);
    // B2.1: la empresa de cada estudiante está en student_companies.
    expect(await prisma.studentCompany.count({ where: { companyId: 'emp-demo' } })).toBe(DEMO_STUDENTS.length);
    expect(await prisma.instructorCompany.count({ where: { instructorId: 'a1', companyId: 'emp-demo' } })).toBe(1);
  });

  it('la semilla no modifica registros existentes', async () => {
    await seedDemo(prisma, DEMO_PASSWORD);
    await prisma.user.update({ where: { id: 'u1' }, data: { firstNames: 'Ana María' } });
    await seedDemo(prisma, DEMO_PASSWORD);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: 'u1' } })).firstNames).toBe('Ana María');
  });

  it('la base rechaza correo, DNI y RUC duplicados', async () => {
    await seedDemo(prisma, DEMO_PASSWORD);
    const user = { role: 'STUDENT' as const, firstNames: 'X', lastNames: 'Y', passwordHash: 'h' };
    await expect(prisma.user.create({ data: { ...user, email: 'ana@ejemplo.test' } })).rejects.toMatchObject({ code: 'P2002' });
    const extra = await prisma.user.create({ data: { ...user, email: 'nuevo@ejemplo.test' } });
    await expect(prisma.student.create({ data: { userId: extra.id, dni: '00000001' } })).rejects.toMatchObject({
      code: 'P2002',
    });
    await expect(prisma.company.create({ data: { name: 'Otra', ruc: '00000000001' } })).rejects.toMatchObject({ code: 'P2002' });
  });

  it('B2.1: un estudiante puede no tener empresa; la asociación exige una empresa existente y no se duplica', async () => {
    await seedDemo(prisma, DEMO_PASSWORD);
    const extra = await prisma.user.create({
      data: { role: 'STUDENT', firstNames: 'X', lastNames: 'Y', passwordHash: 'h', email: 'sin-empresa@ejemplo.test' },
    });
    await prisma.student.create({ data: { userId: extra.id, dni: '00000099' } });
    expect(await prisma.studentCompany.count({ where: { studentId: extra.id } })).toBe(0);
    await expect(prisma.studentCompany.create({ data: { studentId: extra.id, companyId: 'no-existe' } })).rejects.toThrow();
    await prisma.studentCompany.create({ data: { studentId: extra.id, companyId: 'emp-demo' } });
    await expect(prisma.studentCompany.create({ data: { studentId: extra.id, companyId: 'emp-demo' } })).rejects.toMatchObject({
      code: 'P2002',
    });
    // Varias empresas por estudiante: lo cubren las pruebas con la base simulada (no se crean RUC nuevos).
  });

  it('B2.1: la empresa de un Instructor exige su perfil; las matrículas no se duplican', async () => {
    await seedDemo(prisma, DEMO_PASSWORD);
    // u1 es estudiante: no tiene perfil de Instructor, así que no se le puede asignar una empresa como Instructor.
    await expect(prisma.instructorCompany.create({ data: { instructorId: 'u1', companyId: 'emp-demo' } })).rejects.toThrow();
    await prisma.course.create({ data: { id: 'curso-prueba', name: 'Curso de prueba' } });
    await prisma.enrollment.create({ data: { studentId: 'u1', courseId: 'curso-prueba' } });
    await prisma.enrollment.create({ data: { studentId: 'u2', courseId: 'curso-prueba' } });
    await expect(prisma.enrollment.create({ data: { studentId: 'u1', courseId: 'curso-prueba' } })).rejects.toMatchObject({
      code: 'P2002',
    });
    await expect(prisma.enrollment.create({ data: { studentId: 'u1', courseId: 'no-existe' } })).rejects.toThrow();
  });

  it('no se puede borrar una empresa que tiene estudiantes', async () => {
    await seedDemo(prisma, DEMO_PASSWORD);
    await expect(prisma.company.delete({ where: { id: 'emp-demo' } })).rejects.toThrow();
  });
});

describe('MySQL: flujo de autenticación por HTTP', () => {
  let prisma: PrismaClient;
  let t: TestApp;

  beforeAll(async () => {
    prisma = testPrisma();
    t = await createTestApp(prisma, { DATABASE_URL: testDatabaseUrl() });
  });
  beforeEach(async () => {
    await emptyTestTables(prisma);
    await seedDemo(prisma, DEMO_PASSWORD);
  });
  afterAll(async () => {
    await t.close();
    await prisma.$disconnect();
  });

  it('inicio de sesión, perfil, rotación, detección de reutilización y cierre de todas las sesiones', async () => {
    const login = await request(t.http).post(`${API}/auth/login`).send({ email: 'ana@ejemplo.test', password: DEMO_PASSWORD });
    expect(login.status).toBe(200);
    const auth = { Authorization: `Bearer ${login.body.accessToken}` };

    const me = await request(t.http).get(`${API}/auth/me`).set(auth);
    expect(me.body).toMatchObject({ id: 'u1', student: { dni: '00000001', companies: [{ id: 'emp-demo', ruc: '00000000001' }] } });

    const first = refreshCookieOf(login)!.value;
    const renewed = await request(t.http).post(`${API}/auth/refresh`).set(CLIENT_HEADER).set('Cookie', `imc_refresh=${first}`);
    expect(renewed.status).toBe(200);
    expect((await request(t.http).post(`${API}/auth/refresh`).set(CLIENT_HEADER).set('Cookie', `imc_refresh=${first}`)).status).toBe(401);
    expect(await prisma.refreshToken.count({ where: { revokedReason: 'REUSE_DETECTED' } })).toBe(1);

    const again = await request(t.http).post(`${API}/auth/login`).send({ email: 'ana@ejemplo.test', password: DEMO_PASSWORD });
    expect((await request(t.http).post(`${API}/auth/logout-all`).set({ Authorization: `Bearer ${again.body.accessToken}` })).status).toBe(204);
    expect((await request(t.http).get(`${API}/auth/me`).set({ Authorization: `Bearer ${again.body.accessToken}` })).status).toBe(401);
    expect(await prisma.refreshToken.count({ where: { userId: 'u1', revokedAt: null } })).toBe(0);
  });

  it('el bloqueo por intentos fallidos queda guardado en la base', async () => {
    for (let i = 0; i < 5; i++) {
      await request(t.http).post(`${API}/auth/login`).send({ email: 'luis@ejemplo.test', password: 'mala' });
    }
    const luis = await prisma.user.findUniqueOrThrow({ where: { id: 'u2' } });
    expect(luis.lockedUntil!.getTime()).toBeGreaterThan(Date.now() + 14 * 60_000);
    expect(await prisma.auditLog.count({ where: { action: 'ACCOUNT_LOCKED', actorId: 'u2' } })).toBe(1);
  });

  it('el Instructor consulta solo a quien registró; los de la semilla no tienen registered_by; el estudiante recibe 403', async () => {
    const instructor = await request(t.http).post(`${API}/auth/login`).send({ email: 'admin@ejemplo.test', password: DEMO_PASSWORD });
    const student = await request(t.http).post(`${API}/auth/login`).send({ email: 'rosa@ejemplo.test', password: DEMO_PASSWORD });
    const auth = { Authorization: `Bearer ${instructor.body.accessToken}` };
    // Regla del 17/11/2026: la semilla no asigna los estudiantes a nadie, así que a1 no ve a u5…
    expect(await prisma.student.count({ where: { registeredById: { not: null } } })).toBe(0);
    expect((await request(t.http).get(`${API}/users/u5`).set(auth)).status).toBe(404);
    // …hasta que conste que a1 lo registró.
    await prisma.student.update({ where: { userId: 'u5' }, data: { registeredBy: { connect: { id: 'a1' } } } });
    expect((await request(t.http).get(`${API}/users/u5`).set(auth)).status).toBe(200);
    expect((await request(t.http).get(`${API}/users/u1`).set({ Authorization: `Bearer ${student.body.accessToken}` })).status).toBe(403);
  });

  it('el health check informa la base disponible', async () => {
    const res = await request(t.http).get(`${API}/health`);
    expect(res.status).toBe(200);
    expect(res.body.database).toBe('ok');
  });
});
