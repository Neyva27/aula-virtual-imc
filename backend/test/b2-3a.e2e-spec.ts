/**
 * B2.3a (integración HTTP con la aplicación completa y la base simulada; sin MySQL): consulta de estudiantes en
 * `/students` dentro del alcance por empresa del Instructor autenticado.
 */
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDemo } from '../prisma/seed-data.js';
import { FakePrisma } from './support/fake-prisma.js';
import { createTestApp, DEMO_PASSWORD, type TestApp } from './support/test-app.js';

const API = '/api/v1';
// Valor de RUC que ya usaban las pruebas anteriores (no es real).
const RUC_A = '20123456789';
const NOT_FOUND = 'No se encontró el estudiante.';

/**
 * a1 → emp-demo (u1…u6 y u9). i2 → emp-x (u7 y u9). i3 sin empresas. gadm: Instructor con IMC_GENERAL_ADMIN, sin
 * empresas. u8 sin empresas. ana (u1): estudiante.
 */
async function scenario(db: FakePrisma) {
  await seedDemo(db as never, DEMO_PASSWORD);
  const passwordHash = db.userByEmail('ana@ejemplo.test').passwordHash;
  await db.company.create({ data: { id: 'emp-x', name: 'Empresa X de prueba', ruc: RUC_A } });
  const user = (id: string, role: 'INSTRUCTOR' | 'STUDENT', firstNames: string, lastNames: string) =>
    db.user.create({ data: { id, email: `${id}@prueba.test`, role, firstNames, lastNames, passwordHash } });
  for (const id of ['i2', 'i3', 'gadm']) {
    await user(id, 'INSTRUCTOR', 'Instructor', id.toUpperCase());
    await db.instructor.create({ data: { userId: id } });
  }
  await db.instructorPermission.create({ data: { instructorId: 'gadm', permission: 'IMC_GENERAL_ADMIN' } });
  await db.instructorCompany.create({ data: { instructorId: 'i2', companyId: 'emp-x' } });
  for (const [id, first, last, dni] of [
    ['u7', 'Marta', 'Ibáñez Prueba', '10000007'],
    ['u8', 'Nora', 'Sin Empresa', '10000008'],
    ['u9', 'Omar', 'Zapata Prueba', '10000009'],
  ] as const) {
    await user(id, 'STUDENT', first, last);
    await db.student.create({ data: { userId: id, dni } });
  }
  await db.studentCompany.create({ data: { studentId: 'u7', companyId: 'emp-x' } });
  await db.studentCompany.create({ data: { studentId: 'u9', companyId: 'emp-x' } });
  await db.studentCompany.create({ data: { studentId: 'u9', companyId: 'emp-demo' } });
  // Regla del 17/11/2026: cada Instructor ve a los estudiantes que registró. u8 no lo registró nadie.
  db.registeredBy('a1', ['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u9']);
  db.registeredBy('i2', ['u7']);
}

describe('B2.3a: consulta de estudiantes (HTTP, base simulada)', () => {
  let db: FakePrisma;
  let t: TestApp;
  const token = async (email: string) =>
    (await request(t.http).post(`${API}/auth/login`).send({ email, password: DEMO_PASSWORD })).body.accessToken as string;
  /** Primero el token y después la petición (supertest no admite dos peticiones abiertas a la vez). */
  const get = async (email: string | null, path: string, headers: Record<string, string> = {}) => {
    const bearer = email ? await token(email) : null;
    const req = request(t.http).get(`${API}${path}`).set(headers);
    return bearer ? req.set('Authorization', `Bearer ${bearer}`) : req;
  };
  const ids = (res: { body: { items: { id: string }[] } }) => res.body.items.map((s) => s.id);

  beforeEach(async () => {
    db = new FakePrisma();
    await scenario(db);
    t = await createTestApp(db);
  });
  afterEach(() => t.close());

  describe('autenticación y rol', () => {
    it('sin sesión → 401; con rol STUDENT → 403', async () => {
      expect((await get(null, '/students')).status).toBe(401);
      expect((await get(null, '/students/u1')).status).toBe(401);
      expect((await get('ana@ejemplo.test', '/students')).status).toBe(403);
      expect((await get('ana@ejemplo.test', '/students/u1')).status).toBe(403); // ni siquiera su propio registro
    });
  });

  describe('GET /students', () => {
    it('lista solo los estudiantes que registró el Instructor, con la respuesta paginada', async () => {
      const res = await get('admin@ejemplo.test', '/students');
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ total: 7, page: 1, pageSize: 20 });
      expect(ids(res)).toEqual(['u5', 'u2', 'u4', 'u6', 'u1', 'u3', 'u9']);
      // u9 está en emp-x, como i2, pero lo registró a1: compartir empresa no da visibilidad.
      expect(ids(await get('i2@prueba.test', '/students'))).toEqual(['u7']);
    });

    it('Instructor que no registró a nadie → lista vacía', async () => {
      expect((await get('i3@prueba.test', '/students')).body).toEqual({ items: [], total: 0, page: 1, pageSize: 20 });
    });

    it('lista blanca de la respuesta: sin datos de autenticación, rol ni permisos; todas las empresas del participante', async () => {
      const res = await get('admin@ejemplo.test', '/students?q=Omar');
      const [student] = res.body.items;
      expect(Object.keys(student).sort()).toEqual(['activationPending', 'active', 'companies', 'dni', 'email', 'firstNames', 'fullName', 'id', 'lastNames', 'whatsapp']);
      // Opción A (20/11/2026): se muestran todas las empresas de SU participante.
      expect(student.companies).toEqual([{ id: 'emp-demo', name: 'Empresa de demostración', ruc: '00000000001', active: true }, { id: 'emp-x', name: 'Empresa X de prueba', ruc: RUC_A, active: true }]);
      const raw = JSON.stringify(res.body);
      for (const field of ['passwordHash', 'failedLogins', 'lockedUntil', 'sessionVersion', 'mustChangePassword', 'role', 'permission']) {
        expect(raw).not.toContain(field);
      }
    });

    it('búsqueda por nombres, apellidos, correo y DNI', async () => {
      expect(ids(await get('admin@ejemplo.test', '/students?q=carla'))).toEqual(['u3']);
      expect(ids(await get('admin@ejemplo.test', '/students?q=Quispe'))).toEqual(['u1']);
      expect(ids(await get('admin@ejemplo.test', `/students?q=${encodeURIComponent('luis@ejemplo')}`))).toEqual(['u2']);
      expect(ids(await get('admin@ejemplo.test', '/students?q=00000004'))).toEqual(['u4']);
      expect(ids(await get('admin@ejemplo.test', '/students?q=Marta'))).toEqual([]); // fuera del alcance
    });

    it('filtro por cualquier empresa existente, solo dentro de sus participantes; inexistente → 404', async () => {
      expect(ids(await get('i2@prueba.test', '/students?companyId=emp-x'))).toEqual(['u7']); // u9 está en emp-x, pero es de a1
      // Opción A (20/11/2026): emp-demo no está asignada a i2, pero existe; i2 no ve a los participantes de a1.
      const other = await get('i2@prueba.test', '/students?companyId=emp-demo');
      expect(other.status).toBe(200);
      expect(ids(other)).toEqual([]);
      expect((await get('i2@prueba.test', '/students?companyId=no-existe')).status).toBe(404);
    });

    it('paginación y límites', async () => {
      const page = await get('admin@ejemplo.test', '/students?page=2&pageSize=2');
      expect(page.body).toMatchObject({ total: 7, page: 2, pageSize: 2 });
      expect(ids(page)).toEqual(['u4', 'u6']);
      expect((await get('admin@ejemplo.test', '/students?page=99&pageSize=2')).body).toEqual({ items: [], total: 7, page: 99, pageSize: 2 });
      for (const [query, message] of [
        ['pageSize=101', 'El tamaño de página no puede ser mayor que 100.'],
        ['pageSize=0', 'El tamaño de página debe ser un número entero entre 1 y 100.'],
        ['page=0', 'La página debe ser un número entero mayor o igual que 1.'],
        ['page=abc', 'La página debe ser un número entero mayor o igual que 1.'],
        ['page=1.5', 'La página debe ser un número entero mayor o igual que 1.'],
        ['page=10001', 'La página no puede ser mayor que 10000.'],
        [`q=${'a'.repeat(101)}`, 'La búsqueda es demasiado larga.'],
      ]) {
        const res = await get('admin@ejemplo.test', `/students?${query}`);
        expect(res.status, query).toBe(400);
        expect(res.body.message).toEqual(expect.arrayContaining([message]));
      }
    });
  });

  describe('GET /students/:id', () => {
    it('detalle de un estudiante propio, con todas sus empresas', async () => {
      const res = await get('admin@ejemplo.test', '/students/u9');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        id: 'u9',
        email: 'u9@prueba.test',
        firstNames: 'Omar',
        lastNames: 'Zapata Prueba',
        fullName: 'Omar Zapata Prueba',
        dni: '10000009',
        whatsapp: null,
        active: true,
        activationPending: false,
        // Opción A (20/11/2026): todas las empresas de su participante, también emp-x.
        companies: [{ id: 'emp-demo', name: 'Empresa de demostración', ruc: '00000000001', active: true }, { id: 'emp-x', name: 'Empresa X de prueba', ruc: RUC_A, active: true }],
      });
      expect((await get('i2@prueba.test', '/students/u9')).status).toBe(404); // comparte emp-x, pero no lo registró
    });

    it('ajeno, sin empresas e inexistente → el mismo 404', async () => {
      const foreign = await get('admin@ejemplo.test', '/students/u7');
      const orphan = await get('admin@ejemplo.test', '/students/u8');
      const missing = await get('admin@ejemplo.test', '/students/no-existe');
      for (const res of [foreign, orphan, missing]) {
        expect(res.status).toBe(404);
        expect(res.body.message).toBe(NOT_FOUND);
      }
      expect(foreign.body).toEqual(missing.body);
    });
  });

  describe('GET /students/companies (empresas que el Instructor puede elegir, opción A del 20/11/2026)', () => {
    it('devuelve todas las empresas ACTIVAS registradas, por nombre (no solo las asignadas)', async () => {
      await db.company.create({ data: { id: 'emp-z', name: 'Almacenes Inactivos de prueba', ruc: '20999999999', active: false } });
      const all = [{ id: 'emp-demo', name: 'Empresa de demostración', ruc: '00000000001', active: true }, { id: 'emp-x', name: 'Empresa X de prueba', ruc: RUC_A, active: true }];
      for (const email of ['i2@prueba.test', 'admin@ejemplo.test', 'i3@prueba.test', 'gadm@prueba.test']) {
        const res = await get(email, '/students/companies');
        expect(res.status).toBe(200);
        expect(res.body).toEqual(all); // la inactiva no se ofrece
      }
    });

    it('sin sesión 401; estudiante 403', async () => {
      expect((await get(null, '/students/companies')).status).toBe(401);
      expect((await get('ana@ejemplo.test', '/students/companies')).status).toBe(403);
    });

    it('no se confunde con GET /students/:id; elegir empresas no da acceso a participantes ajenos', async () => {
      expect((await get('admin@ejemplo.test', '/students/u1')).status).toBe(200);
      // i3 ve la lista de empresas, pero ningún participante (no registró a nadie).
      expect((await get('i3@prueba.test', '/students/companies')).body.length).toBe(2);
      expect((await get('i3@prueba.test', '/students?companyId=emp-demo')).body.total).toBe(0);
      expect((await get('i3@prueba.test', '/students/u1')).status).toBe(404);
    });
  });

  describe('administración general', () => {
    it('sin empresas asignadas no tiene acceso académico (lista vacía, detalle 404)', async () => {
      expect((await get('gadm@prueba.test', '/students')).body.total).toBe(0);
      expect((await get('gadm@prueba.test', '/students/u1')).status).toBe(404);
    });

    it('con empresas asignadas tampoco ve estudiantes que no registró, filtre por la empresa que filtre', async () => {
      await db.instructorCompany.create({ data: { instructorId: 'gadm', companyId: 'emp-x' } });
      expect(ids(await get('gadm@prueba.test', '/students'))).toEqual([]);
      expect(ids(await get('gadm@prueba.test', '/students?companyId=emp-x'))).toEqual([]);
      expect((await get('gadm@prueba.test', '/students/u7')).status).toBe(404);
      expect(ids(await get('gadm@prueba.test', '/students?companyId=emp-demo'))).toEqual([]);
    });
  });

  describe('manipulación de la petición', () => {
    it('identificadores del cliente: parámetros no declarados → 400; encabezados ignorados', async () => {
      for (const query of ['instructorId=i2', 'userId=i2', 'role=INSTRUCTOR']) {
        expect((await get('admin@ejemplo.test', `/students?${query}`)).status, query).toBe(400);
      }
      const forged = await get('admin@ejemplo.test', '/students', { 'X-Instructor-Id': 'i2', 'X-User-Id': 'i2' });
      expect(forged.status).toBe(200);
      expect(ids(forged)).not.toContain('u7');
      expect((await get('admin@ejemplo.test', '/students/u7', { 'X-Instructor-Id': 'i2' })).status).toBe(404);
    });
  });

  describe('regresión', () => {
    it('GET /users/:id aplica la misma regla: solo los estudiantes que registró el Instructor', async () => {
      expect((await get('admin@ejemplo.test', '/users/u1')).status).toBe(200);
      expect((await get('admin@ejemplo.test', '/users/u7')).status).toBe(404);
      expect((await get('i2@prueba.test', '/users/u7')).status).toBe(200);
      expect((await get('i2@prueba.test', '/users/u9')).status).toBe(404); // comparte emp-x, pero lo registró a1
      expect((await get('ana@ejemplo.test', '/users/u2')).status).toBe(403);
    });
  });
});
