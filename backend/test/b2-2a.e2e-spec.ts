/**
 * B2.2a (integración HTTP con la aplicación completa y la base simulada; sin MySQL):
 * permiso administrativo especial IMC_GENERAL_ADMIN, independiente del rol.
 *
 * No existen todavía rutas administrativas funcionales (llegan en B2.2b). Para ejercitar la protección se montan
 * controladores SOLO DE PRUEBA con los mismos decoradores que usarán las rutas reales (@AdminController, @GeneralAdmin)
 * y con todos los guards globales de la aplicación (límite, JwtAuthGuard, RolesGuard y AdminPermissionGuard).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { Body, Controller, Get, Param, Post, SetMetadata } from '@nestjs/common';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDemo } from '../prisma/seed-data.js';
import { findUnprotectedAdminRoutes } from '../src/authz/admin-routes.verifier.js';
import { ADMIN_PERMISSIONS_KEY, AdminController, GeneralAdmin } from '../src/common/decorators.js';
import { AdminPermission, Role } from '../src/generated/prisma/enums.js';
import { FakePrisma } from './support/fake-prisma.js';
import { CLIENT_HEADER, createTestApp, DEMO_PASSWORD, type TestApp } from './support/test-app.js';

const API = '/api/v1';
const FORBIDDEN = 'No tienes permiso para realizar esta acción.';
const MIGRATIONS = new URL('../prisma/migrations/', import.meta.url);
const MIGRATION = new URL('20261112000000_b2_2a_permiso_administracion_general/migration.sql', MIGRATIONS);

// ---- Controladores solo de prueba ------------------------------------------------------------------------------

@AdminController('prueba-b22a')
class AdminProbeController {
  @Get()
  list() {
    return { ok: true };
  }

  @Post()
  create(@Body() _body: unknown) {
    return { ok: true };
  }

  @Get('detalle/:id')
  one(@Param('id') id: string) {
    return { id };
  }

  /** Permiso inexistente en el método: se exige además del de la clase, y se deniega siempre. */
  @Get('permiso-invalido')
  @SetMetadata(ADMIN_PERMISSIONS_KEY, ['NO_EXISTE'])
  invalid() {
    return { ok: true };
  }
}

@Controller('prueba-b22a-metodo')
class MethodProbeController {
  @Get('abierta')
  open() {
    return { ok: true };
  }

  @GeneralAdmin()
  @Get('administrativa')
  admin() {
    return { ok: true };
  }
}

@Controller('admin/sin-permiso')
class UnprotectedAdminController {
  @Get()
  list() {
    return { ok: true };
  }
}

@Controller()
class UnprotectedAdminHandlerController {
  @Get('admin/olvidada')
  forgotten() {
    return { ok: true };
  }
}

// ---- Escenario ------------------------------------------------------------------------------------------------

/** a1: Instructor normal (emp-demo). gadm: Instructor con IMC_GENERAL_ADMIN y SIN empresas. ana: estudiante. */
async function scenario(db: FakePrisma) {
  await seedDemo(db as never, DEMO_PASSWORD);
  const passwordHash = db.userByEmail('ana@ejemplo.test').passwordHash;
  await db.user.create({
    data: { id: 'gadm', email: 'gadm@prueba.test', role: 'INSTRUCTOR', firstNames: 'Admin', lastNames: 'General', passwordHash },
  });
  await db.instructor.create({ data: { userId: 'gadm' } });
  await db.instructorPermission.create({ data: { instructorId: 'gadm', permission: 'IMC_GENERAL_ADMIN' } });
  db.registeredBy('a1', ['u1', 'u2', 'u3', 'u4', 'u5', 'u6']); // regla del 17/11/2026: los ve quien los registró
}

const decode = (jwt: string) => JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8')) as Record<string, unknown>;

describe('B2.2a: permiso de administración general (HTTP, base simulada)', () => {
  let db: FakePrisma;
  let t: TestApp;
  const login = (email: string) => request(t.http).post(`${API}/auth/login`).send({ email, password: DEMO_PASSWORD });
  const token = async (email: string) => (await login(email)).body.accessToken as string;
  const get = (path: string, bearer?: string) => {
    const req = request(t.http).get(`${API}${path}`);
    return bearer ? req.set('Authorization', `Bearer ${bearer}`) : req;
  };

  beforeEach(async () => {
    db = new FakePrisma();
    await scenario(db);
    t = await createTestApp(db, {}, { controllers: [AdminProbeController, MethodProbeController] });
  }, 30_000); // el primer arranque importa todos los módulos y calcula hashes argon2 (puede superar 10 s en paralelo)
  afterEach(() => t.close());

  describe('acceso a rutas administrativas', () => {
    it('el Instructor con el permiso accede (GET, POST y con parámetros)', async () => {
      const bearer = await token('gadm@prueba.test');
      expect((await get('/admin/prueba-b22a', bearer)).status).toBe(200);
      expect((await request(t.http).post(`${API}/admin/prueba-b22a`).set('Authorization', `Bearer ${bearer}`).send({})).status).toBe(201);
      expect((await get('/admin/prueba-b22a/detalle/x1', bearer)).body).toEqual({ id: 'x1' });
      expect((await get('/prueba-b22a-metodo/administrativa', bearer)).status).toBe(200);
    });

    it('un Instructor normal recibe 403 en todas, y queda registrado en la bitácora', async () => {
      const bearer = await token('admin@ejemplo.test'); // a1: Instructor de demostración, SIN el permiso
      for (const path of ['/admin/prueba-b22a', '/admin/prueba-b22a/detalle/x1', '/prueba-b22a-metodo/administrativa']) {
        const res = await get(path, bearer);
        expect(res.status).toBe(403);
        expect(res.body).toMatchObject({ statusCode: 403, message: FORBIDDEN });
      }
      expect((await request(t.http).post(`${API}/admin/prueba-b22a`).set('Authorization', `Bearer ${bearer}`).send({})).status).toBe(403);
      const denied = db.auditLogs.filter((a) => a.action === 'ADMIN_ACCESS_DENIED');
      expect(denied).toHaveLength(4);
      expect(denied[0]).toMatchObject({ actorId: 'a1', data: { reason: 'MISSING_PERMISSION', method: 'GET', path: `${API}/admin/prueba-b22a` } });
    });

    it('un estudiante recibe 403 (lo detiene el rol, antes del permiso)', async () => {
      const bearer = await token('ana@ejemplo.test');
      expect((await get('/admin/prueba-b22a', bearer)).status).toBe(403);
      expect((await get('/prueba-b22a-metodo/administrativa', bearer)).status).toBe(403);
    });

    it('sin sesión, 401', async () => {
      expect((await get('/admin/prueba-b22a')).status).toBe(401);
    });

    it('un permiso inexistente produce denegación, incluso para el administrador general', async () => {
      const res = await get('/admin/prueba-b22a/permiso-invalido', await token('gadm@prueba.test'));
      expect(res.status).toBe(403);
      expect(db.auditLogs.at(-1)).toMatchObject({ action: 'ADMIN_ACCESS_DENIED', actorId: 'gadm', data: { reason: 'INVALID_PERMISSION' } });
    });

    it('retirar el permiso surte efecto en la siguiente solicitud, con el mismo token', async () => {
      const bearer = await token('gadm@prueba.test');
      expect((await get('/admin/prueba-b22a', bearer)).status).toBe(200);
      db.instructorPermissions = [];
      expect((await get('/admin/prueba-b22a', bearer)).status).toBe(403);
    });
  });

  describe('el cliente no puede elevar sus permisos', () => {
    it('encabezados, parámetros y cuerpo que declaran permisos o roles se ignoran', async () => {
      const bearer = await token('admin@ejemplo.test');
      const forged = await get('/admin/prueba-b22a?permission=IMC_GENERAL_ADMIN&role=IMC_ADMIN&userId=gadm', bearer)
        .set('X-Admin-Permission', 'IMC_GENERAL_ADMIN')
        .set('X-User-Id', 'gadm');
      expect(forged.status).toBe(403);
      const body = await request(t.http)
        .post(`${API}/admin/prueba-b22a`)
        .set('Authorization', `Bearer ${bearer}`)
        .send({ permissions: ['IMC_GENERAL_ADMIN'], isGeneralAdmin: true, instructorId: 'gadm' });
      expect(body.status).toBe(403);
    });

    it('un token firmado con permisos agregados no concede nada: el permiso solo se lee de la base', async () => {
      const jwt = t.app.get(JwtService);
      const signed = jwt.sign({ sub: 'a1', role: 'INSTRUCTOR', sv: 0, permissions: ['IMC_GENERAL_ADMIN'], perm: 'IMC_GENERAL_ADMIN' });
      expect((await get('/admin/prueba-b22a', signed)).status).toBe(403);
    });

    it('un token alterado (permisos o rol añadidos sin firma válida) se rechaza con 401', async () => {
      const [header, payload, signature] = (await token('admin@ejemplo.test')).split('.');
      const claims = { ...JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')), permissions: ['IMC_GENERAL_ADMIN'] };
      const tampered = [header, Buffer.from(JSON.stringify(claims)).toString('base64url'), signature].join('.');
      expect((await get('/admin/prueba-b22a', tampered)).status).toBe(401);
    });

    it('las rutas existentes no aceptan campos de permisos (lista blanca) y ninguna petición escribe permisos', async () => {
      const bearer = await token('admin@ejemplo.test');
      const res = await request(t.http)
        .patch(`${API}/auth/password`)
        .set('Authorization', `Bearer ${bearer}`)
        .send({ currentPassword: DEMO_PASSWORD, newPassword: 'NuevaClave12345', permissions: ['IMC_GENERAL_ADMIN'] });
      expect(res.status).toBe(400);
      expect(res.body.message).toEqual(expect.arrayContaining(['El campo «permissions» no está permitido.']));
      expect(db.instructorPermissions).toEqual([expect.objectContaining({ instructorId: 'gadm' })]);
    });
  });

  describe('rol y autenticación sin cambios', () => {
    it('la cuenta administrativa sigue siendo INSTRUCTOR: el token y el perfil no llevan permisos', async () => {
      const res = await login('gadm@prueba.test');
      expect(res.status).toBe(200);
      expect(res.body.user.role).toBe('INSTRUCTOR');
      expect(Object.keys(decode(res.body.accessToken)).sort()).toEqual(['aud', 'exp', 'iat', 'iss', 'role', 'sub', 'sv']);
      expect(decode(res.body.accessToken).role).toBe('INSTRUCTOR');
      const me = await get('/auth/me', res.body.accessToken);
      const normal = await get('/auth/me', await token('admin@ejemplo.test'));
      expect(me.body).toMatchObject({ id: 'gadm', role: 'INSTRUCTOR', student: null });
      expect(Object.keys(me.body).sort()).toEqual(Object.keys(normal.body).sort()); // mismo contrato
    });

    it('el enum de roles sigue siendo exactamente INSTRUCTOR y STUDENT; el permiso es aparte', () => {
      expect(Object.values(Role)).toEqual(['INSTRUCTOR', 'STUDENT']);
      expect(Object.values(AdminPermission)).toEqual(['IMC_GENERAL_ADMIN']);
    });

    it('las rutas normales de Instructor siguen funcionando, y el permiso no amplía el alcance por empresa', async () => {
      const a1 = await token('admin@ejemplo.test');
      expect((await get('/users/u1', a1)).status).toBe(200);
      const gadm = await token('gadm@prueba.test');
      expect((await get('/users/u1', gadm)).status).toBe(404); // sin empresas asignadas: no ve estudiantes
      expect((await get('/users/a1', gadm)).status).toBe(200);
      expect((await get('/prueba-b22a-metodo/abierta', a1)).status).toBe(200);
      expect((await get('/prueba-b22a-metodo/abierta', await token('ana@ejemplo.test'))).status).toBe(200);
    });

    it('cuenta administrativa desactivada → 401; con contraseña temporal → 403 PasswordChangeRequired', async () => {
      const bearer = await token('gadm@prueba.test');
      db.userByEmail('gadm@prueba.test').active = false;
      expect((await get('/admin/prueba-b22a', bearer)).status).toBe(401);
      db.userByEmail('gadm@prueba.test').active = true;
      db.userByEmail('gadm@prueba.test').mustChangePassword = true;
      const pending = await get('/admin/prueba-b22a', await token('gadm@prueba.test'));
      expect(pending.status).toBe(403);
      expect(pending.body.error).toBe('PasswordChangeRequired');
    });

    it('cerrar todas las sesiones invalida el token de la cuenta administrativa', async () => {
      const bearer = await token('gadm@prueba.test');
      const out = await request(t.http).post(`${API}/auth/logout-all`).set('Authorization', `Bearer ${bearer}`).set(CLIENT_HEADER);
      expect(out.status).toBeLessThan(300);
      expect((await get('/admin/prueba-b22a', bearer)).status).toBe(401);
    });

    it('el bloqueo por intentos fallidos también se aplica a la cuenta administrativa', async () => {
      for (let i = 0; i < 5; i++) {
        await request(t.http).post(`${API}/auth/login`).send({ email: 'gadm@prueba.test', password: 'incorrecta' });
      }
      expect((await login('gadm@prueba.test')).status).toBe(401);
      expect(db.userByEmail('gadm@prueba.test').lockedUntil).toBeInstanceOf(Date);
    });
  });

  it('las rutas montadas bajo /admin declaran todas un permiso', () => {
    const problems = findUnprotectedAdminRoutes(t.app.get(DiscoveryService), t.app.get(MetadataScanner), t.app.get(Reflector));
    expect(problems).toEqual([]);
  });
});

describe('B2.2a: denegación por defecto al arrancar', () => {
  it('la aplicación real arranca (no tiene rutas /admin sin permiso)', async () => {
    const t = await createTestApp(new FakePrisma());
    await t.close();
  });

  it('se niega a arrancar con un controlador /admin sin permiso', async () => {
    await expect(createTestApp(new FakePrisma(), {}, { controllers: [UnprotectedAdminController] })).rejects.toThrow(
      /UnprotectedAdminController\.list \(admin\/sin-permiso\)/,
    );
  });

  it('se niega a arrancar con un método /admin sin permiso en un controlador cualquiera', async () => {
    await expect(createTestApp(new FakePrisma(), {}, { controllers: [UnprotectedAdminHandlerController] })).rejects.toThrow(
      /sin permiso declarado.*admin\/olvidada/,
    );
  });
});

describe('B2.2a: SQL de la migración (inspección estática, sin aplicarla)', () => {
  const sql = readFileSync(MIGRATION, 'utf8')
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n');

  it('se aplica después de la migración de B2.1 (de la que depende)', () => {
    const folders = readdirSync(MIGRATIONS).filter((f) => /^\d{14}_/.test(f)).sort();
    expect(folders.indexOf('20261112000000_b2_2a_permiso_administracion_general')).toBe(
      folders.indexOf('20261111000000_b2_1_empresas_instructores_matriculas') + 1,
    );
  });

  it('solo crea instructor_permissions con su clave compuesta y sus claves foráneas', () => {
    expect(sql.match(/CREATE TABLE `(\w+)`/g)).toEqual(['CREATE TABLE `instructor_permissions`']);
    expect(sql).toContain("`permission` ENUM('IMC_GENERAL_ADMIN') NOT NULL");
    expect(sql).toContain('PRIMARY KEY (`instructor_id`, `permission`)');
    expect(sql).toContain('FOREIGN KEY (`instructor_id`) REFERENCES `instructors`(`user_id`) ON DELETE RESTRICT');
    expect(sql).toContain('FOREIGN KEY (`granted_by`) REFERENCES `users`(`id`) ON DELETE SET NULL');
  });

  it('no toca users.role ni otras tablas, no modifica filas y no otorga el permiso a nadie', () => {
    expect(sql).not.toMatch(/ALTER TABLE `(?!instructor_permissions`)/);
    expect(sql).not.toMatch(/\bMODIFY\b|\bDROP\b|\bINSERT\b|\bUPDATE\s+`|\bDELETE\s+FROM\b|\bTRUNCATE\b/i);
    expect(sql).not.toMatch(/IMC_ADMIN/);
  });
});
