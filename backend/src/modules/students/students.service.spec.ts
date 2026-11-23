/**
 * B2.3a: StudentsService (consulta de estudiantes) con la base simulada, sin MySQL.
 * Rutas, roles y validación HTTP: test/b2-3a.e2e-spec.ts.
 */
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it } from 'vitest';
import { seedDemo } from '../../../prisma/seed-data.js';
import { FakePrisma } from '../../../test/support/fake-prisma.js';
import { CompanyScopeService } from '../../authz/company-scope.service.js';
import { Role } from '../../generated/prisma/enums.js';
import { StudentsService } from './students.service.js';

const as = (id: string, role: Role = Role.INSTRUCTOR) => ({ id, role, sessionVersion: 0, mustChangePassword: false });
// RUC: valor de prueba que ya usaban las pruebas anteriores (no es real).
const RUC_A = '20123456789';

/**
 * Semilla: a1 → emp-demo; u1…u6 en emp-demo. Además: emp-x; i2 → emp-x; i3 sin empresas; gadm (administrador) sin
 * empresas; u7 solo en emp-x; u8 sin empresas; u9 en emp-demo y emp-x.
 */
async function scenario(db: FakePrisma) {
  await seedDemo(db as never, 'demo1234');
  await db.company.create({ data: { id: 'emp-x', name: 'Empresa X de prueba', ruc: RUC_A } });
  const user = (id: string, role: 'INSTRUCTOR' | 'STUDENT', firstNames: string, lastNames: string) =>
    db.user.create({ data: { id, email: `${id}@prueba.test`, role, firstNames, lastNames, passwordHash: 'h' } });
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
  // Quién los registró (regla del 17/11/2026): u1…u6 y u9 → a1; u7 → i2; u8 sin registered_by (nadie lo ve).
  for (const id of ['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u9']) await db.student.update({ where: { userId: id }, data: { registeredById: 'a1' } });
  await db.student.update({ where: { userId: 'u7' }, data: { registeredById: 'i2' } });
}

describe('StudentsService (B2.3a)', () => {
  let db: FakePrisma;
  let service: StudentsService;

  beforeEach(async () => {
    db = new FakePrisma();
    await scenario(db);
    service = new StudentsService(db as never, new CompanyScopeService(db as never));
  });

  describe('listado', () => {
    it('solo los estudiantes que registró el Instructor, ordenados por apellidos', async () => {
      const res = await service.list(as('a1'), {});
      expect(res).toMatchObject({ total: 7, page: 1, pageSize: 20 });
      expect(res.items.map((s) => s.id)).toEqual(['u5', 'u2', 'u4', 'u6', 'u1', 'u3', 'u9']);
      expect(res.items.map((s) => s.id)).not.toContain('u7'); // lo registró i2
      expect(res.items.map((s) => s.id)).not.toContain('u8'); // nadie lo registró
      // i2 tiene emp-x, como u9, pero compartir empresa ya no da visibilidad: solo ve a u7.
      expect((await service.list(as('i2'), {})).items.map((s) => s.id)).toEqual(['u7']);
    });

    it('un estudiante sin empresas aparece para quien lo registró, aunque ese Instructor no tenga empresas', async () => {
      await db.student.update({ where: { userId: 'u8' }, data: { registeredById: 'i3' } });
      const res = await service.list(as('i3'), {});
      expect(res.items.map((s) => s.id)).toEqual(['u8']);
      expect(res.items[0].companies).toEqual([]);
    });

    it('sin estudiantes registrados → lista vacía; el administrador general tampoco ve a los que no registró', async () => {
      expect(await service.list(as('i3'), {})).toEqual({ items: [], total: 0, page: 1, pageSize: 20 });
      expect(await service.list(as('gadm'), {})).toEqual({ items: [], total: 0, page: 1, pageSize: 20 });
    });

    it('tener empresas asignadas no da acceso a estudiantes que el Instructor no registró', async () => {
      await db.instructorCompany.create({ data: { instructorId: 'gadm', companyId: 'emp-x' } });
      expect((await service.list(as('gadm'), {})).total).toBe(0);
    });

    it('opción A (20/11/2026): muestra todas las empresas de sus participantes', async () => {
      const u9a1 = (await service.list(as('a1'), { q: 'Omar' })).items[0];
      expect(u9a1.companies.map((c) => c.id)).toEqual(['emp-demo', 'emp-x']); // emp-x no está asignada a a1
    });

    it('busca por nombres, apellidos, correo y DNI (parcial y sin distinguir mayúsculas)', async () => {
      const ids = async (q: string) => (await service.list(as('a1'), { q })).items.map((s) => s.id);
      expect(await ids('carla')).toEqual(['u3']);
      expect(await ids('QUISPE')).toEqual(['u1']);
      expect(await ids('luis@')).toEqual(['u2']);
      expect(await ids('00000004')).toEqual(['u4']);
      expect(await ids('0000000')).toHaveLength(7); // 6 por DNI y u9 por el RUC 00000000001 de su empresa (20/11/2026)
      expect(await ids('Marta')).toEqual([]); // existe, pero fuera del alcance de a1
      expect(await ids('no-coincide')).toEqual([]);
    });

    it('filtra por cualquier empresa existente, solo dentro de sus estudiantes; inexistente → 404', async () => {
      // u7 también está en emp-x, pero lo registró i2: el filtro no amplía el alcance.
      expect((await service.list(as('a1'), { companyId: 'emp-x' })).items.map((s) => s.id)).toEqual(['u9']);
      expect((await service.list(as('i2'), { companyId: 'emp-demo' })).items).toEqual([]); // los de emp-demo son de a1
      expect((await service.list(as('i3'), { companyId: 'emp-x' })).items).toEqual([]);
      await expect(service.list(as('i2'), { companyId: 'no-existe' })).rejects.toBeInstanceOf(NotFoundException);
    });

    it('búsqueda avanzada (20/11/2026): nombre completo, razón social y RUC, sin tildes ni mayúsculas, solo entre sus estudiantes', async () => {
      const ids = async (q: string, who = 'a1') => (await service.list(as(who), { q })).items.map((s) => s.id);
      expect(await ids('ana quispe')).toEqual(['u1']); // nombres y apellidos juntos
      expect(await ids('QUISPE ana')).toEqual(['u1']);
      expect(await ids('Empresa X')).toEqual(['u9']); // razón social de emp-x
      expect(await ids('20123456789')).toEqual(['u9']); // RUC de emp-x
      expect(await ids('omar 20123456789')).toEqual(['u9']);
      expect(await ids('omar carla')).toEqual([]);
      // i2 tiene a u7 en emp-x: no ve a u9 aunque busque por la misma empresa.
      expect(await ids('20123456789', 'i2')).toEqual(['u7']);
    });

    it('pagina con total y orden estables; una página fuera de rango devuelve vacío', async () => {
      const page2 = await service.list(as('a1'), { page: 2, pageSize: 2 });
      expect(page2).toMatchObject({ total: 7, page: 2, pageSize: 2 });
      expect(page2.items.map((s) => s.id)).toEqual(['u4', 'u6']);
      expect((await service.list(as('a1'), { page: 4, pageSize: 2 })).items.map((s) => s.id)).toEqual(['u9']);
      expect(await service.list(as('a1'), { page: 5, pageSize: 2 })).toEqual({ items: [], total: 7, page: 5, pageSize: 2 });
    });

    it('una empresa inactiva sigue mostrando a sus estudiantes (con su estado)', async () => {
      db.companies.find((c) => c.id === 'emp-demo')!.active = false;
      const res = await service.list(as('a1'), {});
      expect(res.total).toBe(7);
      expect(res.items[0].companies).toEqual([expect.objectContaining({ id: 'emp-demo', active: false })]);
    });

    it('un usuario que no es Instructor no tiene alcance (403)', async () => {
      await expect(service.list(as('u1', Role.STUDENT), {})).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('detalle', () => {
    it('estudiante propio: solo campos de la lista blanca y todas sus empresas', async () => {
      const res = await service.findOne(as('a1'), 'u9');
      expect(res).toEqual({
        id: 'u9',
        email: 'u9@prueba.test',
        firstNames: 'Omar',
        lastNames: 'Zapata Prueba',
        fullName: 'Omar Zapata Prueba',
        dni: '10000009',
        whatsapp: null,
        active: true,
        activationPending: false,
        companies: [
          { id: 'emp-demo', name: 'Empresa de demostración', ruc: '00000000001', active: true },
          { id: 'emp-x', name: 'Empresa X de prueba', ruc: '20123456789', active: true },
        ],
      });
    });

    it('ajeno, sin empresas, inexistente o que no es estudiante → el mismo 404', async () => {
      const message = async (id: string) => {
        try {
          await service.findOne(as('a1'), id);
          return 'sin error';
        } catch (error) {
          expect(error).toBeInstanceOf(NotFoundException);
          return (error as NotFoundException).message;
        }
      };
      const expected = 'No se encontró el estudiante.';
      expect(await message('u7')).toBe(expected);
      expect(await message('u8')).toBe(expected);
      expect(await message('no-existe')).toBe(expected);
      expect(await message('i2')).toBe(expected);
    });
  });
});
