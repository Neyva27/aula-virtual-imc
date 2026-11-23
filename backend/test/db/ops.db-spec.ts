/**
 * Protecciones de producción (puntos A, B, C y D) contra MySQL real, solo en aula_imc_test.
 * Los comandos se ejecutan como procesos reales (con tsx sobre el mismo código que compila `npm run build`).
 */
import { spawnSync } from 'node:child_process';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { findDemoTraces } from '../../src/ops/demo-traces.js';
import { assertSeedAllowed, SeedRefusedError } from '../../src/ops/seed-guard.js';
import { seedDemo } from '../../prisma/seed-data.js';
import { createTestApp, DEMO_PASSWORD, type TestApp } from '../support/test-app.js';
import { emptyTestTables, testDatabaseUrl, testPrisma } from './test-database.js';

const API = '/api/v1';
const SEED_OK = { nodeEnv: 'test', databaseName: 'aula_imc_test', seedDemoAllowed: 'true' };

/** Ejecuta un comando de src/cli contra la base de PRUEBAS. Nunca muestra su salida (puede incluir la contraseña temporal). */
function runCli(script: string, args: string[] = []) {
  const result = spawnSync(process.execPath, ['--import', 'tsx', `src/cli/${script}.ts`, ...args], {
    env: { ...process.env, DATABASE_URL: testDatabaseUrl(), NODE_ENV: 'test' },
    encoding: 'utf8',
    timeout: 60_000,
  });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

describe('MySQL: protecciones de producción', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = testPrisma();
  });
  beforeEach(() => emptyTestTables(prisma));
  afterAll(() => prisma.$disconnect());

  describe('A. db:check-clean', () => {
    it('una base recién migrada está limpia (código 0)', async () => {
      expect((await findDemoTraces(prisma)).clean).toBe(true);
      const cli = runCli('db-check-clean');
      expect(cli.code).toBe(0);
      expect(cli.stdout).toMatch(/LIMPIA/);
    });

    it('con la semilla de demostración falla (código 1) e informa qué encontró, sin modificar nada', async () => {
      await seedDemo(prisma, DEMO_PASSWORD);
      expect(await findDemoTraces(prisma)).toMatchObject({ clean: false, companies: 1, users: 7, students: 6 });
      const cli = runCli('db-check-clean');
      expect(cli.code).toBe(1);
      expect(cli.stderr).toMatch(/CONTIENE DATOS DE DEMOSTRACIÓN/);
      expect(cli.stderr).toMatch(/Usuarios de demostración.*: 7/);
      expect(await prisma.user.count()).toBe(7);
    });
  });

  describe('B. freno de la semilla', () => {
    it('con un usuario real en la base no escribe nada', async () => {
      await prisma.user.create({
        data: { email: 'instructora@empresa.pe', role: 'INSTRUCTOR', firstNames: 'Ana', lastNames: 'Real', passwordHash: 'h' },
      });
      await expect(assertSeedAllowed(SEED_OK, () => testPrisma())).rejects.toBeInstanceOf(SeedRefusedError);
      expect(await prisma.user.count()).toBe(1);
      expect(await prisma.company.count()).toBe(0);
    });

    it('con una base vacía de pruebas sí lo permite', async () => {
      const guarded = await assertSeedAllowed(SEED_OK, () => testPrisma());
      await guarded.$disconnect();
    });
  });

  describe('C y D. admin:create y cambio obligatorio de contraseña', () => {
    let t: TestApp;
    beforeAll(async () => {
      t = await createTestApp(prisma, { DATABASE_URL: testDatabaseUrl() });
    });
    afterAll(() => t.close());

    it('crea el primer Instructor; la contraseña temporal solo sirve para cambiarla', async () => {
      const cli = runCli('admin-create', ['--email=directora@empresa.pe', '--nombres=María José', '--apellidos=Quispe Rojas', '--si']);
      expect(cli.code).toBe(0);
      const temporary = cli.stdout.match(/^\s{2}([A-Za-z0-9]{20})\s*$/m)?.[1];
      expect(temporary).toBeDefined();

      const user = await prisma.user.findUniqueOrThrow({ where: { email: 'directora@empresa.pe' } });
      expect(user).toMatchObject({ role: 'INSTRUCTOR', mustChangePassword: true, firstNames: 'María José' });
      expect(user.passwordHash).not.toContain(temporary!);
      const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: 'INSTRUCTOR_BOOTSTRAP' } });
      expect(audit.entityId).toBe(user.id);
      expect(JSON.stringify(audit)).not.toContain(temporary!);

      // D: con la contraseña temporal, la API solo permite perfil y cambio de contraseña.
      const login = await request(t.http).post(`${API}/auth/login`).send({ email: 'directora@empresa.pe', password: temporary });
      expect(login.status).toBe(200);
      const auth = { Authorization: `Bearer ${login.body.accessToken}` };
      expect((await request(t.http).get(`${API}/users/${user.id}`).set(auth)).body.error).toBe('PasswordChangeRequired');
      expect((await request(t.http).get(`${API}/auth/me`).set(auth)).status).toBe(200);
      const changed = await request(t.http)
        .patch(`${API}/auth/password`)
        .set(auth)
        .send({ currentPassword: temporary, newPassword: 'ClaveDefinitiva2026' });
      expect(changed.status).toBe(204);

      const fresh = await request(t.http).post(`${API}/auth/login`).send({ email: 'directora@empresa.pe', password: 'ClaveDefinitiva2026' });
      expect((await request(t.http).get(`${API}/users/${user.id}`).set({ Authorization: `Bearer ${fresh.body.accessToken}` })).status).toBe(200);
    });

    it('se niega a crear un segundo Instructor (código 1) y no modifica la base', async () => {
      expect(runCli('admin-create', ['--email=primera@empresa.pe', '--nombres=Ana', '--apellidos=Primera', '--si']).code).toBe(0);
      const second = runCli('admin-create', ['--email=segunda@empresa.pe', '--nombres=Eva', '--apellidos=Segunda', '--si']);
      expect(second.code).toBe(1);
      expect(second.stderr).toMatch(/Ya existe un Instructor activo/);
      expect(await prisma.user.count()).toBe(1);
    });

    it('sin --si no crea nada', async () => {
      const cli = runCli('admin-create', ['--email=sin-confirmar@empresa.pe', '--nombres=Ana', '--apellidos=Pérez']);
      expect(cli.code).toBe(1);
      expect(await prisma.user.count()).toBe(0);
    });
  });
});
