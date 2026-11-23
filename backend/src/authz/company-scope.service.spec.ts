import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it } from 'vitest';
import { seedDemo } from '../../prisma/seed-data.js';
import { FakePrisma } from '../../test/support/fake-prisma.js';
import type { AuthUser } from '../common/auth-user.js';
import { COMPANY_NOT_FOUND, CompanyScopeService, STUDENT_NOT_FOUND, studentsInCompanies } from './company-scope.service.js';

/**
 * B2.1: autorización por empresa con la base simulada (sin MySQL). La identidad viene siempre del usuario
 * autenticado (`AuthUser`); el servicio no recibe ningún identificador de Instructor desde el cliente.
 */
const actor = (id: string, role: 'INSTRUCTOR' | 'STUDENT' = 'INSTRUCTOR'): AuthUser => ({
  id,
  role,
  sessionVersion: 0,
  mustChangePassword: false,
});

/** Datos de prueba: el RUC repite el valor de prueba que ya usaban las pruebas de B1.1 (no es un RUC real). */
async function scenario(db: FakePrisma) {
  await seedDemo(db as never, 'demo1234'); // a1 → emp-demo; u1…u6 → emp-demo
  await db.company.create({ data: { id: 'emp-x', name: 'Empresa X de prueba', ruc: '20123456789' } });
  const user = (id: string, role: 'INSTRUCTOR' | 'STUDENT') =>
    db.user.create({ data: { id, email: `${id}@prueba.test`, role, firstNames: 'N', lastNames: 'A', passwordHash: 'h' } });
  // i2: Instructor solo de emp-x. i3: Instructor sin empresas.
  await user('i2', 'INSTRUCTOR');
  await db.instructor.create({ data: { userId: 'i2' } });
  await db.instructorCompany.create({ data: { instructorId: 'i2', companyId: 'emp-x' } });
  await user('i3', 'INSTRUCTOR');
  await db.instructor.create({ data: { userId: 'i3' } });
  // u7: solo emp-x. u8: sin empresa. u9: emp-demo y emp-x.
  for (const [id, dni] of [['u7', '10000007'], ['u8', '10000008'], ['u9', '10000009']] as const) {
    await user(id, 'STUDENT');
    await db.student.create({ data: { userId: id, dni } });
  }
  await db.studentCompany.create({ data: { studentId: 'u7', companyId: 'emp-x' } });
  await db.studentCompany.create({ data: { studentId: 'u9', companyId: 'emp-demo' } });
  await db.studentCompany.create({ data: { studentId: 'u9', companyId: 'emp-x' } });
  // Quién registró a cada uno (regla del 17/11/2026): u1 y u9 → a1; u7 → i2; u8 (sin empresa) → i3.
  // u2…u6 quedan sin registered_by, como los estudiantes existentes en las bases migradas.
  for (const [studentId, by] of [['u1', 'a1'], ['u9', 'a1'], ['u7', 'i2'], ['u8', 'i3']] as const) {
    await db.student.update({ where: { userId: studentId }, data: { registeredById: by } });
  }
}

describe('CompanyScopeService (visibilidad por quien registró; empresas para asignar)', () => {
  let db: FakePrisma;
  let scope: CompanyScopeService;

  beforeEach(async () => {
    db = new FakePrisma();
    await scenario(db);
    scope = new CompanyScopeService(db as never);
  });

  it('obtiene las empresas del Instructor autenticado; uno sin empresas no tiene ninguna', async () => {
    expect(await scope.companyIdsOf(actor('a1'))).toEqual(['emp-demo']);
    expect(await scope.companyIdsOf(actor('i2'))).toEqual(['emp-x']);
    expect(await scope.companyIdsOf(actor('i3'))).toEqual([]);
  });

  it('un estudiante autenticado no tiene alcance de Instructor (403)', async () => {
    await expect(scope.companyIdsOf(actor('u1', 'STUDENT'))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(scope.assertStudentInScope(actor('u1', 'STUDENT'), 'u2')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('cada Instructor solo ve a los estudiantes que registró', async () => {
    expect(await scope.canAccessStudent(actor('a1'), 'u1')).toBe(true);
    expect(await scope.canAccessStudent(actor('a1'), 'u7')).toBe(false); // lo registró i2
    expect(await scope.canAccessStudent(actor('i2'), 'u7')).toBe(true);
    expect(await scope.canAccessStudent(actor('i2'), 'u1')).toBe(false); // lo registró a1
  });

  it('compartir una empresa ya NO da visibilidad: u9 (emp-demo y emp-x) solo lo ve a1, que lo registró', async () => {
    expect(await scope.canAccessStudent(actor('a1'), 'u9')).toBe(true);
    expect(await scope.canAccessStudent(actor('i2'), 'u9')).toBe(false); // i2 tiene emp-x, pero no lo registró
    expect(await scope.canAccessStudent(actor('i3'), 'u9')).toBe(false);
  });

  it('un estudiante sin empresa es visible para quien lo registró, aunque ese Instructor no tenga empresas', async () => {
    expect(await scope.canAccessStudent(actor('i3'), 'u8')).toBe(true);
    for (const id of ['a1', 'i2']) expect(await scope.canAccessStudent(actor(id), 'u8')).toBe(false);
  });

  it('un estudiante sin registered_by (existente antes de la regla) no es visible para ningún Instructor', async () => {
    // u2 pertenece a emp-demo, que es de a1: aun así a1 no lo ve (no se asignan automáticamente).
    for (const id of ['a1', 'i2', 'i3']) expect(await scope.canAccessStudent(actor(id), 'u2')).toBe(false);
  });

  it('fuera del alcance responde 404 con el mismo mensaje que un estudiante inexistente', async () => {
    const foreign = await scope.assertStudentInScope(actor('a1'), 'u7').catch((e) => e);
    const missing = await scope.assertStudentInScope(actor('a1'), 'no-existe').catch((e) => e);
    expect(foreign).toBeInstanceOf(NotFoundException);
    expect(missing).toBeInstanceOf(NotFoundException);
    expect(foreign.message).toBe(STUDENT_NOT_FOUND);
    expect(missing.message).toBe(foreign.message);
    await expect(scope.assertStudentInScope(actor('a1'), 'u1')).resolves.toBeUndefined();
  });

  it('opción A (20/11/2026): para asignar basta que las empresas existan; una inexistente rechaza la operación completa', async () => {
    await expect(scope.assertCompaniesInScope(actor('a1'), ['emp-demo', 'emp-demo'])).resolves.toBeUndefined();
    await expect(scope.assertCompaniesInScope(actor('a1'), ['emp-demo', 'emp-x'])).resolves.toBeUndefined(); // emp-x no es de a1
    await expect(scope.assertCompaniesInScope(actor('i3'), ['emp-demo'])).resolves.toBeUndefined(); // i3 no tiene empresas
    await expect(scope.assertCompaniesInScope(actor('a1'), ['emp-demo', 'no-existe'])).rejects.toThrow(COMPANY_NOT_FOUND);
    await expect(scope.assertCompaniesInScope(actor('a1'), ['no-existe'])).rejects.toBeInstanceOf(NotFoundException);
    await expect(scope.assertCompaniesInScope(actor('u1', 'STUDENT'), ['emp-demo'])).rejects.toBeInstanceOf(ForbiddenException);
    // Elegir empresas no cambia la visibilidad de participantes (registered_by).
    expect(await scope.canAccessStudent(actor('i3'), 'u1')).toBe(false);
  });

  it('el filtro de listado solo coincide con estudiantes de las empresas indicadas', () => {
    expect(studentsInCompanies(['emp-demo'])).toEqual({ companies: { some: { companyId: { in: ['emp-demo'] } } } });
    expect(studentsInCompanies([])).toEqual({ companies: { some: { companyId: { in: [] } } } });
  });
});
