/**
 * B2.2b: CompaniesService con la base simulada (sin MySQL). Las rutas, permisos y validación HTTP están en
 * test/b2-2b.e2e-spec.ts.
 */
import { ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it } from 'vitest';
import { seedDemo } from '../../../prisma/seed-data.js';
import { FakePrisma } from '../../../test/support/fake-prisma.js';
import { CompanyScopeService } from '../../authz/company-scope.service.js';
import { Role } from '../../generated/prisma/enums.js';
import { CompaniesService, COMPANY_DUPLICATE, COMPANY_NAME_TAKEN, COMPANY_RUC_TAKEN } from './companies.service.js';

const ctx = { actor: { id: 'gadm', role: Role.INSTRUCTOR, sessionVersion: 0, mustChangePassword: false }, ip: '10.0.0.1' };
// RUC: se reutilizan los valores de prueba que ya usaban las pruebas anteriores; no son RUC reales.
const RUC_A = '20123456789';

describe('CompaniesService', () => {
  let db: FakePrisma;
  let service: CompaniesService;

  beforeEach(async () => {
    db = new FakePrisma();
    await seedDemo(db as never, 'demo1234');
    db.auditLogs = [];
    service = new CompaniesService(db as never);
  });

  it('registra una empresa y su bitácora con el actor del contexto', async () => {
    const created = await service.create({ name: 'Empresa X de prueba', ruc: RUC_A, contactEmail: 'contacto@prueba.test' }, ctx);
    expect(created).toMatchObject({ name: 'Empresa X de prueba', ruc: RUC_A, contactEmail: 'contacto@prueba.test', active: true });
    expect(typeof created.createdAt).toBe('string');
    expect(db.auditLogs).toEqual([
      expect.objectContaining({
        action: 'COMPANY_CREATED',
        actorId: 'gadm',
        entity: 'company',
        entityId: created.id,
        ip: '10.0.0.1',
        data: { name: 'Empresa X de prueba', ruc: RUC_A },
      }),
    ]);
  });

  it('sin correo de contacto lo guarda como null', async () => {
    expect((await service.create({ name: 'Sin correo', ruc: RUC_A }, ctx)).contactEmail).toBeNull();
  });

  it('rechaza nombre o RUC repetidos (409), también si solo cambian mayúsculas, sin escribir bitácora', async () => {
    await expect(service.create({ name: 'Empresa de demostración', ruc: RUC_A }, ctx)).rejects.toThrow(COMPANY_NAME_TAKEN);
    await expect(service.create({ name: 'Otra', ruc: '00000000001' }, ctx)).rejects.toThrow(COMPANY_RUC_TAKEN);
    const caseOnly = service.create({ name: 'EMPRESA DE DEMOSTRACIÓN', ruc: RUC_A }, ctx);
    await expect(caseOnly).rejects.toBeInstanceOf(ConflictException);
    await expect(caseOnly).rejects.toThrow(COMPANY_DUPLICATE);
    expect(db.companies).toHaveLength(1);
    expect(db.auditLogs).toHaveLength(0);
  });

  it('lista ordenada por nombre, con búsqueda por nombre o RUC y filtro de estado', async () => {
    await service.create({ name: 'Zeta de prueba', ruc: RUC_A }, ctx);
    expect((await service.list({})).map((c) => c.name)).toEqual(['Empresa de demostración', 'Zeta de prueba']);
    expect((await service.list({ q: 'zeta' })).map((c) => c.ruc)).toEqual([RUC_A]);
    expect((await service.list({ q: '0000001' })).map((c) => c.id)).toEqual(['emp-demo']);
    await service.deactivate('emp-demo', ctx);
    expect((await service.list({ active: true })).map((c) => c.name)).toEqual(['Zeta de prueba']);
    expect((await service.list({ active: false })).map((c) => c.id)).toEqual(['emp-demo']);
  });

  it('detalle; inexistente → 404', async () => {
    expect(await service.findOne('emp-demo')).toMatchObject({ id: 'emp-demo', ruc: '00000000001' });
    await expect(service.findOne('no-existe')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('actualiza solo lo que cambia y registra campos; el correo se registra como cambiado, no su valor', async () => {
    const res = await service.update('emp-demo', { name: 'Empresa renombrada', contactEmail: 'nuevo@prueba.test' }, ctx);
    expect(res).toMatchObject({ name: 'Empresa renombrada', contactEmail: 'nuevo@prueba.test', ruc: '00000000001' });
    expect(db.auditLogs).toEqual([
      expect.objectContaining({
        action: 'COMPANY_UPDATED',
        entityId: 'emp-demo',
        data: { fields: ['name', 'contactEmail'], before: { name: 'Empresa de demostración' }, after: { name: 'Empresa renombrada' } },
      }),
    ]);
    expect(JSON.stringify(db.auditLogs)).not.toContain('nuevo@prueba.test');
  });

  it('sin cambios reales no escribe ni registra; null borra el correo de contacto', async () => {
    await service.update('emp-demo', { name: 'Empresa de demostración', ruc: '00000000001' }, ctx);
    expect(db.auditLogs).toHaveLength(0);
    await service.update('emp-demo', { contactEmail: 'a@prueba.test' }, ctx);
    expect((await service.update('emp-demo', { contactEmail: null }, ctx)).contactEmail).toBeNull();
  });

  it('no permite tomar el nombre o el RUC de otra empresa; inexistente → 404', async () => {
    const other = await service.create({ name: 'Otra empresa de prueba', ruc: RUC_A }, ctx);
    await expect(service.update(other.id, { name: 'Empresa de demostración' }, ctx)).rejects.toThrow(COMPANY_NAME_TAKEN);
    await expect(service.update(other.id, { ruc: '00000000001' }, ctx)).rejects.toThrow(COMPANY_RUC_TAKEN);
    await expect(service.update('no-existe', { name: 'X' }, ctx)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('corrige el RUC (decisión del 12/11/2026) con bitácora del valor anterior y el nuevo', async () => {
    const res = await service.update('emp-demo', { ruc: RUC_A }, ctx);
    expect(res.ruc).toBe(RUC_A);
    expect(db.auditLogs).toEqual([
      expect.objectContaining({
        action: 'COMPANY_UPDATED',
        actorId: 'gadm',
        entityId: 'emp-demo',
        data: { fields: ['ruc'], before: { ruc: '00000000001' }, after: { ruc: RUC_A } },
      }),
    ]);
  });

  it('la corrección del RUC conserva la unicidad (409, sin cambios ni bitácora)', async () => {
    const other = await service.create({ name: 'Otra empresa de prueba', ruc: RUC_A }, ctx);
    db.auditLogs = [];
    await expect(service.update('emp-demo', { ruc: RUC_A }, ctx)).rejects.toThrow(COMPANY_RUC_TAKEN);
    // Sin distinguir mayúsculas (como la intercalación de MySQL): lo detecta el índice único simulado → 409 genérico.
    await service.update(other.id, { ruc: 'ABCDEFGHIJK' }, ctx);
    db.auditLogs = [];
    await expect(service.update('emp-demo', { ruc: 'abcdefghijk' }, ctx)).rejects.toThrow(COMPANY_DUPLICATE);
    expect((await service.findOne('emp-demo')).ruc).toBe('00000000001');
    expect(db.auditLogs).toHaveLength(0);
  });

  it('reactivar conserva todas las asociaciones y el alcance de los Instructores', async () => {
    await db.student.update({ where: { userId: 'u1' }, data: { registeredById: 'a1' } }); // a1 registró a u1
    const before = { students: [...db.studentCompanies], instructors: [...db.instructorCompanies] };
    await service.deactivate('emp-demo', ctx);
    await service.activate('emp-demo', ctx);
    expect(db.studentCompanies).toEqual(before.students);
    expect(db.instructorCompanies).toEqual(before.instructors);
    const a1 = { id: 'a1', role: Role.INSTRUCTOR, sessionVersion: 0, mustChangePassword: false };
    expect(await new CompanyScopeService(db as never).canAccessStudent(a1, 'u1')).toBe(true);
  });

  it('desactiva y reactiva con bitácora; repetir el mismo estado → 409', async () => {
    expect((await service.deactivate('emp-demo', ctx)).active).toBe(false);
    await expect(service.deactivate('emp-demo', ctx)).rejects.toThrow('La empresa ya está desactivada.');
    expect((await service.activate('emp-demo', ctx)).active).toBe(true);
    await expect(service.activate('emp-demo', ctx)).rejects.toThrow('La empresa ya está activa.');
    expect(db.auditLogs.map((a) => a.action)).toEqual(['COMPANY_DEACTIVATED', 'COMPANY_ACTIVATED']);
    await expect(service.deactivate('no-existe', ctx)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('desactivar no borra la empresa ni toca asociaciones, y no cambia el alcance de los Instructores', async () => {
    await db.student.update({ where: { userId: 'u1' }, data: { registeredById: 'a1' } }); // a1 registró a u1
    const links = { students: db.studentCompanies.length, instructors: db.instructorCompanies.length };
    await service.deactivate('emp-demo', ctx);
    expect(db.companies).toHaveLength(1);
    expect(db.studentCompanies).toHaveLength(links.students);
    expect(db.instructorCompanies).toHaveLength(links.instructors);
    const scope = new CompanyScopeService(db as never);
    const a1 = { id: 'a1', role: Role.INSTRUCTOR, sessionVersion: 0, mustChangePassword: false };
    // Decisión del 12/11/2026: se conserva el acceso a los registros existentes (el alcance no cambia).
    expect(await scope.companyIdsOf(a1)).toEqual(['emp-demo']);
    expect(await scope.canAccessStudent(a1, 'u1')).toBe(true);
  });
});
