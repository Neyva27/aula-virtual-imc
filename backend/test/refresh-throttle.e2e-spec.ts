/**
 * Límite de renovación por sesión (23/11/2026), HTTP con base simulada: alumnos en una misma IP no se bloquean entre sí, y
 * el inicio de sesión, la rotación, la detección de reutilización y los demás límites no se debilitan.
 */
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDemo } from '../prisma/seed-data.js';
import { FakePrisma } from './support/fake-prisma.js';
import { CLIENT_HEADER, createTestApp, DEMO_PASSWORD, refreshCookieOf, type TestApp } from './support/test-app.js';

const API = '/api/v1';
const COOKIE = 'imc_refresh';

describe('Renovación de sesión por sesión (HTTP, base simulada)', () => {
  let db: FakePrisma;
  let t: TestApp | null = null;
  const students = () => db.users.filter((u) => u.role === 'STUDENT' && !u.activationPending).map((u) => u.email as string);
  const login = async (email: string) => {
    const res = await request(t!.http).post(`${API}/auth/login`).set(CLIENT_HEADER).send({ email, password: DEMO_PASSWORD });
    expect(res.status, email).toBe(200);
    return refreshCookieOf(res)!.value;
  };
  const refresh = (token?: string) => {
    const r = request(t!.http).post(`${API}/auth/refresh`).set(CLIENT_HEADER);
    return token ? r.set('Cookie', `${COOKIE}=${token}`) : r;
  };
  /** Renueva y devuelve el token nuevo. */
  const rotate = async (token: string) => {
    const res = await refresh(token);
    expect(res.status).toBe(200);
    return refreshCookieOf(res)!.value;
  };

  beforeEach(async () => {
    db = new FakePrisma();
    await seedDemo(db as never, DEMO_PASSWORD);
  });
  afterEach(async () => {
    await t?.close();
    t = null;
  });

  it('varios alumnos de una misma IP superan juntos el límite de login sin bloquearse', async () => {
    t = await createTestApp(db, { AUTH_THROTTLE_LIMIT: '4', REFRESH_SESSION_LIMIT: '3', REFRESH_IP_LIMIT: '100' });
    const emails = students().slice(0, 3);
    expect(emails).toHaveLength(3);
    const tokens = await Promise.all(emails.map(login));
    for (let round = 0; round < 3; round++) {
      for (let i = 0; i < tokens.length; i++) tokens[i] = await rotate(tokens[i]);
    }
  });

  it('una sesión que abusa recibe 429, conserva su token y no afecta a otra sesión', async () => {
    t = await createTestApp(db, { AUTH_THROTTLE_LIMIT: '5', REFRESH_SESSION_LIMIT: '2', REFRESH_IP_LIMIT: '100' });
    const [first, second] = students();
    let abuser = await login(first);
    const other = await login(second);
    abuser = await rotate(abuser);
    abuser = await rotate(abuser);
    const blocked = await refresh(abuser);
    expect(blocked.status).toBe(429);
    expect(blocked.headers['retry-after']).toBeTruthy();
    expect(refreshCookieOf(blocked)).toBeNull(); // no borra la cookie: la sesión sigue siendo válida
    expect(db.refreshTokens.filter((r) => r.revokedReason === 'REUSE_DETECTED')).toHaveLength(0);
    await rotate(other);
  });

  it('tokens falsos y solicitudes sin cookie usan el límite estricto, sin bloquear sesiones válidas', async () => {
    t = await createTestApp(db, { AUTH_THROTTLE_LIMIT: '3', REFRESH_SESSION_LIMIT: '5', REFRESH_IP_LIMIT: '100' });
    const valid = await login(students()[0]);
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) statuses.push((await refresh(i % 2 ? undefined : `falso-${i}`)).status);
    expect(statuses).toEqual([401, 401, 401, 429]);
    await rotate(valid);
  });

  it('conserva un techo por IP para sesiones válidas', async () => {
    t = await createTestApp(db, { AUTH_THROTTLE_LIMIT: '5', REFRESH_SESSION_LIMIT: '100', REFRESH_IP_LIMIT: '2' });
    let token = await login(students()[0]);
    token = await rotate(token);
    token = await rotate(token);
    expect((await refresh(token)).status).toBe(429);
  });

  it('el inicio de sesión sigue estricto y las renovaciones no consumen su límite', async () => {
    t = await createTestApp(db, { AUTH_THROTTLE_LIMIT: '2', REFRESH_SESSION_LIMIT: '20', REFRESH_IP_LIMIT: '100' });
    const email = students()[0];
    let token = await login(email);
    for (let i = 0; i < 4; i++) token = await rotate(token);
    const statuses: number[] = [];
    for (let i = 0; i < 2; i++) statuses.push((await request(t.http).post(`${API}/auth/login`).set(CLIENT_HEADER).send({ email, password: 'incorrecta1' })).status);
    expect(statuses).toEqual([401, 429]);
  });

  it('la rotación y la detección de reutilización siguen activas', async () => {
    t = await createTestApp(db, { AUTH_THROTTLE_LIMIT: '10', REFRESH_SESSION_LIMIT: '10', REFRESH_IP_LIMIT: '100' });
    const first = await login(students()[0]);
    const second = await rotate(first);
    expect(second).not.toBe(first);
    expect((await refresh(first)).status).toBe(401); // token ya rotado
    expect((await refresh(second)).status).toBe(401); // la familia quedó revocada
    expect(db.actions()).toContain('REFRESH_REUSE_DETECTED');
  });

  it('el límite general de los demás endpoints no cambia', async () => {
    t = await createTestApp(db, { THROTTLE_LIMIT: '2', AUTH_THROTTLE_LIMIT: '100', REFRESH_SESSION_LIMIT: '100', REFRESH_IP_LIMIT: '100' });
    const statuses: number[] = [];
    for (let i = 0; i < 3; i++) statuses.push((await request(t.http).get(`${API}/public/certificates/dni/123`)).status);
    expect(statuses).toEqual([200, 200, 429]);
  });

  it('la configuración rechaza límites de renovación inválidos', async () => {
    await expect(createTestApp(db, { REFRESH_SESSION_LIMIT: '0' })).rejects.toThrow(/REFRESH_SESSION_LIMIT/);
  });
});
