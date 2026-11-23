/**
 * B2.3b (integración HTTP con la aplicación completa y la base simulada; sin MySQL): asignación y retiro de empresas de
 * estudiantes existentes en `/students/:id/companies`, dentro del alcance por empresa del Instructor autenticado.
 */
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDemo } from '../prisma/seed-data.js';
import { FakePrisma } from './support/fake-prisma.js';
import { createTestApp, DEMO_PASSWORD, type TestApp } from './support/test-app.js';

const API = '/api/v1';
// Valores de RUC ya usados en pruebas anteriores, y un marcador claramente no real.
const RUC_A = '20123456789';
const RUC_MARKER = 'ABC-1234567';

/**
 * a1 → emp-demo y emp-y. i2 → emp-x. i3 sin empresas. gadm: Instructor con IMC_GENERAL_ADMIN, sin empresas.
 * u1…u6 en emp-demo (ana = u1); u7 solo en emp-x; u9 en emp-demo y emp-x.
 */
async function scenario(db: FakePrisma) {
  await seedDemo(db as never, DEMO_PASSWORD);
  const passwordHash = db.userByEmail('ana@ejemplo.test').passwordHash;
  await db.company.create({ data: { id: 'emp-x', name: 'Empresa X de prueba', ruc: RUC_A } });
  await db.company.create({ data: { id: 'emp-y', name: 'Empresa Y de prueba', ruc: RUC_MARKER } });
  for (const id of ['i2', 'i3', 'gadm']) {
    await db.user.create({ data: { id, email: `${id}@prueba.test`, role: 'INSTRUCTOR', firstNames: 'I', lastNames: id, passwordHash } });
    await db.instructor.create({ data: { userId: id } });
  }
  await db.instructorPermission.create({ data: { instructorId: 'gadm', permission: 'IMC_GENERAL_ADMIN' } });
  await db.instructorCompany.create({ data: { instructorId: 'i2', companyId: 'emp-x' } });
  await db.instructorCompany.create({ data: { instructorId: 'a1', companyId: 'emp-y' } });
  for (const [id, dni] of [['u7', '10000007'], ['u9', '10000009']] as const) {
    await db.user.create({ data: { id, email: `${id}@prueba.test`, role: 'STUDENT', firstNames: 'E', lastNames: id, passwordHash } });
    await db.student.create({ data: { userId: id, dni } });
  }
  await db.studentCompany.create({ data: { studentId: 'u7', companyId: 'emp-x' } });
  await db.studentCompany.create({ data: { studentId: 'u9', companyId: 'emp-x' } });
  await db.studentCompany.create({ data: { studentId: 'u9', companyId: 'emp-demo' } });
  // Regla del 17/11/2026: cada Instructor ve a los estudiantes que registró.
  db.registeredBy('a1', ['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u9']);
  db.registeredBy('i2', ['u7']);
  db.auditLogs = [];
}

describe('B2.3b: empresas de estudiantes (HTTP, base simulada)', () => {
  let db: FakePrisma;
  let t: TestApp;
  const token = async (email: string) =>
    (await request(t.http).post(`${API}/auth/login`).send({ email, password: DEMO_PASSWORD })).body.accessToken as string;
  /** Primero el token y después la petición (supertest no admite dos peticiones abiertas a la vez). */
  const assign = async (email: string | null, id: string, body: object, headers: Record<string, string> = {}) => {
    const bearer = email ? await token(email) : null;
    const req = request(t.http).post(`${API}/students/${id}/companies`).set(headers).send(body);
    return bearer ? req.set('Authorization', `Bearer ${bearer}`) : req;
  };
  const remove = async (email: string | null, id: string, companyId: string) => {
    const bearer = email ? await token(email) : null;
    const req = request(t.http).delete(`${API}/students/${id}/companies/${companyId}`);
    return bearer ? req.set('Authorization', `Bearer ${bearer}`) : req;
  };
  const get = async (email: string, path: string) => {
    const bearer = await token(email);
    return request(t.http).get(`${API}${path}`).set('Authorization', `Bearer ${bearer}`);
  };
  const linksOf = (studentId: string) =>
    db.studentCompanies
      .filter((l) => l.studentId === studentId)
      .map((l) => String(l.companyId))
      .sort((a, b) => a.localeCompare(b));
  const studentActions = () => db.auditLogs.filter((a) => String(a.action).startsWith('STUDENT_COMPANY_'));

  beforeEach(async () => {
    db = new FakePrisma();
    await scenario(db);
    t = await createTestApp(db);
  });
  afterEach(() => t.close());

  describe('autenticación y rol', () => {
    it('sin sesión → 401; rol STUDENT → 403; sin cambios', async () => {
      expect((await assign(null, 'u1', { companyIds: ['emp-y'] })).status).toBe(401);
      expect((await remove(null, 'u9', 'emp-demo')).status).toBe(401);
      expect((await assign('ana@ejemplo.test', 'u1', { companyIds: ['emp-y'] })).status).toBe(403);
      expect((await remove('ana@ejemplo.test', 'u9', 'emp-demo')).status).toBe(403);
      expect(linksOf('u1')).toEqual(['emp-demo']);
      expect(linksOf('u9')).toEqual(['emp-demo', 'emp-x']);
    });
  });

  describe('POST /students/:id/companies', () => {
    it('asigna empresas propias (sin duplicar), con el actor del token y bitácora sin datos personales', async () => {
      const res = await assign('admin@ejemplo.test', 'u1', { companyIds: ['emp-demo', 'emp-y', 'emp-y'] }, { 'X-User-Id': 'i2' });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ created: ['emp-y'], alreadyAssigned: ['emp-demo'], student: { id: 'u1' } });
      expect(res.body.student.companies.map((c: { id: string }) => c.id)).toEqual(['emp-demo', 'emp-y']);
      expect(studentActions()).toEqual([
        expect.objectContaining({
          action: 'STUDENT_COMPANY_ASSIGNED',
          actorId: 'a1',
          entity: 'student',
          entityId: 'u1',
          ip: expect.any(String),
          data: { companyId: 'emp-y', operation: 'assign' },
        }),
      ]);
      expect(JSON.stringify(studentActions())).not.toMatch(/ana@ejemplo|00000001|Torres/);
    });

    it('estudiante fuera del alcance → 404; empresa inexistente → 404; nada aplicado', async () => {
      const foreignStudent = await assign('admin@ejemplo.test', 'u7', { companyIds: ['emp-demo'] });
      expect(foreignStudent.status).toBe(404);
      expect(foreignStudent.body.message).toBe('No se encontró el estudiante.');
      const missingCompany = await assign('admin@ejemplo.test', 'u1', { companyIds: ['emp-y', 'no-existe'] });
      expect(missingCompany.status).toBe(404);
      expect(missingCompany.body.message).toBe('No se encontró una de las empresas indicadas.');
      expect(linksOf('u1')).toEqual(['emp-demo']);
      expect(studentActions()).toHaveLength(0);
    });

    it('opción A (20/11/2026): asigna a SU participante cualquier empresa activa, aunque no esté asignada al Instructor', async () => {
      const res = await assign('admin@ejemplo.test', 'u1', { companyIds: ['emp-x', 'emp-y'] }); // emp-x no es de a1
      expect(res.status).toBe(200);
      expect(linksOf('u1')).toEqual(['emp-demo', 'emp-x', 'emp-y']);
      // i2 tiene emp-x, pero sigue sin ver a u1 (lo registró a1).
      expect((await get('i2@prueba.test', '/students/u1')).status).toBe(404);
    });

    it('empresa inactiva o estudiante inactivo → 409', async () => {
      db.companies.find((c) => c.id === 'emp-y')!.active = false;
      const inactiveCompany = await assign('admin@ejemplo.test', 'u1', { companyIds: ['emp-y'] });
      expect(inactiveCompany.status).toBe(409);
      expect(inactiveCompany.body.message).toBe('La empresa «Empresa Y de prueba» está desactivada y no admite nuevas asignaciones.');
      db.companies.find((c) => c.id === 'emp-y')!.active = true;
      db.userByEmail('ana@ejemplo.test').active = false;
      const inactiveStudent = await assign('admin@ejemplo.test', 'u1', { companyIds: ['emp-y'] });
      expect(inactiveStudent.status).toBe(409);
      expect(inactiveStudent.body.message).toBe('La cuenta del estudiante está desactivada y no admite nuevas asignaciones.');
      expect(linksOf('u1')).toEqual(['emp-demo']);
    });

    it('validación: lista obligatoria, de 1 a 50 identificadores válidos; campos de identidad → 400', async () => {
      const bad = async (body: object, message: string) => {
        const res = await assign('admin@ejemplo.test', 'u1', body);
        expect(res.status).toBe(400);
        expect(res.body.message).toEqual(expect.arrayContaining([message]));
      };
      await bad({}, 'Indica al menos una empresa.');
      await bad({ companyIds: [] }, 'Indica al menos una empresa.');
      await bad({ companyIds: [1] }, 'Un identificador de empresa no es válido.');
      await bad({ companyIds: ['x'.repeat(37)] }, 'Un identificador de empresa no es válido.');
      await bad({ companyIds: Array.from({ length: 51 }, (_, i) => `e${i}`) }, 'Indica como máximo 50 empresas.');
      await bad({ companyIds: ['emp-y'], instructorId: 'i2' }, 'El campo «instructorId» no está permitido.');
      await bad({ companyIds: ['emp-y'], userId: 'i2' }, 'El campo «userId» no está permitido.');
      await bad({ companyIds: ['emp-y'], role: 'INSTRUCTOR' }, 'El campo «role» no está permitido.');
      expect(linksOf('u1')).toEqual(['emp-demo']);
    });
  });

  describe('DELETE /students/:id/companies/:companyId', () => {
    it('retira una asociación propia: el Instructor lo sigue viendo porque lo registró (regla del 17/11/2026)', async () => {
      const res = await remove('admin@ejemplo.test', 'u9', 'emp-demo');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ studentId: 'u9', companyId: 'emp-demo', stillVisible: true });
      expect(linksOf('u9')).toEqual(['emp-x']);
      const detail = await get('admin@ejemplo.test', '/students/u9');
      expect(detail.status).toBe(200);
      // Opción A (20/11/2026): se muestran todas las empresas de su participante.
      expect(detail.body.companies.map((c: { id: string }) => c.id)).toEqual(['emp-x']);
      expect((await get('i2@prueba.test', '/students/u9')).status).toBe(404); // comparte emp-x, pero no lo registró
      expect(studentActions()).toEqual([
        expect.objectContaining({ action: 'STUDENT_COMPANY_REMOVED', actorId: 'a1', entityId: 'u9', data: { companyId: 'emp-demo', operation: 'remove' } }),
      ]);
    });

    it('conserva el acceso si comparte otra empresa; se puede retirar de una empresa inactiva', async () => {
      await assign('admin@ejemplo.test', 'u1', { companyIds: ['emp-y'] });
      db.companies.find((c) => c.id === 'emp-y')!.active = false;
      const res = await remove('admin@ejemplo.test', 'u1', 'emp-y');
      expect(res.status).toBe(200);
      expect(res.body.stillVisible).toBe(true);
      expect((await get('admin@ejemplo.test', '/students/u1')).status).toBe(200);
    });

    it('última asociación → 409 y la relación queda intacta', async () => {
      const res = await remove('admin@ejemplo.test', 'u1', 'emp-demo');
      expect(res.status).toBe(409);
      expect(res.body.message).toBe('No se puede retirar la única empresa del estudiante: debe conservar al menos una.');
      expect(linksOf('u1')).toEqual(['emp-demo']);
      expect(studentActions()).toHaveLength(0);
    });

    it('empresa inexistente → 404; asociación inexistente → 404; estudiante ajeno → 404', async () => {
      expect((await remove('admin@ejemplo.test', 'u7', 'emp-x')).status).toBe(404); // u7 lo registró i2
      expect((await remove('admin@ejemplo.test', 'u1', 'no-existe')).status).toBe(404);
      const missing = await remove('admin@ejemplo.test', 'u1', 'emp-y');
      expect(missing.status).toBe(404);
      expect(missing.body.message).toBe('El estudiante no está asociado a esa empresa.');
      expect(linksOf('u9')).toEqual(['emp-demo', 'emp-x']);
    });

    it('retirar no borra al estudiante, su perfil ni sus matrículas', async () => {
      await db.course.create({ data: { id: 'curso-1', name: 'Curso de prueba' } });
      await db.enrollment.create({ data: { studentId: 'u9', courseId: 'curso-1' } });
      const counts = () => ({ users: db.users.length, students: db.students.length, enrollments: db.enrollments.length });
      const before = counts();
      expect((await remove('admin@ejemplo.test', 'u9', 'emp-demo')).status).toBe(200);
      expect(counts()).toEqual(before);
    });
  });

  describe('alcance y administración general', () => {
    it('un Instructor que no registró al estudiante no puede gestionar sus empresas', async () => {
      expect((await assign('i3@prueba.test', 'u1', { companyIds: ['emp-demo'] })).status).toBe(404);
      expect((await remove('i3@prueba.test', 'u9', 'emp-demo')).status).toBe(404);
    });

    it('la administración general solo gestiona a los estudiantes que registró (con cualquier empresa activa)', async () => {
      expect((await assign('gadm@prueba.test', 'u1', { companyIds: ['emp-demo'] })).status).toBe(404);
      await db.instructorCompany.create({ data: { instructorId: 'gadm', companyId: 'emp-x' } });
      // Tener emp-x no da acceso a u9 (lo registró a1).
      expect((await remove('gadm@prueba.test', 'u9', 'emp-x')).status).toBe(404);
      db.registeredBy('gadm', ['u9']);
      expect((await assign('gadm@prueba.test', 'u9', { companyIds: ['emp-y'] })).status).toBe(200);
      expect((await remove('gadm@prueba.test', 'u9', 'emp-x')).status).toBe(200);
      expect(linksOf('u9')).toEqual(['emp-demo', 'emp-y']);
    });

    it('la manipulación de identificadores o encabezados no amplía permisos', async () => {
      const forged = await assign('admin@ejemplo.test', 'u7', { companyIds: ['emp-x'] }, { 'X-Instructor-Id': 'i2', 'X-User-Id': 'i2' });
      expect(forged.status).toBe(404);
      const bearer = await token('admin@ejemplo.test');
      const viaQuery = await request(t.http)
        .delete(`${API}/students/u7/companies/emp-x?instructorId=i2`)
        .set('Authorization', `Bearer ${bearer}`)
        .set('X-Instructor-Id', 'i2');
      expect(viaQuery.status).toBe(404);
      expect(linksOf('u7')).toEqual(['emp-x']);
      expect(linksOf('u9')).toEqual(['emp-demo', 'emp-x']);
    });
  });

  describe('regresión', () => {
    it('los GET de B2.3a y GET /users/:id siguen funcionando', async () => {
      const list = await get('admin@ejemplo.test', '/students');
      expect(list.status).toBe(200);
      expect(list.body.total).toBe(7);
      expect((await get('admin@ejemplo.test', '/students/u1')).status).toBe(200);
      expect((await get('admin@ejemplo.test', '/users/u1')).status).toBe(200);
      expect((await get('admin@ejemplo.test', '/users/u7')).status).toBe(404);
    });
  });
});
