/**
 * B2.3c (integración HTTP con la aplicación completa, la base simulada y un proveedor de correo SIMULADO; sin MySQL y
 * sin enviar correos reales): registro de estudiantes por el Instructor y activación de la cuenta por enlace.
 */
import { Logger } from '@nestjs/common';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedDemo } from '../prisma/seed-data.js';
import { MAIL_SENDER } from '../src/mail/mail-sender.js';
import { hashActivationToken } from '../src/modules/account-activation/account-activation.service.js';
import { FakeMailSender } from './support/fake-mail.js';
import { FakePrisma } from './support/fake-prisma.js';
import { createTestApp, DEMO_PASSWORD, type TestApp } from './support/test-app.js';

const API = '/api/v1';
// Valores de RUC ya usados en pruebas anteriores, y un marcador claramente no real.
const RUC_A = '20123456789';
const RUC_MARKER = 'ABC-1234567';
const INVALID_LINK = 'El enlace de activación no es válido o ya venció. Pide a tu instructor que te envíe uno nuevo.';
const NEW_PASSWORD = 'ClaveNueva2026';
const BODY = { firstNames: 'Paula', lastNames: 'Nueva Prueba', email: 'Paula@Prueba.test', dni: '20000001', companyIds: ['emp-demo'] };

/** a1 → emp-demo y emp-y; i2 → emp-x; i3 sin empresas; gadm: administrador general sin empresas. */
async function scenario(db: FakePrisma) {
  await seedDemo(db as never, DEMO_PASSWORD);
  const passwordHash = db.userByEmail('ana@ejemplo.test').passwordHash;
  await db.company.create({ data: { id: 'emp-x', name: 'Empresa X de prueba', ruc: RUC_A } });
  await db.company.create({ data: { id: 'emp-y', name: 'Empresa Y de prueba', ruc: RUC_MARKER } });
  for (const id of ['i2', 'i3', 'gadm']) {
    await db.user.create({ data: { id, email: `${id}@prueba.test`, role: 'INSTRUCTOR', firstNames: 'I', lastNames: id, passwordHash } });
    await db.instructor.create({ data: { userId: id } });
  }
  await db.instructorPermission.create({ data: { instructorId: 'gadm', permission: 'IMC_GENERAL_ADMIN' } });
  await db.instructorCompany.create({ data: { instructorId: 'i2', companyId: 'emp-x' } });
  await db.instructorCompany.create({ data: { instructorId: 'a1', companyId: 'emp-y' } });
  db.auditLogs = [];
}

describe('B2.3c: registro y activación (HTTP, base y correo simulados)', () => {
  let db: FakePrisma;
  let mail: FakeMailSender;
  let t: TestApp;
  const login = (email: string, password: string) => request(t.http).post(`${API}/auth/login`).send({ email, password });
  const token = async (email: string) => (await login(email, DEMO_PASSWORD)).body.accessToken as string;
  /** Primero el token y después la petición (supertest no admite dos peticiones abiertas a la vez). */
  const register = async (email: string | null, body: object) => {
    const bearer = email ? await token(email) : null;
    const req = request(t.http).post(`${API}/students`).send(body);
    return bearer ? req.set('Authorization', `Bearer ${bearer}`) : req;
  };
  const resend = async (email: string | null, id: string) => {
    const bearer = email ? await token(email) : null;
    const req = request(t.http).post(`${API}/students/${id}/activation-email`);
    return bearer ? req.set('Authorization', `Bearer ${bearer}`) : req;
  };
  const activate = (body: object) => request(t.http).post(`${API}/auth/activate`).send(body);

  beforeEach(async () => {
    db = new FakePrisma();
    await scenario(db);
    mail = new FakeMailSender();
    t = await createTestApp(db, {}, { providers: [{ provide: MAIL_SENDER, useValue: mail }] });
  });
  afterEach(() => t.close());

  describe('POST /students: acceso', () => {
    it('sin sesión → 401; rol STUDENT → 403', async () => {
      expect((await register(null, BODY)).status).toBe(401);
      expect((await register('ana@ejemplo.test', BODY)).status).toBe(403);
      expect((await resend(null, 'u1')).status).toBe(401);
      expect((await resend('ana@ejemplo.test', 'u1')).status).toBe(403);
      expect(db.users.some((u) => u.email === 'paula@prueba.test')).toBe(false);
    });
  });

  describe('flujo completo', () => {
    it('registro → no puede iniciar sesión → activa con el enlace → inicia sesión normalmente', async () => {
      const created = await register('admin@ejemplo.test', BODY);
      expect(created.status).toBe(201);
      expect(created.body.activation).toMatchObject({ status: 'PENDING', emailDelivery: 'SENT' });
      expect(created.body.student).toMatchObject({ email: 'paula@prueba.test', firstNames: 'Paula', dni: '20000001' });
      expect(created.body.student.companies.map((c: { id: string }) => c.id)).toEqual(['emp-demo']);
      const linkToken = mail.lastToken();
      expect(JSON.stringify(created.body)).not.toContain(linkToken);
      expect(db.enrollments).toHaveLength(0);

      // Antes de activar: mismo 401 que una contraseña incorrecta (no revela el estado de la cuenta).
      const before = await login('paula@prueba.test', NEW_PASSWORD);
      expect(before.status).toBe(401);
      expect(before.body.message).toBe((await login('ana@ejemplo.test', 'incorrecta-123')).body.message);

      const weak = await activate({ token: linkToken, newPassword: 'corta1' });
      expect(weak.status).toBe(400);
      expect(weak.body.message).toEqual(expect.arrayContaining(['La nueva contraseña debe tener al menos 8 caracteres.']));
      expect((await activate({ token: linkToken, newPassword: 'sololetras' })).body.message).toEqual(
        expect.arrayContaining(['La nueva contraseña debe incluir al menos un número.']),
      );

      const ok = await activate({ token: linkToken, newPassword: NEW_PASSWORD });
      expect(ok.status).toBe(204);
      expect(ok.text).toBe('');

      const after = await login('paula@prueba.test', NEW_PASSWORD);
      expect(after.status).toBe(200);
      expect(after.body.user).toMatchObject({ role: 'STUDENT', mustChangePassword: false });
      const me = await request(t.http).get(`${API}/auth/me`).set('Authorization', `Bearer ${after.body.accessToken}`);
      expect(me.status).toBe(200);

      // El enlace ya no sirve.
      const reused = await activate({ token: linkToken, newPassword: 'OtraClave2026' });
      expect(reused.status).toBe(400);
      expect(reused.body.message).toBe(INVALID_LINK);

      // Ni el token ni la contraseña aparecen en la base (salvo como hash) ni en la bitácora.
      const stored = JSON.stringify([db.activationTokens, db.auditLogs, db.users]);
      expect(stored).not.toContain(linkToken);
      expect(stored).not.toContain(NEW_PASSWORD);
      expect(db.activationTokens[0].tokenHash).toBe(hashActivationToken(linkToken));
      expect(JSON.stringify(db.auditLogs)).not.toMatch(/paula@prueba|20000001/);
    });

    it('token alterado, inexistente o vencido → el mismo 400; campos extra → 400', async () => {
      await register('admin@ejemplo.test', BODY);
      const linkToken = mail.lastToken();
      const tampered = `${linkToken.slice(0, -1)}${linkToken.endsWith('A') ? 'B' : 'A'}`;
      for (const value of [tampered, 'A'.repeat(43), 'x']) {
        const res = await activate({ token: value, newPassword: NEW_PASSWORD });
        expect(res.status).toBe(400);
        expect(res.body.message).toBe(INVALID_LINK);
      }
      db.activationTokens[0].expiresAt = new Date(Date.now() - 1_000);
      const expired = await activate({ token: linkToken, newPassword: NEW_PASSWORD });
      expect(expired.status).toBe(400);
      expect(expired.body.message).toBe(INVALID_LINK);
      const extra = await activate({ token: linkToken, newPassword: NEW_PASSWORD, userId: 'u1' });
      expect(extra.status).toBe(400);
      expect(extra.body.message).toEqual(expect.arrayContaining(['El campo «userId» no está permitido.']));
      expect(db.userByEmail('paula@prueba.test').activationPending).toBe(true);
    });

    it('fallo del proveedor de correo: 201 con FAILED, cuenta pendiente; el reenvío emite un enlace nuevo y anula el anterior', async () => {
      mail.failNext = true;
      const created = await register('admin@ejemplo.test', BODY);
      expect(created.status).toBe(201);
      expect(created.body.activation.emailDelivery).toBe('FAILED');
      expect(mail.sent).toHaveLength(0);
      const id = created.body.student.id as string;

      const resent = await resend('admin@ejemplo.test', id);
      expect(resent.status).toBe(200);
      expect(resent.body.activation.emailDelivery).toBe('SENT');
      expect(JSON.stringify(resent.body)).not.toContain(mail.lastToken());
      expect(db.activationTokens.filter((tk) => tk.revokedAt === null)).toHaveLength(1);

      expect((await activate({ token: mail.lastToken(), newPassword: NEW_PASSWORD })).status).toBe(204);
      const again = await resend('admin@ejemplo.test', id);
      expect(again.status).toBe(409);
      expect(again.body.message).toBe('La cuenta del estudiante ya está activada.');
      expect((await resend('i2@prueba.test', id)).status).toBe(404); // fuera del alcance de i2
    });
  });

  describe('proveedor de correo de la aplicación (sin proveedor real)', () => {
    it('responde NOT_CONFIGURED y la cuenta queda pendiente: nunca se da por enviado', async () => {
      // Misma base, pero con el proveedor de la aplicación (UnconfiguredMailSender) en lugar del simulado.
      await t.close();
      t = await createTestApp(db);
      const created = await register('admin@ejemplo.test', BODY);
      expect(created.status).toBe(201);
      expect(created.body.activation.emailDelivery).toBe('NOT_CONFIGURED');
      expect(db.auditLogs.some((a) => a.action === 'ACTIVATION_EMAIL_FAILED' && (a.data as { reason: string }).reason === 'NOT_CONFIGURED')).toBe(true);
    });
  });

  describe('validación y reglas', () => {
    const bad = async (body: object, message: string) => {
      const res = await register('admin@ejemplo.test', body);
      expect(res.status).toBe(400);
      expect(res.body.message).toEqual(expect.arrayContaining([message]));
    };

    it('datos obligatorios y formatos (mensajes del frontend); sin contraseña ni identidad del cliente', async () => {
      await bad({ ...BODY, firstNames: ' ' }, 'Ingresa nombres y apellidos.');
      await bad({ ...BODY, lastNames: undefined }, 'Ingresa nombres y apellidos.');
      await bad({ ...BODY, email: 'no-es-correo' }, 'Ingresa un correo electrónico válido.');
      await bad({ ...BODY, dni: '1234567' }, 'El DNI debe tener 8 dígitos.');
      await bad({ ...BODY, dni: '1234567a' }, 'El DNI debe tener 8 dígitos.');
      // Las empresas son opcionales desde el 17/11/2026, pero si se envían deben ser una lista de identificadores.
      await bad({ ...BODY, companyIds: 'emp-demo' }, 'Las empresas indicadas no son válidas.');
      await bad({ ...BODY, companyIds: [''] }, 'Un identificador de empresa no es válido.');
      await bad({ ...BODY, registeredById: 'i2' }, 'El campo «registeredById» no está permitido.');
      await bad({ ...BODY, password: 'Clave2026' }, 'El campo «password» no está permitido.');
      await bad({ ...BODY, instructorId: 'i2' }, 'El campo «instructorId» no está permitido.');
      await bad({ ...BODY, role: 'INSTRUCTOR' }, 'El campo «role» no está permitido.');
      await bad({ ...BODY, activationPending: false }, 'El campo «activationPending» no está permitido.');
      expect(db.users.some((u) => u.email === 'paula@prueba.test')).toBe(false);
    });

    it('empresa inexistente → 404; inactiva → 409; nada se crea', async () => {
      expect((await register('admin@ejemplo.test', { ...BODY, companyIds: ['emp-demo', 'no-existe'] })).status).toBe(404);
      db.companies.find((c) => c.id === 'emp-y')!.active = false;
      const inactive = await register('admin@ejemplo.test', { ...BODY, companyIds: ['emp-y'] });
      expect(inactive.status).toBe(409);
      expect(inactive.body.message).toBe('La empresa «Empresa Y de prueba» está desactivada y no admite nuevas asignaciones.');
      expect(db.users.some((u) => u.email === 'paula@prueba.test')).toBe(false);
    });

    it('opción A (20/11/2026): un Instructor sin empresas asignadas registra con cualquier empresa activa; sigue aislado', async () => {
      const created = await register('i3@prueba.test', { ...BODY, companyIds: ['emp-demo', 'emp-x'] });
      expect(created.status).toBe(201);
      expect(created.body.student.companies.map((c: { id: string }) => c.id)).toEqual(['emp-demo', 'emp-x']);
      const id = created.body.student.id as string;
      expect(db.students.find((st) => st.userId === id)!.registeredById).toBe('i3');
      // a1 (que sí tiene emp-demo) no ve al participante que registró i3.
      const bearer = (await login('admin@ejemplo.test', DEMO_PASSWORD)).body.accessToken as string;
      expect((await request(t.http).get(`${API}/students/${id}`).set('Authorization', `Bearer ${bearer}`)).status).toBe(404);
      // La administración general (sin empresas) también registra; sin empresa sigue siendo válido.
      const plain = await register('gadm@prueba.test', { ...BODY, email: 'otra@prueba.test', dni: '20000002', companyIds: [] });
      expect(plain.status).toBe(201);
      expect(plain.body.student.companies).toEqual([]);
    });

    it('correo o DNI duplicados → 409 con los mensajes del frontend; varias empresas válidas', async () => {
      const dupEmail = await register('admin@ejemplo.test', { ...BODY, email: 'ana@ejemplo.test' });
      expect(dupEmail.status).toBe(409);
      expect(dupEmail.body.message).toBe('Ya existe un usuario con ese correo electrónico.');
      const dupDni = await register('admin@ejemplo.test', { ...BODY, dni: '00000001' });
      expect(dupDni.status).toBe(409);
      expect(dupDni.body.message).toBe('Ya existe un participante con ese DNI.');
      const many = await register('admin@ejemplo.test', { ...BODY, companyIds: ['emp-demo', 'emp-y'] });
      expect(many.status).toBe(201);
      expect(many.body.student.companies.map((c: { id: string }) => c.id)).toEqual(['emp-demo', 'emp-y']);
    });
  });

  describe('regresión', () => {
    it('el estudiante registrado aparece en GET /students; los datos de B2.3a y B2.3b siguen igual', async () => {
      const created = await register('admin@ejemplo.test', BODY);
      const bearer = await token('admin@ejemplo.test');
      const list = await request(t.http).get(`${API}/students?q=Paula`).set('Authorization', `Bearer ${bearer}`);
      expect(list.body.items.map((s: { id: string }) => s.id)).toEqual([created.body.student.id]);
      expect(Object.keys(list.body.items[0]).sort()).toEqual(['activationPending', 'active', 'companies', 'dni', 'email', 'firstNames', 'fullName', 'id', 'lastNames', 'whatsapp']);
      // Los estudiantes de la semilla no tienen registered_by (no se asignan a nadie): a1 solo ve al que registró.
      expect((await request(t.http).get(`${API}/students`).set('Authorization', `Bearer ${bearer}`)).body.total).toBe(1);
      expect(db.students.filter((s) => ['u1', 'u2', 'u3', 'u4', 'u5', 'u6'].includes(String(s.userId))).every((s) => s.registeredById == null)).toBe(true);
      expect((await login('ana@ejemplo.test', DEMO_PASSWORD)).status).toBe(200); // cuentas existentes sin cambios
    });
  });

  describe('registro sin empresa y aislamiento entre instructores (17/11/2026)', () => {
    const list = async (email: string) => {
      const bearer = await token(email);
      return request(t.http).get(`${API}/students`).set('Authorization', `Bearer ${bearer}`);
    };
    const detail = async (email: string, id: string) => {
      const bearer = await token(email);
      return request(t.http).get(`${API}/students/${id}`).set('Authorization', `Bearer ${bearer}`);
    };

    it('un Instructor SIN empresas registra a un estudiante sin empresa; queda guardado quién lo registró', async () => {
      const { companyIds: _none, ...noCompany } = BODY;
      const res = await register('i3@prueba.test', noCompany);
      expect(res.status).toBe(201);
      expect(res.body.student).toMatchObject({ email: 'paula@prueba.test', companies: [] });
      expect(res.body.activation).toMatchObject({ status: 'PENDING', emailDelivery: 'SENT' });
      const id = res.body.student.id as string;
      expect(db.students.find((s) => s.userId === id)).toMatchObject({ registeredById: 'i3', dni: '20000001' });
      expect(db.studentCompanies.filter((l) => l.studentId === id)).toEqual([]);
      expect((await register('i3@prueba.test', { ...noCompany, email: 'otra@prueba.test', dni: '20000002', companyIds: [] })).status).toBe(201);
    });

    it('cada Instructor ve solo a los que registró; los demás reciben el mismo 404 que un inexistente', async () => {
      const mine = (await register('i3@prueba.test', { ...BODY, companyIds: [] })).body.student.id as string;
      const theirs = (await register('i2@prueba.test', { ...BODY, email: 'b@prueba.test', dni: '20000002', companyIds: ['emp-x'] })).body.student
        .id as string;
      expect((await list('i3@prueba.test')).body.items.map((s: { id: string }) => s.id)).toEqual([mine]);
      expect((await list('i2@prueba.test')).body.items.map((s: { id: string }) => s.id)).toEqual([theirs]);
      expect((await list('admin@ejemplo.test')).body.total).toBe(0);

      const foreign = await detail('i2@prueba.test', mine);
      const missing = await detail('i2@prueba.test', 'no-existe');
      expect(foreign.status).toBe(404);
      expect(foreign.body).toEqual(missing.body);
      expect((await resend('i2@prueba.test', mine)).status).toBe(404);
      const bearer = await token('i2@prueba.test');
      expect((await request(t.http).get(`${API}/users/${mine}`).set('Authorization', `Bearer ${bearer}`)).status).toBe(404);
      // El administrador general tampoco ve a los estudiantes que no registró.
      expect((await detail('gadm@prueba.test', mine)).status).toBe(404);
    });

    it('registro sin empresa → activación con el enlace → inicio de sesión del estudiante', async () => {
      const created = await register('i3@prueba.test', { ...BODY, companyIds: [] });
      expect((await login('paula@prueba.test', 'ClaveNueva2026')).status).toBe(401); // pendiente
      expect((await activate({ token: mail.lastToken(), newPassword: 'ClaveNueva2026' })).status).toBe(204);
      const session = await login('paula@prueba.test', 'ClaveNueva2026');
      expect(session.status).toBe(200);
      expect(session.body.user).toMatchObject({ id: created.body.student.id, role: 'STUDENT', student: { dni: '20000001', companies: [] } });
    });
  });
});

describe('B2.3c: MAIL_DEV_CONSOLE (solo desarrollo local)', () => {
  let db: FakePrisma;
  let t: TestApp;
  afterEach(() => t.close());

  it('responde DEV_CONSOLE (nunca «enviado») y el enlace de la consola activa la cuenta', async () => {
    db = new FakePrisma();
    await scenario(db);
    const consoleLines: string[] = [];
    vi.spyOn(Logger.prototype, 'warn').mockImplementation((message: unknown) => void consoleLines.push(String(message)));
    t = await createTestApp(db, { NODE_ENV: 'development', MAIL_DEV_CONSOLE: 'true', ACTIVATION_URL: 'http://localhost:4200/activar-cuenta' });
    const bearer = (await request(t.http).post(`${API}/auth/login`).send({ email: 'i3@prueba.test', password: DEMO_PASSWORD })).body
      .accessToken as string;
    const res = await request(t.http)
      .post(`${API}/students`)
      .set('Authorization', `Bearer ${bearer}`)
      .send({ ...BODY, companyIds: [] });
    expect(res.status).toBe(201);
    expect(res.body.activation.emailDelivery).toBe('DEV_CONSOLE');
    expect(JSON.stringify(res.body)).not.toContain('#token=');

    const line = consoleLines.find((l) => l.includes('#token='))!;
    expect(line).toContain('NO se envió ningún correo');
    const token = /#token=([A-Za-z0-9_-]{43})/.exec(line)![1];
    expect((await request(t.http).post(`${API}/auth/activate`).send({ token, newPassword: 'ClaveNueva2026' })).status).toBe(204);
    expect((await request(t.http).post(`${API}/auth/login`).send({ email: 'paula@prueba.test', password: 'ClaveNueva2026' })).status).toBe(200);
    expect(db.auditLogs.map((a) => a.action)).toContain('ACTIVATION_LINK_DEV_CONSOLE');
    vi.restoreAllMocks();
  });
});
