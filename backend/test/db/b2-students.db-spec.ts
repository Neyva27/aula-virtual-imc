/**
 * B2.4: B2.3a (consulta), B2.3b (empresas de estudiantes), B2.3c (registro y activación) y persistencia contra MySQL real
 * (aula_imc_test). Ejecutar con `npm run test:db`. Adaptado el 17/11/2026: visibilidad por quien registró
 * (`students.registered_by`) y registro sin empresa.
 *
 * - Las tablas se vacían antes de cada prueba (`emptyTestTables`, solo en una base terminada en `_test`).
 * - No usa la semilla de demostración: cada prueba crea sus datos (b2-fixtures.ts).
 * - El correo es SIMULADO (FakeMailSender): no se envía ningún correo real; el token se toma del mensaje simulado.
 * - Las pruebas de concurrencia envían solicitudes HTTP simultáneas a un servidor que escucha en 127.0.0.1, para que
 *   MySQL resuelva de verdad el bloqueo de fila y los índices únicos.
 */
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { MAIL_SENDER } from '../../src/mail/mail-sender.js';
import { hashActivationToken } from '../../src/modules/account-activation/account-activation.service.js';
import { PasswordService } from '../../src/modules/auth/password.service.js';
import { FakeMailSender } from '../support/fake-mail.js';
import { createTestApp, type TestApp } from '../support/test-app.js';
import { API, bearer, createCompany, createInstructor, createStudent, FIXTURE_PASSWORD, listen } from './b2-fixtures.js';
import { emptyTestTables, testDatabaseUrl, testPrisma } from './test-database.js';

const NEW_PASSWORD = 'ClaveActivada2026';
const INVALID_LINK = 'El enlace de activación no es válido o ya venció. Pide a tu instructor que te envíe uno nuevo.';

/**
 * db-emp1, db-emp2 (de db-ins1) y db-emp3 (de db-ins2); db-emp4 inactiva (de db-ins1).
 * Regla del 17/11/2026: cada Instructor ve solo a los estudiantes que registró (`students.registered_by`).
 * db-st1: emp1, de db-ins1. db-st2: emp1 y emp2, de db-ins1. db-st3: emp3, de db-ins2. db-st4: sin empresas, de
 * db-ins2. db-st5: emp1, SIN registered_by (como los estudiantes anteriores a la regla: no lo ve nadie).
 * db-ins3: Instructor sin empresas. db-admin: administrador general sin empresas.
 */
async function scenario(prisma: PrismaClient) {
  await createCompany(prisma, 'db-emp1', 'Empresa Uno de prueba', 'PRUEBA-0001');
  await createCompany(prisma, 'db-emp2', 'Empresa Dos de prueba', 'PRUEBA-0002');
  await createCompany(prisma, 'db-emp3', 'Empresa Tres de prueba', 'PRUEBA-0003');
  await createCompany(prisma, 'db-emp4', 'Empresa Inactiva de prueba', 'PRUEBA-0004', false);
  await createInstructor(prisma, 'db-ins1', { companyIds: ['db-emp1', 'db-emp2', 'db-emp4'] });
  await createInstructor(prisma, 'db-ins2', { companyIds: ['db-emp3'] });
  await createInstructor(prisma, 'db-ins3');
  await createInstructor(prisma, 'db-admin', { generalAdmin: true });
  await createStudent(prisma, 'db-st1', '10000001', ['db-emp1'], { firstNames: 'Marta', lastNames: 'Ibáñez Prueba', registeredBy: 'db-ins1' });
  await createStudent(prisma, 'db-st2', '10000002', ['db-emp1', 'db-emp2'], { firstNames: 'Omar', lastNames: 'Zapata Prueba', registeredBy: 'db-ins1' });
  await createStudent(prisma, 'db-st3', '10000003', ['db-emp3'], { registeredBy: 'db-ins2' });
  await createStudent(prisma, 'db-st4', '10000004', [], { registeredBy: 'db-ins2' });
  await createStudent(prisma, 'db-st5', '10000005', ['db-emp1']);
}

describe('MySQL B2.3: estudiantes', () => {
  let prisma: PrismaClient;
  let mail: FakeMailSender;
  let t: TestApp;

  beforeAll(async () => {
    prisma = testPrisma();
    mail = new FakeMailSender();
    t = await createTestApp(prisma, { DATABASE_URL: testDatabaseUrl() }, { providers: [{ provide: MAIL_SENDER, useValue: mail }] });
    await listen(t);
  });
  beforeEach(async () => {
    await emptyTestTables(prisma);
    await scenario(prisma);
    mail.sent = [];
    mail.failNext = false;
  });
  afterAll(async () => {
    await t.close();
    await prisma.$disconnect();
  });

  const as = async (id: string) => ({ Authorization: `Bearer ${await bearer(t, `${id}@prueba.test`)}` });
  const ids = (res: { body: { items: { id: string }[] } }) => res.body.items.map((s) => s.id);

  describe('Consulta: cada Instructor ve solo a los estudiantes que registró (17/11/2026)', () => {
    it('lista solo los suyos (con o sin empresas); los ajenos y los sin registered_by → el mismo 404', async () => {
      const auth = await as('db-ins1');
      const list = await request(t.http).get(`${API}/students`).set(auth);
      expect(list.status).toBe(200);
      expect(list.body.total).toBe(2);
      // db-st5 está en db-emp1 (empresa de db-ins1), pero nadie lo registró: no aparece.
      expect(ids(list)).toEqual(['db-st1', 'db-st2']); // ordenados por apellidos: Ibáñez, Zapata
      // Primero el token y después la petición (regla de las pruebas HTTP del proyecto).
      const ins2 = await as('db-ins2');
      const ins2List = await request(t.http).get(`${API}/students`).set(ins2);
      expect(ids(ins2List)).toEqual(['db-st3', 'db-st4']); // db-st4 no tiene empresas
      expect(ins2List.body.items.find((s: { id: string }) => s.id === 'db-st4').companies).toEqual([]);
      const admin = await as('db-admin');
      expect((await request(t.http).get(`${API}/students`).set(admin)).body.total).toBe(0);

      const missing = await request(t.http).get(`${API}/students/no-existe`).set(auth);
      for (const id of ['db-st3', 'db-st4', 'db-st5']) {
        const res = await request(t.http).get(`${API}/students/${id}`).set(auth);
        expect(res.status, id).toBe(404);
        expect(res.body).toEqual(missing.body);
      }
      expect((await request(t.http).get(`${API}/users/db-st3`).set(auth)).status).toBe(404); // misma regla en /users
    });

    it('compartir empresa no da visibilidad: db-ins2 con db-emp1 asignada sigue sin ver a db-st1', async () => {
      await prisma.instructorCompany.create({ data: { instructorId: 'db-ins2', companyId: 'db-emp1' } });
      const ins2 = await as('db-ins2');
      expect((await request(t.http).get(`${API}/students/db-st1`).set(ins2)).status).toBe(404);
      expect(ids(await request(t.http).get(`${API}/students?companyId=db-emp1`).set(ins2))).toEqual([]);
    });

    it('búsqueda en MySQL (DNI, y nombres sin distinguir mayúsculas ni tildes), filtro, paginación y 404 por empresa inexistente', async () => {
      const auth = await as('db-ins1');
      expect(ids(await request(t.http).get(`${API}/students?q=10000002`).set(auth))).toEqual(['db-st2']);
      // utf8mb4_unicode_ci: «ibanez» coincide con «Ibáñez».
      expect(ids(await request(t.http).get(`${API}/students?q=ibanez`).set(auth))).toEqual(['db-st1']);
      expect(ids(await request(t.http).get(`${API}/students?companyId=db-emp2`).set(auth))).toEqual(['db-st2']);
      // Opción A (20/11/2026): cualquier empresa registrada es elegible; solo una inexistente responde 404.
      expect((await request(t.http).get(`${API}/students?companyId=no-existe`).set(auth)).status).toBe(404);
      const page = await request(t.http).get(`${API}/students?page=2&pageSize=1`).set(auth);
      expect(page.body).toMatchObject({ total: 2, page: 2, pageSize: 1 });
      expect(ids(page)).toEqual(['db-st2']);
    });
  });

  describe('B2.3b: empresas de estudiantes', () => {
    it('asigna y retira con bitácora en la base; la última empresa no se retira (409)', async () => {
      const auth = await as('db-ins1');
      const assigned = await request(t.http).post(`${API}/students/db-st1/companies`).set(auth).send({ companyIds: ['db-emp2'] });
      expect(assigned.status).toBe(200);
      const link = await prisma.studentCompany.findUniqueOrThrow({
        where: { studentId_companyId: { studentId: 'db-st1', companyId: 'db-emp2' } },
      });
      expect(link.assignedById).toBe('db-ins1');

      expect((await request(t.http).delete(`${API}/students/db-st1/companies/db-emp2`).set(auth)).status).toBe(200);
      const last = await request(t.http).delete(`${API}/students/db-st1/companies/db-emp1`).set(auth);
      expect(last.status).toBe(409);
      expect(await prisma.studentCompany.count({ where: { studentId: 'db-st1' } })).toBe(1);
      const actions = (await prisma.auditLog.findMany({ where: { entity: 'student', entityId: 'db-st1' } })).map((a) => a.action).sort();
      expect(actions).toEqual(['STUDENT_COMPANY_ASSIGNED', 'STUDENT_COMPANY_REMOVED']);
    });

    it('empresa inactiva o estudiante inactivo → 409 sin cambios; se puede retirar de una empresa inactiva', async () => {
      const auth = await as('db-ins1');
      expect((await request(t.http).post(`${API}/students/db-st1/companies`).set(auth).send({ companyIds: ['db-emp4'] })).status).toBe(409);
      await prisma.user.update({ where: { id: 'db-st1' }, data: { active: false } });
      expect((await request(t.http).post(`${API}/students/db-st1/companies`).set(auth).send({ companyIds: ['db-emp2'] })).status).toBe(409);
      expect(await prisma.studentCompany.count({ where: { studentId: 'db-st1' } })).toBe(1);

      await prisma.studentCompany.create({ data: { studentId: 'db-st2', companyId: 'db-emp4' } }); // asociación previa
      expect((await request(t.http).delete(`${API}/students/db-st2/companies/db-emp4`).set(auth)).status).toBe(200);
    });

    it('concurrencia real: dos retiros simultáneos de las dos últimas empresas → uno 200 y otro 409; queda una', async () => {
      const auth = await as('db-ins1');
      const [a, b] = await Promise.all([
        request(t.http).delete(`${API}/students/db-st2/companies/db-emp1`).set(auth),
        request(t.http).delete(`${API}/students/db-st2/companies/db-emp2`).set(auth),
      ]);
      expect([a.status, b.status].sort((x, y) => x - y)).toEqual([200, 409]);
      expect(await prisma.studentCompany.count({ where: { studentId: 'db-st2' } })).toBe(1);
      expect(await prisma.auditLog.count({ where: { action: 'STUDENT_COMPANY_REMOVED', entityId: 'db-st2' } })).toBe(1);
    });

    it('retirar no borra al estudiante ni sus matrículas; quien lo registró lo sigue viendo', async () => {
      await prisma.course.create({ data: { id: 'db-curso', name: 'Curso de prueba' } });
      await prisma.enrollment.create({ data: { studentId: 'db-st2', courseId: 'db-curso' } });
      const ins1 = await as('db-ins1');
      expect((await request(t.http).delete(`${API}/students/db-st2/companies/db-emp2`).set(ins1)).body.stillVisible).toBe(true);
      const detail = await request(t.http).get(`${API}/students/db-st2`).set(ins1);
      expect(detail.status).toBe(200);
      expect(detail.body.companies.map((c: { id: string }) => c.id)).toEqual(['db-emp1']);
      expect((await prisma.student.findUniqueOrThrow({ where: { userId: 'db-st2' } })).registeredById).toBe('db-ins1');
      expect(await prisma.user.count({ where: { id: 'db-st2' } })).toBe(1);
      expect(await prisma.student.count({ where: { userId: 'db-st2' } })).toBe(1);
      expect(await prisma.enrollment.count({ where: { studentId: 'db-st2' } })).toBe(1);
    });
  });

  describe('B2.3c: registro y activación (correo simulado)', () => {
    const BODY = { firstNames: 'Paula', lastNames: 'Nueva Prueba', email: 'paula@prueba.test', dni: '10000009', companyIds: ['db-emp1', 'db-emp2'] };

    it('registro → pendiente en la base → activación → inicio de sesión normal', async () => {
      const auth = await as('db-ins1');
      const created = await request(t.http).post(`${API}/students`).set(auth).send(BODY);
      expect(created.status).toBe(201);
      expect(created.body.activation.emailDelivery).toBe('SENT'); // el proveedor SIMULADO aceptó el mensaje
      const id = created.body.student.id as string;
      const linkToken = mail.lastToken();
      expect(JSON.stringify(created.body)).not.toContain(linkToken);

      const user = await prisma.user.findUniqueOrThrow({ where: { id }, include: { student: true } });
      expect(user).toMatchObject({ role: 'STUDENT', activationPending: true, email: 'paula@prueba.test' });
      expect(user.student?.dni).toBe('10000009');
      expect(user.student?.registeredById).toBe('db-ins1'); // students.registered_by (17/11/2026)
      expect(await prisma.studentCompany.count({ where: { studentId: id } })).toBe(2);
      expect(await prisma.enrollment.count({ where: { studentId: id } })).toBe(0);
      const [tokenRow] = await prisma.accountActivationToken.findMany({ where: { userId: id } });
      expect(tokenRow.tokenHash).toBe(hashActivationToken(linkToken));

      expect((await request(t.http).post(`${API}/auth/login`).send({ email: 'paula@prueba.test', password: NEW_PASSWORD })).status).toBe(401);
      expect((await request(t.http).post(`${API}/auth/activate`).send({ token: linkToken, newPassword: NEW_PASSWORD })).status).toBe(204);

      const activated = await prisma.user.findUniqueOrThrow({ where: { id } });
      expect(activated.activationPending).toBe(false);
      expect(activated.passwordHash).toMatch(/^\$argon2id\$/);
      expect(await new PasswordService().verify(activated.passwordHash, NEW_PASSWORD)).toBe(true);
      expect((await prisma.accountActivationToken.findUniqueOrThrow({ where: { id: tokenRow.id } })).usedAt).toBeInstanceOf(Date);

      const login = await request(t.http).post(`${API}/auth/login`).send({ email: 'paula@prueba.test', password: NEW_PASSWORD });
      expect(login.status).toBe(200);
      const me = await request(t.http).get(`${API}/auth/me`).set({ Authorization: `Bearer ${login.body.accessToken}` });
      expect(me.body.student.companies.map((c: { id: string }) => c.id).sort()).toEqual(['db-emp1', 'db-emp2']);

      const reused = await request(t.http).post(`${API}/auth/activate`).send({ token: linkToken, newPassword: 'OtraClave2026' });
      expect(reused.status).toBe(400);
      expect(reused.body.message).toBe(INVALID_LINK);
      const stored = JSON.stringify(await prisma.auditLog.findMany());
      expect(stored).not.toContain(linkToken);
      expect(stored).not.toContain(NEW_PASSWORD);
      expect(stored).not.toContain('paula@prueba.test');
    });

    it('sin empresa (17/11/2026): un Instructor sin empresas registra; se guarda registered_by y solo él lo ve', async () => {
      const { companyIds: _none, ...noCompany } = BODY;
      const ins3 = await as('db-ins3');
      const created = await request(t.http).post(`${API}/students`).set(ins3).send(noCompany);
      expect(created.status).toBe(201);
      const id = created.body.student.id as string;
      expect(created.body.student.companies).toEqual([]);

      // Comprobación directa en MySQL.
      const row = await prisma.student.findUniqueOrThrow({ where: { userId: id } });
      expect(row).toMatchObject({ registeredById: 'db-ins3', dni: '10000009' });
      expect(await prisma.studentCompany.count({ where: { studentId: id } })).toBe(0);
      expect((await prisma.user.findUniqueOrThrow({ where: { id } })).activationPending).toBe(true);

      expect(ids(await request(t.http).get(`${API}/students`).set(ins3))).toEqual([id]);
      const ins1 = await as('db-ins1');
      expect((await request(t.http).get(`${API}/students/${id}`).set(ins1)).status).toBe(404);
      expect((await request(t.http).post(`${API}/students/${id}/activation-email`).set(ins1)).status).toBe(404);
      const admin = await as('db-admin');
      expect((await request(t.http).get(`${API}/students/${id}`).set(admin)).status).toBe(404);

      // Activación e inicio de sesión del estudiante sin empresa.
      expect((await request(t.http).post(`${API}/auth/activate`).send({ token: mail.lastToken(), newPassword: NEW_PASSWORD })).status).toBe(204);
      const login = await request(t.http).post(`${API}/auth/login`).send({ email: 'paula@prueba.test', password: NEW_PASSWORD });
      expect(login.status).toBe(200);
      expect(login.body.user.student).toEqual({ dni: '10000009', companies: [] });
    });

    it('clave foránea real: registered_by debe existir; si se elimina la cuenta del Instructor queda NULL (SET NULL)', async () => {
      await expect(
        prisma.student.update({ where: { userId: 'db-st5' }, data: { registeredBy: { connect: { id: 'no-existe' } } } }),
      ).rejects.toThrow();
      await createInstructor(prisma, 'db-ins9');
      await createStudent(prisma, 'db-st9', '10000099', [], { registeredBy: 'db-ins9' });
      await prisma.instructor.delete({ where: { userId: 'db-ins9' } });
      await prisma.user.delete({ where: { id: 'db-ins9' } });
      const orphan = await prisma.student.findUniqueOrThrow({ where: { userId: 'db-st9' } });
      expect(orphan.registeredById).toBeNull(); // el estudiante se conserva, sin quien lo registró
      expect(await prisma.user.count({ where: { id: 'db-st9' } })).toBe(1);
    });

    it('DNI o correo duplicados → 409 sin crear nada; dos registros simultáneos iguales → solo uno', async () => {
      const auth = await as('db-ins1');
      expect((await request(t.http).post(`${API}/students`).set(auth).send({ ...BODY, dni: '10000001' })).status).toBe(409);
      expect((await request(t.http).post(`${API}/students`).set(auth).send({ ...BODY, email: 'db-st1@prueba.test' })).status).toBe(409);
      expect(await prisma.user.count({ where: { email: 'paula@prueba.test' } })).toBe(0);

      const [a, b] = await Promise.all([
        request(t.http).post(`${API}/students`).set(auth).send(BODY),
        request(t.http).post(`${API}/students`).set(auth).send(BODY),
      ]);
      expect([a.status, b.status].sort((x, y) => x - y)).toEqual([201, 409]);
      expect(await prisma.user.count({ where: { email: 'paula@prueba.test' } })).toBe(1);
      expect(await prisma.student.count({ where: { dni: '10000009' } })).toBe(1);
    });

    it('empresa inexistente (404) o inactiva (409): nada creado', async () => {
      const auth = await as('db-ins1');
      expect((await request(t.http).post(`${API}/students`).set(auth).send({ ...BODY, companyIds: ['no-existe'] })).status).toBe(404);
      expect((await request(t.http).post(`${API}/students`).set(auth).send({ ...BODY, companyIds: ['db-emp4'] })).status).toBe(409);
      expect(await prisma.user.count({ where: { email: 'paula@prueba.test' } })).toBe(0);
      expect(await prisma.accountActivationToken.count()).toBe(0);
    });

    it('fallo del correo: cuenta pendiente; el reenvío anula el enlace anterior en la base', async () => {
      const auth = await as('db-ins1');
      mail.failNext = true;
      const created = await request(t.http).post(`${API}/students`).set(auth).send(BODY);
      expect(created.body.activation.emailDelivery).toBe('FAILED');
      const id = created.body.student.id as string;
      expect((await request(t.http).post(`${API}/students/${id}/activation-email`).set(auth)).body.activation.emailDelivery).toBe('SENT');
      const tokens = await prisma.accountActivationToken.findMany({ where: { userId: id } });
      expect(tokens).toHaveLength(2);
      expect(tokens.filter((tk) => tk.revokedAt === null)).toHaveLength(1);
      expect((await request(t.http).post(`${API}/auth/activate`).send({ token: mail.lastToken(), newPassword: NEW_PASSWORD })).status).toBe(204);
    });

    it('concurrencia real: dos activaciones simultáneas con el mismo token → solo una prospera', async () => {
      const auth = await as('db-ins1');
      expect((await request(t.http).post(`${API}/students`).set(auth).send(BODY)).status).toBe(201);
      const linkToken = mail.lastToken();
      const [a, b] = await Promise.all([
        request(t.http).post(`${API}/auth/activate`).send({ token: linkToken, newPassword: NEW_PASSWORD }),
        request(t.http).post(`${API}/auth/activate`).send({ token: linkToken, newPassword: 'OtraClave2026' }),
      ]);
      expect([a.status, b.status].sort((x, y) => x - y)).toEqual([204, 400]);
      expect(await prisma.auditLog.count({ where: { action: 'STUDENT_ACCOUNT_ACTIVATED' } })).toBe(1);
    });
  });
});

describe('MySQL: persistencia entre instancias', () => {
  let first: { prisma: PrismaClient; t: TestApp } | null = null;
  let second: { prisma: PrismaClient; t: TestApp } | null = null;

  afterEach(async () => {
    for (const instance of [first, second]) {
      if (instance) {
        await instance.t.close().catch(() => undefined);
        await instance.prisma.$disconnect().catch(() => undefined);
      }
    }
    first = second = null;
  });

  it('lo creado por una instancia (empresa, estudiante activado) lo recupera otra instancia nueva de la aplicación y de Prisma', async () => {
    const mail = new FakeMailSender();
    const prismaA = testPrisma();
    await emptyTestTables(prismaA);
    await createInstructor(prismaA, 'db-admin', { generalAdmin: true });
    await createInstructor(prismaA, 'db-ins1');
    first = {
      prisma: prismaA,
      t: await createTestApp(prismaA, { DATABASE_URL: testDatabaseUrl() }, { providers: [{ provide: MAIL_SENDER, useValue: mail }] }),
    };
    const tA = first.t;
    const adminAuth = { Authorization: `Bearer ${await bearer(tA, 'db-admin@prueba.test')}` };
    const company = await request(tA.http).post(`${API}/admin/companies`).set(adminAuth).send({ name: 'Empresa Persistente', ruc: 'PRUEBA-0005' });
    expect(company.status).toBe(201);
    const companyId = company.body.id as string;
    const insAuth = { Authorization: `Bearer ${await bearer(tA, 'db-ins1@prueba.test')}` };
    const student = await request(tA.http)
      .post(`${API}/students`)
      .set(insAuth)
      .send({ firstNames: 'Rita', lastNames: 'Persistente', email: 'rita@prueba.test', dni: '10000010', companyIds: [companyId] });
    expect(student.status).toBe(201);
    expect((await request(tA.http).post(`${API}/auth/activate`).send({ token: mail.lastToken(), newPassword: NEW_PASSWORD })).status).toBe(204);

    // Cierre completo de la primera instancia (aplicación y pool de conexiones).
    await first.t.close();
    await first.prisma.$disconnect();
    first = null;

    const prismaB = testPrisma();
    second = { prisma: prismaB, t: await createTestApp(prismaB, { DATABASE_URL: testDatabaseUrl() }) };
    const tB = second.t;
    expect(await prismaB.company.findUniqueOrThrow({ where: { id: companyId } })).toMatchObject({ name: 'Empresa Persistente', ruc: 'PRUEBA-0005' });
    const login = await request(tB.http).post(`${API}/auth/login`).send({ email: 'rita@prueba.test', password: NEW_PASSWORD });
    expect(login.status).toBe(200);
    const insAuthB = { Authorization: `Bearer ${await bearer(tB, 'db-ins1@prueba.test', FIXTURE_PASSWORD)}` };
    const list = await request(tB.http).get(`${API}/students?companyId=${companyId}`).set(insAuthB);
    expect(list.body.items.map((s: { email: string }) => s.email)).toEqual(['rita@prueba.test']);
  });
});
