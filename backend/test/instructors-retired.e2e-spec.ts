/**
 * Retiro de la gestión de instructores (23/11/2026): las rutas ya no existen, ni siquiera con el permiso de administración
 * general, y la cuenta administradora conserva su acceso, sus permisos y los módulos del panel.
 */
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDemo } from '../prisma/seed-data.js';
import { FakePrisma } from './support/fake-prisma.js';
import { CLIENT_HEADER, createTestApp, DEMO_PASSWORD, type TestApp } from './support/test-app.js';

const API = '/api/v1';
const ADMIN = 'admin@ejemplo.test';
const RETIRED: ['get' | 'post' | 'put' | 'delete', string, object?][] = [
  ['get', '/admin/instructors'],
  ['post', '/admin/instructors', { firstNames: 'Nuevo', lastNames: 'Instructor', email: 'nuevo@prueba.test' }],
  ['get', '/admin/instructors/a1'],
  ['post', '/admin/instructors/a1/activation-email'],
  ['put', '/admin/instructors/a1/companies', { companyIds: ['emp-demo'] }],
  ['delete', '/admin/instructors/a1/companies/emp-demo'],
  ['get', '/admin/companies/emp-demo/instructors'],
  ['post', '/admin/instructor-assignments', { instructorIds: ['a1'], companyIds: ['emp-demo'] }],
];

describe('Gestión de instructores retirada (HTTP, base simulada)', () => {
  let db: FakePrisma;
  let t: TestApp;
  const login = async (email: string) => {
    const res = await request(t.http).post(`${API}/auth/login`).set(CLIENT_HEADER).send({ email, password: DEMO_PASSWORD });
    expect(res.status).toBe(200);
    return { Authorization: `Bearer ${res.body.accessToken as string}`, ...CLIENT_HEADER };
  };

  beforeEach(async () => {
    db = new FakePrisma();
    await seedDemo(db as never, DEMO_PASSWORD);
    await db.instructorPermission.create({ data: { instructorId: 'a1', permission: 'IMC_GENERAL_ADMIN' } });
    t = await createTestApp(db);
  });
  afterEach(() => t.close());

  it.each(RETIRED)('%s %s ya no existe, aun con el permiso de administración general', async (method, path, body) => {
    const auth = await login(ADMIN);
    const before = { users: db.users.length, instructors: db.instructors.length, links: db.instructorCompanies.length, tokens: db.activationTokens.length };
    const req = request(t.http)[method](`${API}${path}`).set(auth);
    const res = await (body ? req.send(body) : req);
    expect(res.status).toBe(404);
    expect({ users: db.users.length, instructors: db.instructors.length, links: db.instructorCompanies.length, tokens: db.activationTokens.length }).toEqual(before);
  });

  it('la cuenta administradora conserva sesión, permiso y módulos del panel', async () => {
    const auth = await login(ADMIN);
    expect((await request(t.http).get(`${API}/me/permissions`).set(auth)).body).toEqual({ permissions: ['IMC_GENERAL_ADMIN'] });
    for (const path of ['/admin/companies', '/students', '/courses', '/certificates', '/dashboard', '/admin/certificate-imports']) {
      expect((await request(t.http).get(`${API}${path}`).set(auth)).status, path).toBe(200);
    }
    const company = await request(t.http).post(`${API}/admin/companies`).set(auth).send({ name: 'Empresa Conservada', ruc: '20111111111' });
    expect(company.status).toBe(201);
  });

  it('las operaciones administrativas siguen protegidas: sin permiso 403, alumno 403 y sin sesión 401', async () => {
    db.instructorPermissions.length = 0;
    const instructor = await login(ADMIN);
    expect((await request(t.http).get(`${API}/me/permissions`).set(instructor)).body).toEqual({ permissions: [] });
    expect((await request(t.http).get(`${API}/admin/companies`).set(instructor)).status).toBe(403);
    const student = await login('ana@ejemplo.test');
    expect((await request(t.http).get(`${API}/me/permissions`).set(student)).status).toBe(403);
    expect((await request(t.http).get(`${API}/admin/companies`).set(student)).status).toBe(403);
    expect((await request(t.http).get(`${API}/me/permissions`)).status).toBe(401);
  });
});
