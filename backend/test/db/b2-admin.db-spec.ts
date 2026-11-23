/**
 * B2.4: B2.2b (empresas) y B2.2c (asignación de instructores a empresas) contra MySQL real (aula_imc_test).
 * Ejecutar con `npm run test:db`: aplica las migraciones a la base de pruebas y vacía sus tablas antes de cada prueba
 * (`emptyTestTables`, que se niega si la base no termina en `_test`). No usa la semilla de demostración.
 */
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { createTestApp, type TestApp } from '../support/test-app.js';
import { API, bearer, createInstructor } from './b2-fixtures.js';
import { emptyTestTables, testDatabaseUrl, testPrisma } from './test-database.js';

describe('MySQL B2.2: administración general', () => {
  let prisma: PrismaClient;
  let t: TestApp;

  beforeAll(async () => {
    prisma = testPrisma();
    t = await createTestApp(prisma, { DATABASE_URL: testDatabaseUrl() });
  });
  beforeEach(async () => {
    await emptyTestTables(prisma);
    await createInstructor(prisma, 'db-admin', { generalAdmin: true });
    await createInstructor(prisma, 'db-ins1');
  });
  afterAll(async () => {
    await t.close();
    await prisma.$disconnect();
  });

  const adminToken = () => bearer(t, 'db-admin@prueba.test');

  describe('B2.2b: empresas', () => {
    it('crea, consulta, modifica (con RUC), desactiva y reactiva; todo queda en la base con su bitácora', async () => {
      const auth = { Authorization: `Bearer ${await adminToken()}` };
      const created = await request(t.http)
        .post(`${API}/admin/companies`)
        .set(auth)
        .send({ name: 'Empresa Uno de prueba', ruc: 'PRUEBA-0001', contactEmail: 'contacto@prueba.test' });
      expect(created.status).toBe(201);
      const id = created.body.id as string;
      expect(await prisma.company.findUniqueOrThrow({ where: { id } })).toMatchObject({
        name: 'Empresa Uno de prueba',
        ruc: 'PRUEBA-0001',
        contactEmail: 'contacto@prueba.test',
        active: true,
      });

      expect((await request(t.http).get(`${API}/admin/companies/${id}`).set(auth)).body.ruc).toBe('PRUEBA-0001');
      expect((await request(t.http).get(`${API}/admin/companies?q=uno`).set(auth)).body.map((c: { id: string }) => c.id)).toEqual([id]);

      const updated = await request(t.http).patch(`${API}/admin/companies/${id}`).set(auth).send({ ruc: 'PRUEBA-0002' });
      expect(updated.status).toBe(200);
      expect((await prisma.company.findUniqueOrThrow({ where: { id } })).ruc).toBe('PRUEBA-0002');

      expect((await request(t.http).post(`${API}/admin/companies/${id}/deactivate`).set(auth)).status).toBe(200);
      expect((await prisma.company.findUniqueOrThrow({ where: { id } })).active).toBe(false);
      expect((await request(t.http).post(`${API}/admin/companies/${id}/activate`).set(auth)).status).toBe(200);
      expect((await prisma.company.findUniqueOrThrow({ where: { id } })).active).toBe(true);

      // created_at tiene milisegundos y puede empatar: se compara sin depender del orden.
      const audit = await prisma.auditLog.findMany({ where: { entity: 'company', entityId: id } });
      expect(audit.map((a) => a.action).sort()).toEqual(['COMPANY_ACTIVATED', 'COMPANY_CREATED', 'COMPANY_DEACTIVATED', 'COMPANY_UPDATED']);
      expect(audit.every((a) => a.actorId === 'db-admin')).toBe(true);
      expect(audit.find((a) => a.action === 'COMPANY_UPDATED')!.data).toEqual({
        fields: ['ruc'],
        before: { ruc: 'PRUEBA-0001' },
        after: { ruc: 'PRUEBA-0002' },
      });
      expect(JSON.stringify(audit)).not.toContain('contacto@prueba.test');
    });

    it('unicidad real de MySQL: nombre repetido sin distinguir mayúsculas ni tildes y RUC repetido → 409', async () => {
      const auth = { Authorization: `Bearer ${await adminToken()}` };
      expect((await request(t.http).post(`${API}/admin/companies`).set(auth).send({ name: 'Empresa Ácida', ruc: 'PRUEBA-0001' })).status).toBe(201);
      // utf8mb4_unicode_ci: «EMPRESA ACIDA» equivale a «Empresa Ácida».
      const sameName = await request(t.http).post(`${API}/admin/companies`).set(auth).send({ name: 'EMPRESA ACIDA', ruc: 'PRUEBA-0002' });
      expect(sameName.status).toBe(409);
      const sameRuc = await request(t.http).post(`${API}/admin/companies`).set(auth).send({ name: 'Otra empresa', ruc: 'PRUEBA-0001' });
      expect(sameRuc.status).toBe(409);
      expect(await prisma.company.count()).toBe(1);
    });

    it('un Instructor sin el permiso recibe 403 (el permiso se lee de la base) y no se crea nada', async () => {
      const token = await bearer(t, 'db-ins1@prueba.test'); // primero el token, después la petición
      const res = await request(t.http)
        .post(`${API}/admin/companies`)
        .set({ Authorization: `Bearer ${token}` })
        .send({ name: 'Intrusa', ruc: 'PRUEBA-0003' });
      expect(res.status).toBe(403);
      expect(await prisma.company.count()).toBe(0);
      expect(await prisma.auditLog.count({ where: { action: 'ADMIN_ACCESS_DENIED', actorId: 'db-ins1' } })).toBe(1);
    });
  });
});
