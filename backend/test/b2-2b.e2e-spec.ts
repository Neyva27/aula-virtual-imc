/**
 * B2.2b (integración HTTP con la aplicación completa y la base simulada; sin MySQL): gestión de empresas en
 * `/admin/companies`, protegida por el permiso IMC_GENERAL_ADMIN (B2.2a).
 */
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDemo } from '../prisma/seed-data.js';
import { FakePrisma } from './support/fake-prisma.js';
import { createTestApp, DEMO_PASSWORD, type TestApp } from './support/test-app.js';

const API = '/api/v1';
const BASE = `${API}/admin/companies`;
// Valor de RUC que ya usaban las pruebas anteriores (no es un RUC real).
const RUC_A = '20123456789';

/** a1: Instructor normal (emp-demo). gadm: Instructor con IMC_GENERAL_ADMIN, sin empresas. ana: estudiante (emp-demo). */
async function scenario(db: FakePrisma) {
  await seedDemo(db as never, DEMO_PASSWORD);
  const passwordHash = db.userByEmail('ana@ejemplo.test').passwordHash;
  await db.user.create({
    data: { id: 'gadm', email: 'gadm@prueba.test', role: 'INSTRUCTOR', firstNames: 'Admin', lastNames: 'General', passwordHash },
  });
  await db.instructor.create({ data: { userId: 'gadm' } });
  await db.instructorPermission.create({ data: { instructorId: 'gadm', permission: 'IMC_GENERAL_ADMIN' } });
  db.registeredBy('a1', ['u1', 'u2', 'u3', 'u4', 'u5', 'u6']); // regla del 17/11/2026: los ve quien los registró
  db.auditLogs = [];
}

describe('B2.2b: gestión de empresas (HTTP, base simulada)', () => {
  let db: FakePrisma;
  let t: TestApp;
  const token = async (email: string) =>
    (await request(t.http).post(`${API}/auth/login`).send({ email, password: DEMO_PASSWORD })).body.accessToken as string;

  /** Todas las operaciones con el token indicado (o sin él). */
  const call = (bearer: string | null) => {
    const auth = <T extends request.Test>(req: T) => (bearer ? req.set('Authorization', `Bearer ${bearer}`) : req);
    return {
      list: (query = '') => auth(request(t.http).get(`${BASE}${query}`)),
      get: (id: string) => auth(request(t.http).get(`${BASE}/${id}`)),
      create: (body: object) => auth(request(t.http).post(BASE).send(body)),
      update: (id: string, body: object) => auth(request(t.http).patch(`${BASE}/${id}`).send(body)),
      deactivate: (id: string) => auth(request(t.http).post(`${BASE}/${id}/deactivate`)),
      activate: (id: string) => auth(request(t.http).post(`${BASE}/${id}/activate`)),
    };
  };
  const companyActions = () => db.auditLogs.filter((a) => String(a.action).startsWith('COMPANY_'));

  beforeEach(async () => {
    db = new FakePrisma();
    await scenario(db);
    t = await createTestApp(db);
  }, 30_000);
  afterEach(() => t.close());

  describe('autorización', () => {
    /** Funciones, no peticiones: supertest abre el servidor al crear cada una y no admite varias a la vez. */
    const attempts = (api: ReturnType<typeof call>) => [
      () => api.list(),
      () => api.get('emp-demo'),
      () => api.create({ name: 'Intrusa', ruc: RUC_A }),
      () => api.update('emp-demo', { name: 'Cambiada' }),
      () => api.deactivate('emp-demo'),
      () => api.activate('emp-demo'),
    ];

    it('un Instructor sin el permiso recibe 403 en todas las operaciones y no cambia nada', async () => {
      const api = call(await token('admin@ejemplo.test'));
      for (const attempt of attempts(api)) {
        const res = await attempt();
        expect(res.status).toBe(403);
        expect(res.body.message).toBe('No tienes permiso para realizar esta acción.');
      }
      expect(db.companies).toEqual([expect.objectContaining({ id: 'emp-demo', name: 'Empresa de demostración', active: true })]);
      expect(companyActions()).toHaveLength(0);
      expect(db.auditLogs.filter((a) => a.action === 'ADMIN_ACCESS_DENIED')).toHaveLength(6);
    });

    it('un estudiante recibe 403 y sin sesión 401', async () => {
      const student = call(await token('ana@ejemplo.test'));
      for (const attempt of attempts(student)) expect((await attempt()).status).toBe(403);
      for (const attempt of attempts(call(null))) expect((await attempt()).status).toBe(401);
      expect(db.companies).toHaveLength(1);
    });

    it('el administrador general con contraseña temporal pendiente recibe 403 PasswordChangeRequired', async () => {
      db.userByEmail('gadm@prueba.test').mustChangePassword = true;
      const res = await call(await token('gadm@prueba.test')).list();
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('PasswordChangeRequired');
    });

    it('retirar el permiso corta el acceso en la siguiente solicitud', async () => {
      const api = call(await token('gadm@prueba.test'));
      expect((await api.list()).status).toBe(200);
      db.instructorPermissions = [];
      expect((await api.list()).status).toBe(403);
    });

    it('no existe borrado físico: DELETE no es una ruta', async () => {
      const bearer = await token('gadm@prueba.test');
      const res = await request(t.http).delete(`${BASE}/emp-demo`).set('Authorization', `Bearer ${bearer}`);
      expect(res.status).toBe(404);
      expect(db.companies).toHaveLength(1);
    });
  });

  describe('operaciones del administrador general', () => {
    it('registra, consulta, actualiza, desactiva y reactiva, con bitácora de cada cambio', async () => {
      const api = call(await token('gadm@prueba.test'));

      const created = await api.create({ name: '  Empresa   X de prueba ', ruc: ` ${RUC_A} `, contactEmail: ' Contacto@Prueba.TEST ' });
      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({ name: 'Empresa X de prueba', ruc: RUC_A, contactEmail: 'contacto@prueba.test', active: true });
      const id = created.body.id as string;

      expect((await api.list()).body.map((c: { name: string }) => c.name)).toEqual(['Empresa de demostración', 'Empresa X de prueba']);
      expect((await api.get(id)).body).toEqual(created.body);

      const updated = await api.update(id, { name: 'Empresa X renombrada', contactEmail: null });
      expect(updated.status).toBe(200);
      expect(updated.body).toMatchObject({ name: 'Empresa X renombrada', ruc: RUC_A, contactEmail: null });

      const off = await api.deactivate(id);
      expect(off.status).toBe(200);
      expect(off.body.active).toBe(false);
      expect((await api.list('?active=false')).body.map((c: { id: string }) => c.id)).toEqual([id]);
      expect((await api.list('?active=true&q=demostr')).body.map((c: { id: string }) => c.id)).toEqual(['emp-demo']);
      expect((await api.activate(id)).body.active).toBe(true);

      expect(companyActions()).toEqual([
        expect.objectContaining({ action: 'COMPANY_CREATED', actorId: 'gadm', entity: 'company', entityId: id }),
        expect.objectContaining({ action: 'COMPANY_UPDATED', actorId: 'gadm', entityId: id }),
        expect.objectContaining({ action: 'COMPANY_DEACTIVATED', actorId: 'gadm', entityId: id }),
        expect.objectContaining({ action: 'COMPANY_ACTIVATED', actorId: 'gadm', entityId: id }),
      ]);
      expect(companyActions().every((a) => typeof a.ip === 'string' && a.ip.length > 0)).toBe(true);
    });

    it('404 para una empresa inexistente; 409 para nombre o RUC repetidos y para repetir un estado', async () => {
      const api = call(await token('gadm@prueba.test'));
      for (const send of [() => api.get('no-existe'), () => api.update('no-existe', { name: 'X' }), () => api.deactivate('no-existe')]) {
        const res = await send();
        expect(res.status).toBe(404);
        expect(res.body.message).toBe('Empresa no encontrada.');
      }
      expect((await api.create({ name: 'Empresa de demostración', ruc: RUC_A })).body).toMatchObject({
        statusCode: 409,
        message: 'Ya existe una empresa con ese nombre.',
      });
      expect((await api.create({ name: 'empresa de DEMOSTRACIÓN', ruc: RUC_A })).status).toBe(409);
      expect((await api.create({ name: 'Nueva', ruc: '00000000001' })).body.message).toBe('Ya existe una empresa con ese RUC.');
      expect((await api.activate('emp-demo')).body).toMatchObject({ statusCode: 409, message: 'La empresa ya está activa.' });
      expect(db.companies).toHaveLength(1);
    });

    it('corrige el RUC con bitácora del valor anterior y el nuevo, y conserva la unicidad', async () => {
      const api = call(await token('gadm@prueba.test'));
      // Marcador de prueba, claramente no real (el formato del RUC sigue pendiente y no se valida su contenido).
      const other = await api.create({ name: 'Otra empresa de prueba', ruc: 'ABC-1234567' });
      expect(other.status).toBe(201);
      expect((await api.update('emp-demo', { ruc: 'ABC-1234567' })).body).toMatchObject({
        statusCode: 409,
        message: 'Ya existe una empresa con ese RUC.',
      });
      const fixed = await api.update('emp-demo', { ruc: ` ${RUC_A} ` });
      expect(fixed.status).toBe(200);
      expect(fixed.body.ruc).toBe(RUC_A);
      expect(companyActions().at(-1)).toMatchObject({
        action: 'COMPANY_UPDATED',
        actorId: 'gadm',
        entityId: 'emp-demo',
        data: { fields: ['ruc'], before: { ruc: '00000000001' }, after: { ruc: RUC_A } },
      });
      expect((await api.update('emp-demo', { ruc: '1000' })).status).toBe(400); // sigue exigiendo 11 caracteres
    });

    it('el actor de la bitácora sale del token, aunque la petición intente indicar otro', async () => {
      const bearer = await token('gadm@prueba.test');
      const res = await request(t.http)
        .post(`${BASE}/emp-demo/deactivate?actorId=a1`)
        .set('Authorization', `Bearer ${bearer}`)
        .set('X-User-Id', 'a1');
      expect(res.status).toBe(200);
      expect(companyActions()).toEqual([expect.objectContaining({ action: 'COMPANY_DEACTIVATED', actorId: 'gadm' })]);
    });
  });

  describe('validación de entrada', () => {
    const bad = async (send: (api: ReturnType<typeof call>) => request.Test, message: string) => {
      const res = await send(call(await token('gadm@prueba.test')));
      expect(res.status).toBe(400);
      expect(res.body.message).toEqual(expect.arrayContaining([message]));
    };

    it('registro: nombre y RUC obligatorios; RUC de 11 caracteres; correo válido', async () => {
      await bad((api) => api.create({ ruc: RUC_A }), 'Ingresa el nombre de la empresa.');
      await bad((api) => api.create({ name: '   ', ruc: RUC_A }), 'Ingresa el nombre de la empresa.');
      await bad((api) => api.create({ name: 'x'.repeat(151), ruc: RUC_A }), 'El nombre de la empresa no puede superar 150 caracteres.');
      await bad((api) => api.create({ name: 'Sin RUC' }), 'Ingresa el RUC de la empresa.');
      await bad((api) => api.create({ name: 'Corto', ruc: '2012345678' }), 'El RUC debe tener 11 caracteres.');
      await bad((api) => api.create({ name: 'Largo', ruc: '201234567890' }), 'El RUC debe tener 11 caracteres.');
      await bad((api) => api.create({ name: 'Número', ruc: 20123456789 }), 'Ingresa el RUC de la empresa.');
      await bad((api) => api.create({ name: 'Correo', ruc: RUC_A, contactEmail: 'no-es-correo' }), 'Ingresa un correo de contacto válido.');
      expect(db.companies).toHaveLength(1);
    });

    it('el RUC no se valida por contenido: su formato institucional sigue pendiente', async () => {
      const res = await call(await token('gadm@prueba.test')).create({ name: 'RUC sin formato definido', ruc: 'ABC-1234567' });
      expect(res.status).toBe(201);
    });

    it('campos no permitidos → 400: estado, identificadores, actor y permisos no se aceptan del cliente', async () => {
      await bad((api) => api.create({ name: 'X', ruc: RUC_A, active: false }), 'El campo «active» no está permitido.');
      await bad((api) => api.create({ name: 'X', ruc: RUC_A, id: 'emp-elegida' }), 'El campo «id» no está permitido.');
      await bad((api) => api.create({ name: 'X', ruc: RUC_A, actorId: 'a1' }), 'El campo «actorId» no está permitido.');
      await bad((api) => api.update('emp-demo', { active: false }), 'El campo «active» no está permitido.');
      await bad((api) => api.update('emp-demo', { permissions: ['IMC_GENERAL_ADMIN'] }), 'El campo «permissions» no está permitido.');
      expect(db.companies[0]).toMatchObject({ id: 'emp-demo', active: true });
    });

    it('actualización: nombre y RUC no se pueden borrar (null), y se validan igual que en el registro', async () => {
      await bad((api) => api.update('emp-demo', { name: null }), 'Ingresa el nombre de la empresa.');
      await bad((api) => api.update('emp-demo', { ruc: null }), 'Ingresa el RUC de la empresa.');
      await bad((api) => api.update('emp-demo', { ruc: '123' }), 'El RUC debe tener 11 caracteres.');
      await bad((api) => api.update('emp-demo', { contactEmail: 'mal' }), 'Ingresa un correo de contacto válido.');
    });

    it('filtros del listado: active solo true o false; parámetros desconocidos rechazados', async () => {
      await bad((api) => api.list('?active=si'), 'El filtro «active» debe ser true o false.');
      await bad((api) => api.list('?companyId=emp-demo'), 'El campo «companyId» no está permitido.');
      await bad((api) => api.list(`?q=${'a'.repeat(101)}`), 'La búsqueda es demasiado larga.');
    });
  });

  describe('sin regresiones', () => {
    it('desactivar una empresa no cambia asociaciones, alcance de Instructores ni el perfil de los estudiantes', async () => {
      const admin = call(await token('gadm@prueba.test'));
      const before = { students: db.studentCompanies.length, instructors: db.instructorCompanies.length };
      expect((await admin.deactivate('emp-demo')).status).toBe(200);
      expect(db.studentCompanies).toHaveLength(before.students);
      expect(db.instructorCompanies).toHaveLength(before.instructors);

      // Decisión del 12/11/2026: se conserva el acceso a los registros existentes.
      const a1 = await token('admin@ejemplo.test');
      expect((await request(t.http).get(`${API}/users/u1`).set('Authorization', `Bearer ${a1}`)).status).toBe(200);
      const ana = await token('ana@ejemplo.test'); // primero el token: supertest no admite dos peticiones a la vez
      const me = await request(t.http).get(`${API}/auth/me`).set('Authorization', `Bearer ${ana}`);
      expect(me.body.student.companies).toEqual([{ id: 'emp-demo', name: 'Empresa de demostración', ruc: '00000000001' }]);
    });

    it('reactivar conserva las asociaciones y el acceso del Instructor y del estudiante', async () => {
      const admin = call(await token('gadm@prueba.test'));
      const links = { students: [...db.studentCompanies], instructors: [...db.instructorCompanies] };
      expect((await admin.deactivate('emp-demo')).status).toBe(200);
      const on = await admin.activate('emp-demo');
      expect(on.status).toBe(200);
      expect(on.body.active).toBe(true);
      expect(db.studentCompanies).toEqual(links.students);
      expect(db.instructorCompanies).toEqual(links.instructors);
      const a1 = await token('admin@ejemplo.test');
      expect((await request(t.http).get(`${API}/users/u1`).set('Authorization', `Bearer ${a1}`)).status).toBe(200);
      expect(companyActions().map((a) => a.action)).toEqual(['COMPANY_DEACTIVATED', 'COMPANY_ACTIVATED']);
    });

    it('solo la administración general reactiva: un Instructor sin permiso recibe 403 y la empresa sigue inactiva', async () => {
      expect((await call(await token('gadm@prueba.test')).deactivate('emp-demo')).status).toBe(200);
      expect((await call(await token('admin@ejemplo.test')).activate('emp-demo')).status).toBe(403);
      expect(db.companies[0].active).toBe(false);
    });

    it('el administrador general no amplía su alcance sobre estudiantes por gestionar empresas', async () => {
      const gadm = await token('gadm@prueba.test');
      expect((await request(t.http).get(`${API}/users/u1`).set('Authorization', `Bearer ${gadm}`)).status).toBe(404);
    });

    it('el contrato de autenticación no cambia: el administrador sigue siendo INSTRUCTOR, sin campos nuevos', async () => {
      const res = await request(t.http).post(`${API}/auth/login`).send({ email: 'gadm@prueba.test', password: DEMO_PASSWORD });
      expect(res.body.user).toMatchObject({ role: 'INSTRUCTOR', student: null });
      expect(Object.keys(res.body.user).sort()).toEqual(
        ['active', 'email', 'firstNames', 'fullName', 'id', 'lastLoginAt', 'lastNames', 'mustChangePassword', 'role', 'student'].sort(),
      );
    });
  });
});
