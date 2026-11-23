/**
 * Certificados del Instructor con filtros (20/11/2026) y validación pública por DNI, integración HTTP con la base
 * simulada (sin MySQL): estudiante (nombre, apellido, completo, parcial, sin mayúsculas ni tildes), código parcial,
 * empresa, fechas, combinación de filtros, aislamiento por `registered_by` (la empresa no amplía el alcance) y campos
 * mínimos de la consulta pública.
 */
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDemo } from '../prisma/seed-data.js';
import { FakePrisma } from './support/fake-prisma.js';
import { createTestApp, DEMO_PASSWORD, type TestApp } from './support/test-app.js';

const API = '/api/v1';
const INSTRUCTOR = 'admin@ejemplo.test'; // a1
const OTHER = 'i2@prueba.test'; // i2

describe('Certificados del Instructor: filtros y aislamiento (HTTP, base simulada)', () => {
  let db: FakePrisma;
  let t: TestApp;
  const tokens = new Map<string, string>();
  const get = async (email: string, path: string) => {
    if (!tokens.has(email)) {
      const res = await request(t.http).post(`${API}/auth/login`).send({ email, password: DEMO_PASSWORD });
      tokens.set(email, res.body.accessToken as string);
    }
    return request(t.http).get(`${API}${path}`).set('Authorization', `Bearer ${tokens.get(email)!}`);
  };
  const codes = async (email: string, query = '') => {
    const res = await get(email, `/certificates${query}`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return (res.body as { code: string }[]).map((c) => c.code).sort();
  };

  const cert = (code: string, studentId: string, courseId: string, participantName: string, dni: string, issue: string, status = 'VIGENTE') => ({
    data: {
      id: `id-${code}`,
      code,
      studentId,
      courseId,
      attemptId: `att-${code}`,
      participantName,
      participantDni: dni,
      courseName: courseId === 'c-i2' ? 'Curso del otro Instructor' : 'Trabajo en altura',
      approvalDate: new Date(`${issue}T15:00:00Z`),
      issueDate: new Date(`${issue}T15:00:00Z`),
      score: 18,
      scaleMax: 20,
      trainingHours: 8,
      entityName: 'IMC',
      status,
    },
  });

  beforeEach(async () => {
    db = new FakePrisma();
    await seedDemo(db as never, DEMO_PASSWORD);
    const passwordHash = db.userByEmail(INSTRUCTOR).passwordHash;
    await db.user.create({ data: { id: 'i2', email: OTHER, role: 'INSTRUCTOR', firstNames: 'Otro', lastNames: 'Instructor', passwordHash } });
    await db.instructor.create({ data: { userId: 'i2' } });
    db.registeredBy('a1', ['u1', 'u2']);
    db.registeredBy('i2', ['u3']); // u3 comparte la empresa de demostración con u1 y u2
    await db.company.create({ data: { id: 'emp-b', name: 'Constructora Beta', ruc: '20100000002' } });
    await db.studentCompany.create({ data: { studentId: 'u2', companyId: 'emp-b' } });
    await db.course.create({ data: { id: 'c-a1', name: 'Trabajo en altura', createdById: 'a1', status: 'PUBLICADO' } });
    await db.course.create({ data: { id: 'c-i2', name: 'Curso del otro Instructor', createdById: 'i2', status: 'PUBLICADO' } });
    await db.certificate.create(cert('IMC-2026-0001', 'u1', 'c-a1', 'Ana María Torres', '00000001', '2026-11-05'));
    await db.certificate.create(cert('IMC-2026-0002', 'u2', 'c-a1', 'Luis Pérez Gómez', '00000002', '2026-11-20', 'REVOCADO'));
    await db.certificate.create(cert('IMC-2025-0003', 'u1', 'c-a1', 'Ana María Torres', '00000001', '2025-12-01'));
    // u3 lo registró i2: aunque el curso sea de a1 y comparta empresa, a1 no lo ve.
    await db.certificate.create(cert('IMC-2026-0004', 'u3', 'c-a1', 'Rosa Quispe', '00000003', '2026-11-10'));
    await db.certificate.create(cert('IMC-2026-0005', 'u3', 'c-i2', 'Rosa Quispe', '00000003', '2026-11-11'));
    tokens.clear();
    t = await createTestApp(db);
  });
  afterEach(() => t.close());

  it('sin filtros: solo cursos propios y participantes registrados por el Instructor, con sus empresas', async () => {
    expect(await codes(INSTRUCTOR)).toEqual(['IMC-2025-0003', 'IMC-2026-0001', 'IMC-2026-0002']);
    const luis = ((await get(INSTRUCTOR, '/certificates?code=0002')).body as { companies: { name: string }[]; status: string }[])[0];
    expect(luis.companies.map((c) => c.name)).toEqual(['Constructora Beta', 'Empresa de demostración']);
    expect(luis.status).toBe('revocado');
  });

  it('por estudiante: nombre, apellido, nombre completo, parcial, sin mayúsculas ni tildes', async () => {
    expect(await codes(INSTRUCTOR, '?student=ana')).toEqual(['IMC-2025-0003', 'IMC-2026-0001']);
    expect(await codes(INSTRUCTOR, '?student=TORRES')).toEqual(['IMC-2025-0003', 'IMC-2026-0001']);
    expect(await codes(INSTRUCTOR, '?student=perez')).toEqual(['IMC-2026-0002']);
    expect(await codes(INSTRUCTOR, `?student=${encodeURIComponent('luis pérez')}`)).toEqual(['IMC-2026-0002']);
    expect(await codes(INSTRUCTOR, '?student=gom')).toEqual(['IMC-2026-0002']);
    expect(await codes(INSTRUCTOR, '?student=rosa')).toEqual([]); // ajena
  });

  it('por código (completo o parcial), empresa y fechas; los filtros se combinan', async () => {
    expect(await codes(INSTRUCTOR, '?code=imc-2026-0001')).toEqual(['IMC-2026-0001']);
    expect(await codes(INSTRUCTOR, '?code=2026')).toEqual(['IMC-2026-0001', 'IMC-2026-0002']);
    expect(await codes(INSTRUCTOR, '?companyId=emp-b')).toEqual(['IMC-2026-0002']);
    expect(await codes(INSTRUCTOR, '?companyId=emp-demo')).toEqual(['IMC-2025-0003', 'IMC-2026-0001', 'IMC-2026-0002']);
    expect(await codes(INSTRUCTOR, '?from=2026-11-01&to=2026-11-19')).toEqual(['IMC-2026-0001']);
    expect(await codes(INSTRUCTOR, '?to=2025-12-31')).toEqual(['IMC-2025-0003']);
    expect(await codes(INSTRUCTOR, '?companyId=emp-demo&student=ana&code=IMC-2026&from=2026-11-01&to=2026-11-30')).toEqual(['IMC-2026-0001']);
    expect(await codes(INSTRUCTOR, '?companyId=emp-b&student=ana')).toEqual([]);
    expect(await codes(INSTRUCTOR, '?courseId=c-i2')).toEqual([]); // curso ajeno
    expect((await get(INSTRUCTOR, '/certificates?from=05/11/2026')).status).toBe(400);
  });

  it('la empresa no amplía el alcance: el otro Instructor solo ve a su participante', async () => {
    expect(await codes(OTHER, '?companyId=emp-demo')).toEqual(['IMC-2026-0005']);
    expect(await codes(OTHER, '?student=ana')).toEqual([]);
    expect(await codes(INSTRUCTOR, '?companyId=emp-demo&student=rosa')).toEqual([]);
  });

  it('validación pública por DNI: sin sesión, solo titular, curso, código, emisión y estado', async () => {
    const res = await request(t.http).get(`${API}/public/certificates/dni/00000001`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    for (const c of res.body as Record<string, unknown>[]) {
      expect(Object.keys(c).sort()).toEqual(['code', 'courseName', 'id', 'issueDate', 'participantName', 'status']);
    }
    expect((res.body as { code: string }[]).map((c) => c.code)).toEqual(['IMC-2026-0001', 'IMC-2025-0003']); // más reciente primero
    const revoked = await request(t.http).get(`${API}/public/certificates/dni/00000002`);
    expect(revoked.body).toEqual([{ id: 'IMC-2026-0002', code: 'IMC-2026-0002', participantName: 'Luis Pérez Gómez', courseName: 'Trabajo en altura', issueDate: '2026-11-20', status: 'revocado' }]);
    expect((await request(t.http).get(`${API}/public/certificates/dni/99999999`)).body).toEqual([]);
    expect((await request(t.http).get(`${API}/public/certificates/dni/1234`)).body).toEqual([]);
  });
});
