/**
 * B2.3b: asignación y retiro de empresas de estudiantes (StudentsService) con la base simulada, sin MySQL.
 * Rutas, roles y validación HTTP: test/b2-3b.e2e-spec.ts.
 */
import { ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it } from 'vitest';
import { seedDemo } from '../../../prisma/seed-data.js';
import { FakePrisma } from '../../../test/support/fake-prisma.js';
import { CompanyScopeService, STUDENT_NOT_FOUND } from '../../authz/company-scope.service.js';
import { Role } from '../../generated/prisma/enums.js';
import { LAST_COMPANY, STUDENT_COMPANY_NOT_FOUND, STUDENT_INACTIVE, StudentsService } from './students.service.js';

const as = (id: string) => ({ id, role: Role.INSTRUCTOR, sessionVersion: 0, mustChangePassword: false });
const ctx = (id = 'a1') => ({ actor: as(id), ip: '10.0.0.1' });
// RUC: valores de prueba ya usados en pruebas anteriores, y un marcador claramente no real.
const RUC_A = '20123456789';
const RUC_MARKER = 'ABC-1234567';

/** a1 → emp-demo y emp-y; i2 → emp-x. u1…u6 en emp-demo; u7 solo en emp-x; u8 sin empresas; u9 en emp-demo y emp-x. */
async function scenario(db: FakePrisma) {
  await seedDemo(db as never, 'demo1234');
  await db.company.create({ data: { id: 'emp-x', name: 'Empresa X de prueba', ruc: RUC_A } });
  await db.company.create({ data: { id: 'emp-y', name: 'Empresa Y de prueba', ruc: RUC_MARKER } });
  await db.user.create({ data: { id: 'i2', email: 'i2@prueba.test', role: 'INSTRUCTOR', firstNames: 'I', lastNames: 'Dos', passwordHash: 'h' } });
  await db.instructor.create({ data: { userId: 'i2' } });
  await db.instructorCompany.create({ data: { instructorId: 'i2', companyId: 'emp-x' } });
  await db.instructorCompany.create({ data: { instructorId: 'a1', companyId: 'emp-y' } });
  for (const [id, dni] of [['u7', '10000007'], ['u8', '10000008'], ['u9', '10000009']] as const) {
    await db.user.create({ data: { id, email: `${id}@prueba.test`, role: 'STUDENT', firstNames: 'E', lastNames: id, passwordHash: 'h' } });
    await db.student.create({ data: { userId: id, dni } });
  }
  await db.studentCompany.create({ data: { studentId: 'u7', companyId: 'emp-x' } });
  await db.studentCompany.create({ data: { studentId: 'u9', companyId: 'emp-x' } });
  await db.studentCompany.create({ data: { studentId: 'u9', companyId: 'emp-demo' } });
  // Quién los registró (regla del 17/11/2026): u1…u6 y u9 → a1; u7 → i2; u8 sin registered_by.
  for (const id of ['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u9']) await db.student.update({ where: { userId: id }, data: { registeredById: 'a1' } });
  await db.student.update({ where: { userId: 'u7' }, data: { registeredById: 'i2' } });
  db.auditLogs = [];
}

const linksOf = (db: FakePrisma, studentId: string) =>
  db.studentCompanies
    .filter((l) => l.studentId === studentId)
    .map((l) => String(l.companyId))
    .sort((a, b) => a.localeCompare(b));

describe('StudentsService: empresas de estudiantes (B2.3b)', () => {
  let db: FakePrisma;
  let service: StudentsService;

  beforeEach(async () => {
    db = new FakePrisma();
    await scenario(db);
    service = new StudentsService(db as never, new CompanyScopeService(db as never));
  });

  describe('asignar', () => {
    it('asigna una empresa propia, con actor del contexto y bitácora sin datos personales', async () => {
      const res = await service.assignCompanies('u1', { companyIds: ['emp-y'] }, ctx());
      expect(res.created).toEqual(['emp-y']);
      expect(res.alreadyAssigned).toEqual([]);
      expect(res.student.companies.map((c) => c.id)).toEqual(['emp-demo', 'emp-y']);
      expect(db.studentCompanies.find((l) => l.studentId === 'u1' && l.companyId === 'emp-y')!.assignedById).toBe('a1');
      expect(db.auditLogs).toEqual([
        expect.objectContaining({
          action: 'STUDENT_COMPANY_ASSIGNED',
          actorId: 'a1',
          entity: 'student',
          entityId: 'u1',
          ip: '10.0.0.1',
          data: { companyId: 'emp-y', operation: 'assign' },
        }),
      ]);
      const raw = JSON.stringify(db.auditLogs);
      for (const personal of ['ana@ejemplo.test', '00000001', 'Torres']) expect(raw).not.toContain(personal);
    });

    it('varias empresas propias: no duplica las existentes e ignora los repetidos de la solicitud', async () => {
      const res = await service.assignCompanies('u1', { companyIds: ['emp-demo', 'emp-y', 'emp-y'] }, ctx());
      expect(res).toMatchObject({ created: ['emp-y'], alreadyAssigned: ['emp-demo'] });
      expect(linksOf(db, 'u1')).toEqual(['emp-demo', 'emp-y']);
      expect(db.auditLogs).toHaveLength(1);
      const again = await service.assignCompanies('u1', { companyIds: ['emp-demo', 'emp-y'] }, ctx());
      expect(again).toMatchObject({ created: [], alreadyAssigned: ['emp-demo', 'emp-y'] });
      expect(db.auditLogs).toHaveLength(1);
    });

    it('estudiante fuera del alcance o sin empresas → 404', async () => {
      await expect(service.assignCompanies('u7', { companyIds: ['emp-demo'] }, ctx())).rejects.toThrow(STUDENT_NOT_FOUND);
      await expect(service.assignCompanies('u8', { companyIds: ['emp-demo'] }, ctx())).rejects.toThrow(STUDENT_NOT_FOUND);
      await expect(service.assignCompanies('no-existe', { companyIds: ['emp-demo'] }, ctx())).rejects.toBeInstanceOf(NotFoundException);
    });

    it('empresa inexistente → 404 y no se crea ninguna asociación', async () => {
      await expect(service.assignCompanies('u1', { companyIds: ['emp-y', 'no-existe'] }, ctx())).rejects.toBeInstanceOf(NotFoundException);
      expect(linksOf(db, 'u1')).toEqual(['emp-demo']);
      expect(db.auditLogs).toHaveLength(0);
    });

    it('opción A (20/11/2026): asigna a su participante una empresa activa que no está asignada al Instructor', async () => {
      await service.assignCompanies('u1', { companyIds: ['emp-x'] }, ctx()); // emp-x no es de a1
      expect(linksOf(db, 'u1')).toEqual(['emp-demo', 'emp-x']);
      await expect(service.findOne(as('i2'), 'u1')).rejects.toThrow(STUDENT_NOT_FOUND); // i2 tiene emp-x, pero no lo registró
    });

    it('empresa inactiva → 409 para toda la solicitud', async () => {
      db.companies.find((c) => c.id === 'emp-y')!.active = false;
      const attempt = service.assignCompanies('u1', { companyIds: ['emp-demo', 'emp-y'] }, ctx());
      await expect(attempt).rejects.toBeInstanceOf(ConflictException);
      await expect(attempt).rejects.toThrow('La empresa «Empresa Y de prueba» está desactivada y no admite nuevas asignaciones.');
      expect(linksOf(db, 'u1')).toEqual(['emp-demo']);
    });

    it('estudiante con la cuenta inactiva → 409', async () => {
      db.userByEmail('ana@ejemplo.test').active = false;
      await expect(service.assignCompanies('u1', { companyIds: ['emp-y'] }, ctx())).rejects.toThrow(STUDENT_INACTIVE);
      expect(linksOf(db, 'u1')).toEqual(['emp-demo']);
    });

    it('es atómica: un fallo en la segunda escritura no deja ninguna asociación ni bitácora', async () => {
      await db.studentCompany.delete({ where: { studentId_companyId: { studentId: 'u9', companyId: 'emp-demo' } } });
      await db.instructorCompany.create({ data: { instructorId: 'a1', companyId: 'emp-x' } }); // a1 ve a u9 por emp-x
      const original = db.studentCompany.create;
      let calls = 0;
      db.studentCompany.create = async (args) => {
        if (++calls === 2) throw new Error('fallo simulado de la base');
        return original(args);
      };
      await expect(service.assignCompanies('u9', { companyIds: ['emp-demo', 'emp-y'] }, ctx())).rejects.toThrow('fallo simulado');
      expect(linksOf(db, 'u9')).toEqual(['emp-x']);
      expect(db.auditLogs).toHaveLength(0);
    });

    it('una carrera por clave duplicada responde 409 sin aplicar nada', async () => {
      db.studentCompany.create = async () => {
        throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
      };
      await expect(service.assignCompanies('u1', { companyIds: ['emp-y'] }, ctx())).rejects.toThrow(/Vuelve a intentarlo/);
      expect(db.auditLogs).toHaveLength(0);
    });
  });

  describe('retirar', () => {
    it('retira una asociación propia; conserva el acceso si comparte otra empresa', async () => {
      await service.assignCompanies('u1', { companyIds: ['emp-y'] }, ctx());
      db.auditLogs = [];
      const res = await service.removeCompany('u1', 'emp-y', ctx());
      expect(res).toEqual({ studentId: 'u1', companyId: 'emp-y', stillVisible: true });
      expect(linksOf(db, 'u1')).toEqual(['emp-demo']);
      expect(db.auditLogs).toEqual([
        expect.objectContaining({
          action: 'STUDENT_COMPANY_REMOVED',
          actorId: 'a1',
          entity: 'student',
          entityId: 'u1',
          ip: '10.0.0.1',
          data: { companyId: 'emp-y', operation: 'remove' },
        }),
      ]);
    });

    it('retirar su última empresa propia NO quita el acceso (lo registró), ni borra al estudiante ni sus datos', async () => {
      await db.course.create({ data: { id: 'curso-1', name: 'Curso de prueba' } });
      await db.enrollment.create({ data: { studentId: 'u9', courseId: 'curso-1' } });
      const res = await service.removeCompany('u9', 'emp-demo', ctx());
      // Regla del 17/11/2026: la visibilidad depende de quién lo registró, no de las empresas compartidas.
      expect(res.stillVisible).toBe(true);
      expect(linksOf(db, 'u9')).toEqual(['emp-x']); // conserva su otra empresa
      expect(db.users.some((u) => u.id === 'u9')).toBe(true);
      expect(db.students.some((s) => s.userId === 'u9')).toBe(true);
      expect(db.enrollments.filter((e) => e.studentId === 'u9')).toHaveLength(1);
      // Opción A (20/11/2026): se muestran todas las empresas de su participante.
      expect((await service.findOne(as('a1'), 'u9')).companies.map((c) => c.id)).toEqual(['emp-x']);
      await expect(service.findOne(as('i2'), 'u9')).rejects.toThrow(STUDENT_NOT_FOUND); // i2 no lo registró
    });

    it('la última asociación no se puede retirar (409) y queda intacta', async () => {
      await expect(service.removeCompany('u1', 'emp-demo', ctx())).rejects.toThrow(LAST_COMPANY);
      expect(linksOf(db, 'u1')).toEqual(['emp-demo']);
      expect(db.auditLogs).toHaveLength(0);
    });

    it('se puede retirar la asociación con una empresa inactiva', async () => {
      await service.assignCompanies('u1', { companyIds: ['emp-y'] }, ctx());
      db.companies.find((c) => c.id === 'emp-y')!.active = false;
      await expect(service.removeCompany('u1', 'emp-y', ctx())).resolves.toMatchObject({ stillVisible: true });
      expect(linksOf(db, 'u1')).toEqual(['emp-demo']);
    });

    it('empresa inexistente → 404; asociación inexistente → 404; estudiante ajeno → 404', async () => {
      await expect(service.removeCompany('u1', 'no-existe', ctx())).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.removeCompany('u1', 'emp-y', ctx())).rejects.toThrow(STUDENT_COMPANY_NOT_FOUND);
      await expect(service.removeCompany('u7', 'emp-demo', ctx())).rejects.toThrow(STUDENT_NOT_FOUND);
      expect(linksOf(db, 'u9')).toEqual(['emp-demo', 'emp-x']);
    });

    it('dos retiros simultáneos de las dos últimas empresas: solo uno prospera y queda al menos una', async () => {
      await service.assignCompanies('u1', { companyIds: ['emp-y'] }, ctx());
      db.auditLogs = [];
      const results = await Promise.allSettled([service.removeCompany('u1', 'emp-demo', ctx()), service.removeCompany('u1', 'emp-y', ctx())]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
      expect(rejected.reason).toBeInstanceOf(ConflictException);
      expect(linksOf(db, 'u1')).toHaveLength(1);
      expect(db.auditLogs).toHaveLength(1);
    });
  });

  describe('protección ante concurrencia (lo que el código pide a la base)', () => {
    it('cada escritura usa READ COMMITTED y bloquea la fila del estudiante como PRIMERA sentencia', async () => {
      const order: string[] = [];
      const tracked = <K extends 'findUnique' | 'count' | 'findMany' | 'delete' | 'create'>(model: Record<K, (...a: never[]) => unknown>, name: K) => {
        const original = model[name];
        model[name] = ((...args: never[]) => {
          order.push(name);
          return original(...args);
        }) as never;
      };
      const originalRaw = db.$queryRaw.bind(db);
      db.$queryRaw = ((strings: TemplateStringsArray, ...values: unknown[]) => {
        order.push('lock');
        return originalRaw(strings, ...values);
      }) as typeof db.$queryRaw;
      await service.assignCompanies('u1', { companyIds: ['emp-y'] }, ctx());
      tracked(db.studentCompany as never, 'count');
      tracked(db.studentCompany as never, 'delete');
      order.length = 0;
      const optionsBefore = db.transactionOptions.length;
      await service.removeCompany('u1', 'emp-y', ctx());

      expect(db.transactionOptions.slice(optionsBefore)).toEqual([{ isolationLevel: 'ReadCommitted' }]);
      expect(db.transactionOptions.every((o) => o?.isolationLevel === 'ReadCommitted')).toBe(true);
      expect(order[0]).toBe('lock');
      expect(order.indexOf('lock')).toBeLessThan(order.indexOf('count'));
      expect(order.indexOf('count')).toBeLessThan(order.indexOf('delete'));
      expect(db.rawQueries.at(-1)).toEqual({ sql: 'SELECT user_id FROM students WHERE user_id = ? FOR UPDATE', values: ['u1'] });
    });
  });
});
