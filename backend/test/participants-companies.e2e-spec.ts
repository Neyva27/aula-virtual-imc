/**
 * Participantes con empresa por razón social y RUC (20/11/2026), integración HTTP con la base y el correo simulados:
 * empresa nueva, empresa existente (por RUC), sin empresa, empresa desactivada, razón social con otro RUC, búsqueda
 * avanzada desde el listado y aislamiento entre Instructores.
 */
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDemo } from '../prisma/seed-data.js';
import { MAIL_SENDER } from '../src/mail/mail-sender.js';
import { FakeMailSender } from './support/fake-mail.js';
import { FakePrisma } from './support/fake-prisma.js';
import { createTestApp, DEMO_PASSWORD, type TestApp } from './support/test-app.js';

const API = '/api/v1';
const GLORIA = { name: 'Gloria S.A.', ruc: '20100190797' };
const person = (n: number, extra: object = {}) => ({
  firstNames: n === 1 ? 'Juan' : `Persona${n}`,
  lastNames: n === 1 ? 'Pérez Prueba' : 'Apellido Prueba',
  email: `p${n}@prueba.test`,
  dni: `3000000${n}`,
  ...extra,
});

describe('Participantes con empresa por RUC (HTTP, base simulada)', () => {
  let db: FakePrisma;
  let t: TestApp;
  const tokens = new Map<string, string>();
  const bearer = async (email: string) => {
    if (!tokens.has(email)) {
      tokens.set(email, (await request(t.http).post(`${API}/auth/login`).send({ email, password: DEMO_PASSWORD })).body.accessToken as string);
    }
    return tokens.get(email)!;
  };
  const register = async (body: object, email = 'admin@ejemplo.test') => {
    const b = await bearer(email);
    return request(t.http).post(`${API}/students`).set('Authorization', `Bearer ${b}`).send(body);
  };
  const get = async (path: string, email = 'admin@ejemplo.test') => {
    const b = await bearer(email);
    return request(t.http).get(`${API}${path}`).set('Authorization', `Bearer ${b}`);
  };
  const companiesByRuc = (ruc: string) => db.companies.filter((c) => c.ruc === ruc);

  beforeEach(async () => {
    db = new FakePrisma();
    await seedDemo(db as never, DEMO_PASSWORD);
    const passwordHash = db.userByEmail('ana@ejemplo.test').passwordHash;
    await db.user.create({ data: { id: 'i2', email: 'i2@prueba.test', role: 'INSTRUCTOR', firstNames: 'Otro', lastNames: 'Instructor', passwordHash } });
    await db.instructor.create({ data: { userId: 'i2' } });
    db.auditLogs = [];
    tokens.clear();
    t = await createTestApp(db, {}, { providers: [{ provide: MAIL_SENDER, useValue: new FakeMailSender() }] });
  });
  afterEach(() => t.close());

  it('empresa nueva: se registra en la base, se asocia al participante y se ve en el listado y el detalle', async () => {
    const res = await register(person(1, { company: { name: '  Gloria   S.A. ', ruc: ' 20100190797 ' } }));
    expect(res.status, res.body.message).toBe(201);
    expect(res.body.companyOutcome).toBe('CREATED');
    expect(res.body.student.companies).toEqual([{ id: expect.any(String), name: 'Gloria S.A.', ruc: '20100190797', active: true }]);
    expect(companiesByRuc(GLORIA.ruc)).toHaveLength(1);
    expect(db.auditLogs.find((l) => l.action === 'COMPANY_CREATED')).toMatchObject({ actorId: 'a1', entity: 'company' });
    // «Recargar»: el listado y el detalle leen la empresa guardada.
    const list = await get('/students?q=Juan');
    expect(list.body.items[0]).toMatchObject({ fullName: 'Juan Pérez Prueba', dni: '30000001', email: 'p1@prueba.test' });
    expect(list.body.items[0].companies[0]).toMatchObject(GLORIA);
    expect((await get(`/students/${res.body.student.id}`)).body.companies[0]).toMatchObject(GLORIA);
  });

  it('empresa existente por RUC: se reutiliza sin duplicarla (también si la escribe otro Instructor)', async () => {
    const first = await register(person(1, { company: GLORIA }));
    const second = await register(person(2, { company: { name: 'GLORIA (otro nombre)', ruc: GLORIA.ruc } }));
    expect(second.status, second.body.message).toBe(201);
    expect(second.body.companyOutcome).toBe('REUSED');
    expect(second.body.student.companies[0]).toMatchObject(GLORIA); // conserva la razón social registrada
    const third = await register(person(3, { company: GLORIA }), 'i2@prueba.test');
    expect(third.body.companyOutcome).toBe('REUSED');
    expect(companiesByRuc(GLORIA.ruc)).toHaveLength(1);
    expect(first.body.student.companies[0].id).toBe(third.body.student.companies[0].id);
    // Elegida en el buscador y escrita a la vez: una sola asociación.
    const both = await register(person(4, { company: GLORIA, companyIds: [first.body.student.companies[0].id] }));
    expect(both.body.student.companies).toHaveLength(1);
  });

  it('sin empresa sigue siendo válido', async () => {
    const res = await register(person(5));
    expect(res.status).toBe(201);
    expect(res.body.student.companies).toEqual([]);
    expect(res.body.companyOutcome).toBeUndefined();
  });

  it('empresa desactivada con ese RUC → 409: no se duplica, no se reactiva y no se crea el participante', async () => {
    await db.company.create({ data: { id: 'emp-off', name: 'Inactiva S.A.C.', ruc: '20999999991', active: false } });
    const res = await register(person(6, { company: { name: 'Otra razón', ruc: '20999999991' } }));
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('La empresa con RUC 20999999991 («Inactiva S.A.C.») está desactivada: no admite participantes nuevos y no se reactiva automáticamente.');
    expect(companiesByRuc('20999999991')).toEqual([expect.objectContaining({ active: false })]);
    expect(db.users.some((u) => u.email === 'p6@prueba.test')).toBe(false);
  });

  it('razón social ya registrada con otro RUC → 409; si el registro falla, la empresa nueva no queda creada', async () => {
    await register(person(1, { company: GLORIA }));
    const clash = await register(person(7, { company: { name: 'Gloria S.A.', ruc: '20100190798' } }));
    expect(clash.status).toBe(409);
    expect(clash.body.message).toContain('Ya existe una empresa con esa razón social y otro RUC');
    // DNI repetido: la transacción no deja la empresa nueva.
    const dup = await register(person(8, { dni: '30000001', company: { name: 'Nueva Empresa S.A.', ruc: '20555555551' } }));
    expect(dup.status).toBe(409);
    expect(companiesByRuc('20555555551')).toHaveLength(0);
  });

  it('valida la razón social y el RUC de 11 dígitos', async () => {
    const bad = async (company: object) => (await register(person(9, { company }))).body.message;
    expect(await bad({ name: 'Gloria', ruc: '2010019079' })).toEqual(['El RUC debe tener 11 dígitos.']);
    expect(await bad({ name: 'Gloria', ruc: '2010019079A' })).toEqual(['El RUC debe tener 11 dígitos.']);
    expect(await bad({ name: ' ', ruc: '20100190797' })).toEqual(['Ingresa la razón social de la empresa.']);
    expect(await bad({ name: 'Gloria', ruc: '20100190797', extra: 1 })).toEqual(['El campo «company.extra» no está permitido.']);
    expect(db.users.some((u) => u.email === 'p9@prueba.test')).toBe(false);
  });

  it('búsqueda desde el listado: nombre completo, DNI, correo, razón social y RUC; solo entre sus participantes', async () => {
    await register(person(1, { company: GLORIA }));
    await register(person(2));
    await register(person(3, { company: GLORIA }), 'i2@prueba.test'); // de otro Instructor
    const names = async (q: string, email?: string) =>
      (await get(`/students?q=${encodeURIComponent(q)}`, email)).body.items.map((s: { fullName: string }) => s.fullName);
    expect(await names('juan perez')).toEqual(['Juan Pérez Prueba']);
    expect(await names('30000001')).toEqual(['Juan Pérez Prueba']);
    expect(await names('p1@prueba')).toEqual(['Juan Pérez Prueba']);
    expect(await names('gloria')).toEqual(['Juan Pérez Prueba']); // Persona3 es de i2
    expect(await names('20100190797')).toEqual(['Juan Pérez Prueba']);
    expect(await names('20100190797', 'i2@prueba.test')).toEqual(['Persona3 Apellido Prueba']);
    expect(await names('zzz')).toEqual([]);
  });
});
