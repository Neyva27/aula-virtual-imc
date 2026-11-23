/**
 * B2.1 (integración HTTP con la base simulada; sin MySQL):
 * - contrato de autenticación: `student.companies` (colección) en lugar de `student.company`;
 * - autorización por empresa en GET /users/:id, incluidos intentos de manipular la petición;
 * - semilla: perfiles y asociaciones sin reasignar estudiantes existentes;
 * - migración: el SQL copia las asociaciones antes de retirar `students.company_id`.
 */
import { readFileSync } from 'node:fs';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDemo } from '../prisma/seed-data.js';
import { FakePrisma } from './support/fake-prisma.js';
import { createTestApp, DEMO_PASSWORD, type TestApp } from './support/test-app.js';

const API = '/api/v1';
const MIGRATION = new URL('../prisma/migrations/20261111000000_b2_1_empresas_instructores_matriculas/migration.sql', import.meta.url);

/** Escenario: a1 → emp-demo (semilla); i2 → emp-x; i3 sin empresas; u7 → emp-x; u8 sin empresa; u9 → emp-demo y emp-x. */
async function scenario(db: FakePrisma) {
  await seedDemo(db as never, DEMO_PASSWORD);
  const passwordHash = db.userByEmail('ana@ejemplo.test').passwordHash; // la misma contraseña de demostración
  // El RUC repite el valor de prueba que ya usaban las pruebas de B1.1 (no es un RUC real).
  await db.company.create({ data: { id: 'emp-x', name: 'Empresa X de prueba', ruc: '20123456789' } });
  const user = (id: string, role: 'INSTRUCTOR' | 'STUDENT') =>
    db.user.create({ data: { id, email: `${id}@prueba.test`, role, firstNames: 'N', lastNames: 'A', passwordHash } });
  await user('i2', 'INSTRUCTOR');
  await db.instructor.create({ data: { userId: 'i2' } });
  await db.instructorCompany.create({ data: { instructorId: 'i2', companyId: 'emp-x' } });
  await user('i3', 'INSTRUCTOR');
  await db.instructor.create({ data: { userId: 'i3' } });
  for (const [id, dni] of [['u7', '10000007'], ['u8', '10000008'], ['u9', '10000009']] as const) {
    await user(id, 'STUDENT');
    await db.student.create({ data: { userId: id, dni } });
  }
  await db.studentCompany.create({ data: { studentId: 'u7', companyId: 'emp-x' } });
  await db.studentCompany.create({ data: { studentId: 'u9', companyId: 'emp-x' } });
  await db.studentCompany.create({ data: { studentId: 'u9', companyId: 'emp-demo' } });
  // Regla del 17/11/2026: cada Instructor ve a los estudiantes que registró. u8 no lo registró nadie.
  db.registeredBy('a1', ['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u9']);
  db.registeredBy('i2', ['u7']);
}

describe('B2.1: contrato de autenticación y autorización por empresa (HTTP, base simulada)', () => {
  let db: FakePrisma;
  let t: TestApp;
  const token = async (email: string) =>
    (await request(t.http).post(`${API}/auth/login`).send({ email, password: DEMO_PASSWORD })).body.accessToken as string;
  /** Primero el token y después la petición: supertest no admite dos peticiones abiertas a la vez sobre el mismo servidor. */
  const getUser = async (email: string, id: string, query = '') => {
    const bearer = await token(email);
    return request(t.http).get(`${API}/users/${id}${query}`).set('Authorization', `Bearer ${bearer}`);
  };
  const me = async (email: string) => {
    const bearer = await token(email);
    return request(t.http).get(`${API}/auth/me`).set('Authorization', `Bearer ${bearer}`);
  };

  beforeEach(async () => {
    db = new FakePrisma();
    await scenario(db);
    t = await createTestApp(db);
  });
  afterEach(() => t.close());

  describe('contrato: student.companies', () => {
    it('una empresa: colección con un elemento, sin el campo anterior `company`', async () => {
      const res = await me('ana@ejemplo.test');
      expect(res.status).toBe(200);
      expect(res.body.student).toEqual({
        dni: '00000001',
        companies: [{ id: 'emp-demo', name: 'Empresa de demostración', ruc: '00000000001' }],
      });
      expect(res.body.student).not.toHaveProperty('company');
    });

    it('varias empresas, ordenadas por nombre; sin empresa, colección vacía', async () => {
      const login9 = await request(t.http).post(`${API}/auth/login`).send({ email: 'u9@prueba.test', password: DEMO_PASSWORD });
      expect(login9.status).toBe(200);
      expect(login9.body.user.student.companies.map((c: { id: string }) => c.id)).toEqual(['emp-demo', 'emp-x']);
      const login8 = await request(t.http).post(`${API}/auth/login`).send({ email: 'u8@prueba.test', password: DEMO_PASSWORD });
      expect(login8.status).toBe(200);
      expect(login8.body.user.student).toEqual({ dni: '10000008', companies: [] });
    });

    it('el Instructor no tiene perfil de estudiante (student: null), como en B1.1', async () => {
      expect((await me('admin@ejemplo.test')).body).toMatchObject({ id: 'a1', role: 'INSTRUCTOR', student: null });
    });
  });

  describe('GET /users/:id con alcance por empresa', () => {
    it('el Instructor ve a los estudiantes que registró (regla del 17/11/2026)', async () => {
      expect((await getUser('admin@ejemplo.test', 'u1')).status).toBe(200);
      expect((await getUser('admin@ejemplo.test', 'u9')).status).toBe(200);
      expect((await getUser('i2@prueba.test', 'u7')).status).toBe(200);
      // u9 está en emp-x, como i2, pero lo registró a1: compartir empresa ya no da visibilidad.
      expect((await getUser('i2@prueba.test', 'u9')).status).toBe(404);
    });

    it('un estudiante de una empresa ajena responde 404, igual que uno inexistente', async () => {
      const foreign = await getUser('admin@ejemplo.test', 'u7');
      const missing = await getUser('admin@ejemplo.test', 'no-existe');
      expect(foreign.status).toBe(404);
      expect(missing.status).toBe(404);
      expect(foreign.body).toEqual(missing.body);
      expect((await getUser('i2@prueba.test', 'u1')).status).toBe(404);
    });

    it('un estudiante sin empresa no es visible; un Instructor sin empresas no ve a ningún estudiante', async () => {
      for (const email of ['admin@ejemplo.test', 'i2@prueba.test', 'i3@prueba.test']) {
        expect((await getUser(email, 'u8')).status).toBe(404);
      }
      for (const id of ['u1', 'u7', 'u9']) expect((await getUser('i3@prueba.test', id)).status).toBe(404);
    });

    it('manipular la petición no amplía el alcance: la identidad sale del token', async () => {
      // Parámetros que intentan hacerse pasar por otro Instructor: se ignoran (y los no declarados no se usan).
      expect((await getUser('admin@ejemplo.test', 'u7', '?instructorId=i2')).status).toBe(404);
      expect((await getUser('admin@ejemplo.test', 'u7', '?userId=i2&companyId=emp-x')).status).toBe(404);
      const bearer = await token('admin@ejemplo.test');
      const forgedHeader = await request(t.http).get(`${API}/users/u7`).set('Authorization', `Bearer ${bearer}`).set('X-Instructor-Id', 'i2');
      expect(forgedHeader.status).toBe(404);
    });

    it('un estudiante sigue sin acceso a la ruta (403), aunque consulte a un compañero de su empresa', async () => {
      const res = await getUser('ana@ejemplo.test', 'u2');
      expect(res.status).toBe(403);
    });

    it('el Instructor siempre puede verse a sí mismo y a otros instructores (sin regla por empresa, como en B1.1)', async () => {
      expect((await getUser('i3@prueba.test', 'i3')).status).toBe(200);
      expect((await getUser('admin@ejemplo.test', 'i2')).status).toBe(200);
    });
  });
});

describe('B2.1: semilla de demostración (base simulada)', () => {
  it('crea el perfil del Instructor, su empresa y la empresa de cada estudiante, y es idempotente', async () => {
    const db = new FakePrisma();
    expect(await seedDemo(db as never, DEMO_PASSWORD)).toEqual({
      companies: 1,
      users: 7,
      students: 6,
      instructors: 1,
      studentCompanies: 6,
      instructorCompanies: 1,
    });
    expect(await seedDemo(db as never, DEMO_PASSWORD)).toEqual({
      companies: 0,
      users: 0,
      students: 0,
      instructors: 0,
      studentCompanies: 0,
      instructorCompanies: 0,
    });
    expect(db.instructorCompanies).toEqual([expect.objectContaining({ instructorId: 'a1', companyId: 'emp-demo' })]);
  });

  it('no asigna empresas a un estudiante que ya existía (no reasigna)', async () => {
    const db = new FakePrisma();
    await seedDemo(db as never, DEMO_PASSWORD);
    db.studentCompanies = db.studentCompanies.filter((l) => l.studentId !== 'u1'); // u1 queda sin empresa
    const again = await seedDemo(db as never, DEMO_PASSWORD);
    expect(again.studentCompanies).toBe(0);
    expect(db.studentCompanies.filter((l) => l.studentId === 'u1')).toHaveLength(0);
  });
});

describe('B2.1: integridad simulada de las tablas nuevas', () => {
  it('no se duplican asociaciones ni matrículas, y las claves foráneas se respetan', async () => {
    const db = new FakePrisma();
    await seedDemo(db as never, DEMO_PASSWORD);
    await expect(db.studentCompany.create({ data: { studentId: 'u1', companyId: 'emp-demo' } })).rejects.toMatchObject({ code: 'P2002' });
    await expect(db.instructorCompany.create({ data: { instructorId: 'a1', companyId: 'emp-demo' } })).rejects.toMatchObject({
      code: 'P2002',
    });
    await expect(db.instructorCompany.create({ data: { instructorId: 'u1', companyId: 'emp-demo' } })).rejects.toThrow(/perfil de Instructor/);
    await db.course.create({ data: { id: 'curso-1', name: 'Curso de prueba' } });
    await db.course.create({ data: { id: 'curso-2', name: 'Otro curso de prueba' } });
    await db.enrollment.create({ data: { studentId: 'u1', courseId: 'curso-1' } });
    await db.enrollment.create({ data: { studentId: 'u1', courseId: 'curso-2' } }); // varios cursos por estudiante
    await expect(db.enrollment.create({ data: { studentId: 'u1', courseId: 'curso-1' } })).rejects.toMatchObject({ code: 'P2002' });
    await expect(db.enrollment.create({ data: { studentId: 'u1', courseId: 'no-existe' } })).rejects.toThrow(/curso/);
    expect(await db.enrollment.count({ where: { studentId: 'u1' } })).toBe(2);
  });
});

describe('B2.1: SQL de la migración (inspección estática, sin aplicarla)', () => {
  const sql = readFileSync(MIGRATION, 'utf8')
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n');
  const at = (fragment: string) => {
    const i = sql.indexOf(fragment);
    expect(i, `falta: ${fragment}`).toBeGreaterThanOrEqual(0);
    return i;
  };

  it('copia las asociaciones a student_companies ANTES de retirar students.company_id', () => {
    const create = at('CREATE TABLE `student_companies`');
    const copy = at('INSERT INTO `student_companies` (`student_id`, `company_id`, `assigned_by`, `assigned_at`)');
    const dropFk = at('DROP FOREIGN KEY `students_company_id_fkey`');
    const dropColumn = at('DROP COLUMN `company_id`');
    expect(create).toBeLessThan(copy);
    expect(copy).toBeLessThan(dropFk);
    expect(dropFk).toBeLessThan(dropColumn);
    expect(sql).toMatch(/SELECT `user_id`, `company_id`, NULL, `created_at`\s+FROM `students`;/);
  });

  it('crea el perfil de cada Instructor existente, sin asignarle empresas', () => {
    expect(at('INSERT INTO `instructors`')).toBeLessThan(at('DROP COLUMN `company_id`'));
    expect(sql).toMatch(/FROM `users`\s+WHERE `role` = 'INSTRUCTOR';/);
    expect(sql).not.toMatch(/INSERT INTO `instructor_companies`/);
  });

  it('no borra registros, no crea empresas ni RUC y no reasigna a nadie', () => {
    // «ON DELETE RESTRICT/SET NULL» son reglas de clave foránea, no borrados: se buscan sentencias que modifiquen filas.
    expect(sql).not.toMatch(/\bDELETE\s+FROM\b|\bTRUNCATE\b|DROP TABLE|INSERT INTO `companies`|\bUPDATE\s+`/i);
  });

  it('restricciones: claves compuestas, matrícula única por estudiante y curso, y claves foráneas', () => {
    at('PRIMARY KEY (`student_id`, `company_id`)');
    at('PRIMARY KEY (`instructor_id`, `company_id`)');
    at('UNIQUE INDEX `enrollments_student_id_course_id_key`(`student_id`, `course_id`)');
    at('FOREIGN KEY (`instructor_id`) REFERENCES `instructors`(`user_id`) ON DELETE RESTRICT');
    at('FOREIGN KEY (`student_id`) REFERENCES `students`(`user_id`) ON DELETE RESTRICT');
    at('FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON DELETE RESTRICT');
  });
});
