import { beforeEach, describe, expect, it } from 'vitest';
import { seedDemo } from '../../prisma/seed-data.js';
import { FakePrisma } from '../../test/support/fake-prisma.js';
import { findDemoTraces } from './demo-traces.js';

describe('findDemoTraces (db:check-clean)', () => {
  let db: FakePrisma;
  beforeEach(() => {
    db = new FakePrisma();
  });

  it('una base vacía está limpia', async () => {
    expect(await findDemoTraces(db as never)).toEqual({ clean: true, companies: 0, users: 0, students: 0, sampleUserIds: [] });
  });

  it('una base con datos reales está limpia', async () => {
    await db.company.create({ data: { id: 'c-real', name: 'Constructora Real SAC', ruc: '20123456789' } });
    await db.user.create({ data: { id: 'x1', email: 'jefa@constructora.pe', role: 'INSTRUCTOR', firstNames: 'Rosa', lastNames: 'Real', passwordHash: 'h' } });
    await db.student.create({ data: { userId: 'x1', dni: '45678912' } });
    await db.studentCompany.create({ data: { studentId: 'x1', companyId: 'c-real' } });
    expect((await findDemoTraces(db as never)).clean).toBe(true);
  });

  it('detecta la semilla de demostración completa', async () => {
    await seedDemo(db as never, 'demo1234');
    const traces = await findDemoTraces(db as never);
    expect(traces).toMatchObject({ clean: false, companies: 1, users: 7, students: 6 });
    expect(traces.sampleUserIds).toEqual(['a1', 'u1', 'u2', 'u3', 'u4', 'u5', 'u6']);
  });

  it('detecta cada marca por separado: correo .test, identificador fijo, DNI ficticio y RUC de demostración', async () => {
    await db.company.create({ data: { id: 'otra', name: 'Copia', ruc: '00000000001' } });
    await db.user.create({ data: { id: 'z9', email: 'alguien@EJEMPLO.TEST', role: 'STUDENT', firstNames: 'A', lastNames: 'B', passwordHash: 'h' } });
    await db.user.create({ data: { id: 'u3', email: 'real@empresa.pe', role: 'STUDENT', firstNames: 'C', lastNames: 'D', passwordHash: 'h' } });
    await db.student.create({ data: { userId: 'u3', dni: '00000003' } });
    await db.studentCompany.create({ data: { studentId: 'u3', companyId: 'otra' } });
    expect(await findDemoTraces(db as never)).toMatchObject({ clean: false, companies: 1, users: 2, students: 1 });
  });
});
