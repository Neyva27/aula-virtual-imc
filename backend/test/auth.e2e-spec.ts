/**
 * Integración HTTP de B1.1 sobre la aplicación completa (guards, pipes, filtros, cookies, límites),
 * con la base simulada en memoria. Las mismas reglas contra MySQL real están en test/db/.
 */
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDemo } from '../prisma/seed-data.js';
import { FakePrisma } from './support/fake-prisma.js';
import { CLIENT_HEADER, createTestApp, DEMO_PASSWORD, refreshCookieOf, type TestApp } from './support/test-app.js';

const API = '/api/v1';
const ANA = 'ana@ejemplo.test';
const INSTRUCTOR = 'admin@ejemplo.test';
/** Campos internos que nunca deben salir en una respuesta. */
const SENSITIVE_FIELDS = /"(passwordHash|password|failedLogins|lockedUntil|sessionVersion|tokenHash)"/;

async function login(t: TestApp, email: string, password = DEMO_PASSWORD) {
  return request(t.http).post(`${API}/auth/login`).send({ email, password });
}

describe('API B1.1 (integración HTTP, base simulada)', () => {
  let db: FakePrisma;
  let t: TestApp;

  beforeEach(async () => {
    db = new FakePrisma();
    await seedDemo(db as never, DEMO_PASSWORD);
    db.registeredBy('a1', ['u1', 'u2', 'u3', 'u4', 'u5', 'u6']); // regla del 17/11/2026: los ve quien los registró
    t = await createTestApp(db);
  });
  afterEach(() => t.close());

  describe('inicio de sesión', () => {
    it('entrega el token de acceso, el usuario sin datos sensibles y la cookie HttpOnly de renovación', async () => {
      const res = await login(t, 'ANA@ejemplo.test ');
      expect(res.status).toBe(200);
      expect(res.body.tokenType).toBe('Bearer');
      expect(res.body.expiresIn).toBe(900);
      expect(res.body.accessToken.split('.')).toHaveLength(3);
      expect(res.body.user).toMatchObject({ id: 'u1', email: ANA, role: 'STUDENT', firstNames: 'Ana', lastNames: 'Torres Quispe' });
      // B2.1: `student.companies` (colección) reemplaza a `student.company`.
      expect(res.body.user.student).toEqual({
        dni: '00000001',
        companies: [{ id: 'emp-demo', name: 'Empresa de demostración', ruc: '00000000001' }],
      });
      expect(JSON.stringify(res.body)).not.toMatch(SENSITIVE_FIELDS);

      const cookie = refreshCookieOf(res)!;
      expect(cookie.value.length).toBeGreaterThan(30);
      expect(cookie.header).toMatch(/HttpOnly/i);
      expect(cookie.header).toMatch(/SameSite=Strict/i);
      expect(cookie.header).toMatch(/Path=\/api\/v1\/auth/i);
      expect(cookie.header).not.toMatch(/;\s*Secure/i); // desarrollo: COOKIE_SECURE=false
      // En la base solo queda el hash del token.
      expect(db.refreshTokens[0].tokenHash).not.toBe(cookie.value);
      expect(db.actions()).toContain('LOGIN_OK');
    });

    it('usa el mismo mensaje para un correo inexistente y una contraseña incorrecta', async () => {
      const unknown = await login(t, 'nadie@ejemplo.test');
      const wrong = await login(t, ANA, 'incorrecta');
      expect(unknown.status).toBe(401);
      expect(wrong.status).toBe(401);
      expect(unknown.body.message).toBe('Correo o contraseña incorrectos.');
      expect(wrong.body.message).toBe(unknown.body.message);
      expect(refreshCookieOf(wrong)).toBeNull();
    });

    it('rechaza datos inválidos y campos no permitidos con mensajes en español', async () => {
      const bad = await request(t.http).post(`${API}/auth/login`).send({ email: 'no-es-correo', password: 'x' });
      expect(bad.status).toBe(400);
      expect(bad.body.message).toEqual(['Ingresa un correo electrónico válido.']);

      const extra = await request(t.http).post(`${API}/auth/login`).send({ email: ANA, password: DEMO_PASSWORD, role: 'INSTRUCTOR' });
      expect(extra.status).toBe(400);
      expect(extra.body.message).toEqual(['El campo «role» no está permitido.']);
    });

    it('bloquea la cuenta 15 minutos tras 5 intentos fallidos, aun con la contraseña correcta', async () => {
      for (let i = 0; i < 4; i++) expect((await login(t, ANA, 'mala')).status).toBe(401);
      expect(db.userByEmail(ANA).failedLogins).toBe(4);
      const fifth = await login(t, ANA, 'mala');
      expect(fifth.body.message).toBe('Correo o contraseña incorrectos.');

      const lockedUntil: Date = db.userByEmail(ANA).lockedUntil;
      const minutes = (lockedUntil.getTime() - Date.now()) / 60_000;
      expect(minutes).toBeGreaterThan(14.9);
      expect(minutes).toBeLessThanOrEqual(15);

      const correct = await login(t, ANA);
      expect(correct.status).toBe(401);
      expect(correct.body.message).toMatch(/bloqueada temporalmente/);
      expect(db.actions()).toContain('ACCOUNT_LOCKED');

      // Al vencer el bloqueo puede entrar y el contador se reinicia.
      db.userByEmail(ANA).lockedUntil = new Date(Date.now() - 1000);
      expect((await login(t, ANA)).status).toBe(200);
      expect(db.userByEmail(ANA).failedLogins).toBe(0);
      expect(db.userByEmail(ANA).lockedUntil).toBeNull();
    });

    it('un acceso correcto reinicia el contador de fallos', async () => {
      await login(t, ANA, 'mala');
      await login(t, ANA, 'mala');
      expect((await login(t, ANA)).status).toBe(200);
      expect(db.userByEmail(ANA).failedLogins).toBe(0);
    });

    it('rechaza una cuenta desactivada', async () => {
      db.userByEmail(ANA).active = false;
      const res = await login(t, ANA);
      expect(res.status).toBe(401);
      expect(res.body.message).toMatch(/desactivada/);
    });
  });

  describe('protección de rutas y roles', () => {
    it('GET /auth/me exige un token válido', async () => {
      expect((await request(t.http).get(`${API}/auth/me`)).status).toBe(401);
      expect((await request(t.http).get(`${API}/auth/me`).set('Authorization', 'Bearer no.es.valido')).status).toBe(401);

      const { body } = await login(t, ANA);
      const me = await request(t.http).get(`${API}/auth/me`).set('Authorization', `Bearer ${body.accessToken}`);
      expect(me.status).toBe(200);
      expect(me.body).toMatchObject({ id: 'u1', fullName: 'Ana Torres Quispe', role: 'STUDENT' });
      expect(JSON.stringify(me.body)).not.toMatch(SENSITIVE_FIELDS);
    });

    it('rechaza un token firmado con otro secreto', async () => {
      const { JwtService } = await import('@nestjs/jwt');
      const forged = await new JwtService().signAsync(
        { sub: 'a1', role: 'INSTRUCTOR', sv: 0 },
        { secret: 'otro-secreto-cualquiera-de-al-menos-32-caracteres', issuer: 'aula-virtual-imc', audience: 'aula-virtual-imc-api' },
      );
      expect((await request(t.http).get(`${API}/auth/me`).set('Authorization', `Bearer ${forged}`)).status).toBe(401);
    });

    it('GET /users/:id solo está permitido al Instructor', async () => {
      const student = (await login(t, ANA)).body.accessToken;
      const instructor = (await login(t, INSTRUCTOR)).body.accessToken;

      const denied = await request(t.http).get(`${API}/users/u2`).set('Authorization', `Bearer ${student}`);
      expect(denied.status).toBe(403);
      expect(denied.body.message).toBe('No tienes permiso para realizar esta acción.');

      const ok = await request(t.http).get(`${API}/users/u2`).set('Authorization', `Bearer ${instructor}`);
      expect(ok.status).toBe(200);
      expect(ok.body).toMatchObject({ id: 'u2', role: 'STUDENT', student: { dni: '00000002' } });

      const missing = await request(t.http).get(`${API}/users/no-existe`).set('Authorization', `Bearer ${instructor}`);
      expect(missing.status).toBe(404);
    });
  });

  describe('renovación, rotación y revocación de sesiones', () => {
    it('rota la cookie: el token anterior deja de servir', async () => {
      const first = refreshCookieOf(await login(t, ANA))!;
      const renewed = await request(t.http).post(`${API}/auth/refresh`).set(CLIENT_HEADER).set('Cookie', `imc_refresh=${first.value}`);
      expect(renewed.status).toBe(200);
      expect(renewed.body.accessToken).toBeTruthy();
      const second = refreshCookieOf(renewed)!;
      expect(second.value).not.toBe(first.value);

      // La sesión conserva su vencimiento absoluto (máximo 7 días desde el inicio de sesión).
      const [old, current] = db.refreshTokens;
      expect(current.expiresAt.getTime()).toBe(old.expiresAt.getTime());
      expect(old.revokedReason).toBe('ROTATED');
      expect(old.replacedById).toBe(current.id);
    });

    it('reutilizar un token ya rotado revoca toda la sesión', async () => {
      const first = refreshCookieOf(await login(t, ANA))!;
      const renewed = await request(t.http).post(`${API}/auth/refresh`).set(CLIENT_HEADER).set('Cookie', `imc_refresh=${first.value}`);
      const second = refreshCookieOf(renewed)!;

      const reuse = await request(t.http).post(`${API}/auth/refresh`).set(CLIENT_HEADER).set('Cookie', `imc_refresh=${first.value}`);
      expect(reuse.status).toBe(401);
      expect(db.actions()).toContain('REFRESH_REUSE_DETECTED');

      const afterReuse = await request(t.http).post(`${API}/auth/refresh`).set(CLIENT_HEADER).set('Cookie', `imc_refresh=${second.value}`);
      expect(afterReuse.status).toBe(401);
      expect(db.refreshTokens.every((r) => r.revokedAt)).toBe(true);
    });

    it('la renovación exige la cookie y la cabecera X-Requested-With', async () => {
      const cookie = refreshCookieOf(await login(t, ANA))!;
      expect((await request(t.http).post(`${API}/auth/refresh`).set('Cookie', `imc_refresh=${cookie.value}`)).status).toBe(403);
      const none = await request(t.http).post(`${API}/auth/refresh`).set(CLIENT_HEADER);
      expect(none.status).toBe(401);
      expect(refreshCookieOf(none)?.header).toMatch(/imc_refresh=;/); // se limpia la cookie
    });

    it('rechaza una sesión vencida', async () => {
      const cookie = refreshCookieOf(await login(t, ANA))!;
      db.refreshTokens[0].expiresAt = new Date(Date.now() - 1000);
      expect((await request(t.http).post(`${API}/auth/refresh`).set(CLIENT_HEADER).set('Cookie', `imc_refresh=${cookie.value}`)).status).toBe(401);
    });

    it('cerrar sesión revoca la sesión y limpia la cookie', async () => {
      const cookie = refreshCookieOf(await login(t, ANA))!;
      const out = await request(t.http).post(`${API}/auth/logout`).set(CLIENT_HEADER).set('Cookie', `imc_refresh=${cookie.value}`);
      expect(out.status).toBe(204);
      expect(refreshCookieOf(out)?.header).toMatch(/imc_refresh=;/);
      expect(db.refreshTokens[0].revokedReason).toBe('LOGOUT');
      expect((await request(t.http).post(`${API}/auth/refresh`).set(CLIENT_HEADER).set('Cookie', `imc_refresh=${cookie.value}`)).status).toBe(401);
      // Es idempotente.
      expect((await request(t.http).post(`${API}/auth/logout`).set(CLIENT_HEADER)).status).toBe(204);
    });

    it('cerrar todas las sesiones invalida también los tokens de acceso ya emitidos', async () => {
      const a = await login(t, ANA);
      const b = await login(t, ANA);
      const token = a.body.accessToken;
      expect((await request(t.http).post(`${API}/auth/logout-all`).set('Authorization', `Bearer ${token}`)).status).toBe(204);

      expect((await request(t.http).get(`${API}/auth/me`).set('Authorization', `Bearer ${b.body.accessToken}`)).status).toBe(401);
      const cookieB = refreshCookieOf(b)!;
      expect((await request(t.http).post(`${API}/auth/refresh`).set(CLIENT_HEADER).set('Cookie', `imc_refresh=${cookieB.value}`)).status).toBe(401);
      expect(db.actions()).toContain('LOGOUT_ALL');
    });

    it('cambiar la contraseña cierra todas las sesiones y permite entrar con la nueva', async () => {
      const { body } = await login(t, ANA);
      const auth = { Authorization: `Bearer ${body.accessToken}` };

      const weak = await request(t.http).patch(`${API}/auth/password`).set(auth).send({ currentPassword: DEMO_PASSWORD, newPassword: 'corta' });
      expect(weak.status).toBe(400);
      const wrong = await request(t.http).patch(`${API}/auth/password`).set(auth).send({ currentPassword: 'mala', newPassword: 'NuevaClave2026' });
      expect(wrong.status).toBe(400);
      expect(wrong.body.message).toBe('La contraseña actual no es correcta.');

      const ok = await request(t.http).patch(`${API}/auth/password`).set(auth).send({ currentPassword: DEMO_PASSWORD, newPassword: 'NuevaClave2026' });
      expect(ok.status).toBe(204);
      expect((await request(t.http).get(`${API}/auth/me`).set(auth)).status).toBe(401);
      expect((await login(t, ANA)).status).toBe(401);
      expect((await login(t, ANA, 'NuevaClave2026')).status).toBe(200);
      expect(db.actions()).toContain('PASSWORD_CHANGED');
    });
  });

  describe('salud, documentación y cabeceras', () => {
    it('GET /health es pública e informa el estado de la base', async () => {
      const ok = await request(t.http).get(`${API}/health`);
      expect(ok.status).toBe(200);
      expect(ok.body).toMatchObject({ status: 'ok', database: 'ok' });

      db.databaseDown = true;
      const down = await request(t.http).get(`${API}/health`);
      expect(down.status).toBe(503);
      expect(down.body).toMatchObject({ status: 'error', database: 'unavailable' });
    });

    it('Swagger está disponible en desarrollo y no expone x-powered-by', async () => {
      const docs = await request(t.http).get('/api/docs-json');
      expect(docs.status).toBe(200);
      expect(Object.keys(docs.body.paths)).toEqual(
        expect.arrayContaining(['/api/v1/auth/login', '/api/v1/auth/refresh', '/api/v1/auth/me', '/api/v1/health']),
      );
      const res = await request(t.http).get(`${API}/health`);
      expect(res.headers['x-powered-by']).toBeUndefined();
      expect(res.headers['x-content-type-options']).toBe('nosniff');
    });

    it('CORS solo admite el origen configurado, con credenciales', async () => {
      const allowed = await request(t.http).options(`${API}/auth/login`).set('Origin', 'http://localhost:4200').set('Access-Control-Request-Method', 'POST');
      expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:4200');
      expect(allowed.headers['access-control-allow-credentials']).toBe('true');
      const other = await request(t.http).options(`${API}/auth/login`).set('Origin', 'https://otro-sitio.test').set('Access-Control-Request-Method', 'POST');
      expect(other.headers['access-control-allow-origin']).toBeUndefined();
    });
  });
});

describe('API B1.1 con configuración de producción', () => {
  it('cookie Secure y Swagger desactivado', async () => {
    const db = new FakePrisma();
    await seedDemo(db as never, DEMO_PASSWORD);
    const t = await createTestApp(db, { NODE_ENV: 'production', COOKIE_SECURE: 'true', SWAGGER_ENABLED: 'false' });
    try {
      const res = await login(t, ANA);
      expect(res.status).toBe(200);
      expect(refreshCookieOf(res)!.header).toMatch(/;\s*Secure/i);
      expect((await request(t.http).get('/api/docs-json')).status).toBe(404);
    } finally {
      await t.close();
    }
  });
});

describe('límite de solicitudes por IP', () => {
  it('responde 429 al superar el límite de autenticación', async () => {
    const db = new FakePrisma();
    await seedDemo(db as never, DEMO_PASSWORD);
    const t = await createTestApp(db, { AUTH_THROTTLE_LIMIT: '3' });
    try {
      const statuses: number[] = [];
      for (let i = 0; i < 4; i++) statuses.push((await login(t, 'nadie@ejemplo.test')).status);
      expect(statuses).toEqual([401, 401, 401, 429]);
      const res = await login(t, ANA);
      expect(res.body.message).toBe('Demasiadas solicitudes. Espera un momento e inténtalo nuevamente.');
      // El límite estricto solo aplica a autenticación: el resto de la API sigue respondiendo.
      expect((await request(t.http).get(`${API}/health`)).status).toBe(200);
    } finally {
      await t.close();
    }
  });
});

describe('cambio de contraseña obligatorio (mustChangePassword)', () => {
  let db: FakePrisma;
  let t: TestApp;

  beforeEach(async () => {
    db = new FakePrisma();
    await seedDemo(db as never, DEMO_PASSWORD);
    db.registeredBy('a1', ['u1', 'u2', 'u3', 'u4', 'u5', 'u6']); // regla del 17/11/2026: los ve quien los registró
    db.userByEmail(INSTRUCTOR).mustChangePassword = true;
    t = await createTestApp(db);
  });
  afterEach(() => t.close());

  it('el inicio de sesión funciona e informa que debe cambiar la contraseña', async () => {
    const res = await login(t, INSTRUCTOR);
    expect(res.status).toBe(200);
    expect(res.body.user.mustChangePassword).toBe(true);
  });

  it('bloquea el resto de la API con 403 «PasswordChangeRequired»', async () => {
    const { body } = await login(t, INSTRUCTOR);
    const res = await request(t.http).get(`${API}/users/u1`).set('Authorization', `Bearer ${body.accessToken}`);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      statusCode: 403,
      error: 'PasswordChangeRequired',
      message: 'Debes cambiar tu contraseña temporal antes de continuar.',
    });
  });

  it('permite ver el perfil, renovar la sesión, cerrar sesión y cerrar todas las sesiones', async () => {
    const res = await login(t, INSTRUCTOR);
    const auth = { Authorization: `Bearer ${res.body.accessToken}` };
    expect((await request(t.http).get(`${API}/auth/me`).set(auth)).status).toBe(200);

    const cookie = refreshCookieOf(res)!.value;
    const renewed = await request(t.http).post(`${API}/auth/refresh`).set(CLIENT_HEADER).set('Cookie', `imc_refresh=${cookie}`);
    expect(renewed.status).toBe(200);
    expect(renewed.body.user.mustChangePassword).toBe(true);
    // El token renovado sigue limitado.
    expect((await request(t.http).get(`${API}/users/u1`).set('Authorization', `Bearer ${renewed.body.accessToken}`)).status).toBe(403);

    const second = refreshCookieOf(renewed)!.value;
    expect((await request(t.http).post(`${API}/auth/logout`).set(CLIENT_HEADER).set('Cookie', `imc_refresh=${second}`)).status).toBe(204);

    const again = await login(t, INSTRUCTOR);
    expect((await request(t.http).post(`${API}/auth/logout-all`).set({ Authorization: `Bearer ${again.body.accessToken}` })).status).toBe(204);
  });

  it('tras cambiar la contraseña, con un nuevo inicio de sesión se accede a todo', async () => {
    const { body } = await login(t, INSTRUCTOR);
    const changed = await request(t.http)
      .patch(`${API}/auth/password`)
      .set('Authorization', `Bearer ${body.accessToken}`)
      .send({ currentPassword: DEMO_PASSWORD, newPassword: 'ClaveDefinitiva2026' });
    expect(changed.status).toBe(204);
    expect(db.userByEmail(INSTRUCTOR).mustChangePassword).toBe(false);

    const fresh = await login(t, INSTRUCTOR, 'ClaveDefinitiva2026');
    expect(fresh.body.user.mustChangePassword).toBe(false);
    expect((await request(t.http).get(`${API}/users/u1`).set('Authorization', `Bearer ${fresh.body.accessToken}`)).status).toBe(200);
  });

  it('el estudiante con contraseña temporal tampoco puede usar rutas de Instructor ni otras rutas', async () => {
    db.userByEmail(ANA).mustChangePassword = true;
    const { body } = await login(t, ANA);
    const res = await request(t.http).get(`${API}/users/u2`).set('Authorization', `Bearer ${body.accessToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('PasswordChangeRequired');
  });
});
