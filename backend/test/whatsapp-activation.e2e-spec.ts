/**
 * Activación manual asistida por WhatsApp (23/11/2026), integración HTTP con la base simulada: enlace seguro de un solo
 * uso, anulación de los anteriores, mensaje sin datos personales ni contraseñas, aislamiento y estados reales.
 */
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDemo } from '../prisma/seed-data.js';
import { hashActivationToken } from '../src/modules/account-activation/account-activation.service.js';
import { FakePrisma } from './support/fake-prisma.js';
import { CLIENT_HEADER, createTestApp, DEMO_PASSWORD, type TestApp } from './support/test-app.js';

const API = '/api/v1';
const INSTRUCTOR = 'admin@ejemplo.test';
const OTHER = 'i2@prueba.test';
const NEW_PASSWORD = 'ClaveNueva123';

describe('Activación por WhatsApp (HTTP, base simulada)', () => {
  let db: FakePrisma;
  let t: TestApp;
  const tokens = new Map<string, string>();
  const bearer = async (email: string) => {
    if (!tokens.has(email)) {
      const res = await request(t.http).post(`${API}/auth/login`).set(CLIENT_HEADER).send({ email, password: DEMO_PASSWORD });
      tokens.set(email, res.body.accessToken as string);
    }
    return tokens.get(email)!;
  };
  const post = async (path: string, email = INSTRUCTOR, body?: object) => {
    const auth = await bearer(email);
    return request(t.http).post(`${API}${path}`).set('Authorization', `Bearer ${auth}`).set(CLIENT_HEADER).send(body);
  };
  const get = async (path: string, email = INSTRUCTOR) => {
    const auth = await bearer(email);
    return request(t.http).get(`${API}${path}`).set('Authorization', `Bearer ${auth}`);
  };
  const activate = (token: string, newPassword = NEW_PASSWORD) => request(t.http).post(`${API}/auth/activate`).set(CLIENT_HEADER).send({ token, newPassword });
  const tokenOf = (whatsappUrl: string) => /#token=([A-Za-z0-9_-]{43})/.exec(new URL(whatsappUrl).searchParams.get('text')!)![1];
  let id: string;

  const register = async (extra: object) => {
    const res = await post('/students', INSTRUCTOR, { firstNames: 'Marta', lastNames: 'Rojas Díaz', email: 'marta@prueba.test', dni: '44556677', ...extra });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body.student.id as string;
  };

  beforeEach(async () => {
    db = new FakePrisma();
    await seedDemo(db as never, DEMO_PASSWORD);
    const passwordHash = db.userByEmail(INSTRUCTOR).passwordHash;
    await db.user.create({ data: { id: 'i2', email: OTHER, role: 'INSTRUCTOR', firstNames: 'Otro', lastNames: 'Instructor', passwordHash } });
    await db.instructor.create({ data: { userId: 'i2' } });
    tokens.clear();
    t = await createTestApp(db);
    id = await register({ whatsapp: '987654321' });
  });
  afterEach(() => t.close());

  it('prepara el wa.me con prefijo de Perú, sin datos personales ni contraseña, y sin caché', async () => {
    const res = await post(`/students/${id}/activation-whatsapp`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.status).toBe('LINK_GENERATED');
    const url = new URL(res.body.whatsappUrl as string);
    expect(`${url.origin}${url.pathname}`).toBe('https://wa.me/51987654321');
    const text = url.searchParams.get('text')!;
    expect(text).toContain('https://aula.ejemplo.test/activar-cuenta#token=');
    for (const secret of ['Marta', 'Rojas', '44556677', 'marta@', 'contraseña:']) expect(text).not.toContain(secret);
    const token = tokenOf(res.body.whatsappUrl as string);
    expect(db.activationTokens.some((r) => r.tokenHash === hashActivationToken(token))).toBe(true);
    expect(JSON.stringify(db.activationTokens)).not.toContain(token);
    expect(JSON.stringify(db.auditLogs)).not.toContain(token);
    expect(db.actions()).toContain('ACTIVATION_WHATSAPP_LINK_GENERATED');
  });

  it('un número internacional no recibe prefijo y el dato guardado no cambia', async () => {
    await request(t.http).patch(`${API}/students/${id}/contact`).set('Authorization', `Bearer ${await bearer(INSTRUCTOR)}`).set(CLIENT_HEADER).send({ whatsapp: '+12025550100' });
    const res = await post(`/students/${id}/activation-whatsapp`);
    expect(new URL(res.body.whatsappUrl as string).pathname).toBe('/12025550100');
    expect(db.students.find((s) => s.userId === id)!.whatsapp).toBe('+12025550100');
  });

  it('flujo completo: un solo uso, anula el enlace anterior y permite iniciar sesión', async () => {
    const first = tokenOf((await post(`/students/${id}/activation-whatsapp`)).body.whatsappUrl as string);
    const second = tokenOf((await post(`/students/${id}/activation-whatsapp`)).body.whatsappUrl as string);
    expect(first).not.toBe(second);
    expect((await activate(first)).status).toBe(400);
    expect((await activate(second)).status).toBeLessThan(300);
    expect((await activate(second, 'OtraClave456')).status).toBe(400);
    const login = await request(t.http).post(`${API}/auth/login`).set(CLIENT_HEADER).send({ email: 'marta@prueba.test', password: NEW_PASSWORD });
    expect(login.status).toBeLessThan(300);
    expect(db.users.find((u) => u.id === id)!.activationPending).toBe(false);
    expect((await get(`/students/${id}/activation-status`)).body).toMatchObject({ activationPending: false, linkState: 'USADO' });
    expect((await post(`/students/${id}/activation-whatsapp`)).status).toBe(409); // ya activada
  });

  it('un enlace vencido no activa la cuenta y se informa como vencido', async () => {
    const token = tokenOf((await post(`/students/${id}/activation-whatsapp`)).body.whatsappUrl as string);
    db.activationTokens.find((r) => r.tokenHash === hashActivationToken(token))!.expiresAt = new Date(Date.now() - 1000);
    expect((await activate(token)).status).toBe(400);
    expect((await get(`/students/${id}/activation-status`)).body.linkState).toBe('VENCIDO');
    expect((await post(`/students/${id}/activation-whatsapp/opened`)).status).toBe(409);
  });

  it('registra solo los estados reales: generado y abierto, nunca enviado', async () => {
    expect((await get(`/students/${id}/activation-status`)).body.linkGeneratedAt).toBeNull();
    await post(`/students/${id}/activation-whatsapp`);
    expect((await get(`/students/${id}/activation-status`)).body).toMatchObject({ linkState: 'VIGENTE', whatsappOpenedAt: null });
    const opened = await post(`/students/${id}/activation-whatsapp/opened`);
    expect(opened.status).toBe(200);
    expect(opened.body.whatsappOpenedAt).toBeTruthy();
    expect(Object.keys(opened.body).join()).not.toMatch(/sent|deliver/i);
  });

  it('sin WhatsApp responde 409; un Instructor ajeno 404; un estudiante 403; sin sesión 401', async () => {
    db.students.find((s) => s.userId === id)!.whatsapp = null;
    expect((await post(`/students/${id}/activation-whatsapp`)).status).toBe(409);
    db.students.find((s) => s.userId === id)!.whatsapp = '987654321';
    expect((await post(`/students/${id}/activation-whatsapp`, OTHER)).status).toBe(404);
    expect((await get(`/students/${id}/activation-status`, OTHER)).status).toBe(404);
    expect((await post(`/students/${id}/activation-whatsapp`, 'ana@ejemplo.test')).status).toBe(403);
    expect((await request(t.http).post(`${API}/students/${id}/activation-whatsapp`).set(CLIENT_HEADER)).status).toBe(401);
  });
});
