import { describe, expect, it, vi } from 'vitest';
import { seedDemo } from '../../prisma/seed-data.js';
import { FakePrisma } from '../../test/support/fake-prisma.js';
import { assertSeedAllowed, seedConfigProblems, SeedRefusedError } from './seed-guard.js';

const OK = { nodeEnv: 'development', databaseName: 'aula_imc_dev', seedDemoAllowed: 'true' };

describe('seedConfigProblems (sin tocar la base)', () => {
  it('admite la configuración local de desarrollo y de pruebas', () => {
    expect(seedConfigProblems(OK)).toEqual([]);
    expect(seedConfigProblems({ ...OK, databaseName: 'aula_imc_test', nodeEnv: 'test' })).toEqual([]);
  });

  it('rechaza NODE_ENV=production', () => {
    expect(seedConfigProblems({ ...OK, nodeEnv: 'production' }).join()).toMatch(/NODE_ENV=production/);
  });

  it('rechaza una base cuyo nombre no termina en _dev ni _test, aunque NODE_ENV no sea production', () => {
    for (const name of ['aula_imc', 'aula_imc_prod', 'produccion', 'aula_imc_dev_copia']) {
      expect(seedConfigProblems({ ...OK, databaseName: name }).join()).toMatch(/no termina en _dev ni en _test/);
    }
  });

  it('exige SEED_DEMO_ALLOWED=true', () => {
    for (const value of [undefined, '', 'false', '1', 'si']) {
      expect(seedConfigProblems({ ...OK, seedDemoAllowed: value }).join()).toMatch(/SEED_DEMO_ALLOWED=true/);
    }
    expect(seedConfigProblems({ ...OK, seedDemoAllowed: ' TRUE ' })).toEqual([]);
  });

  it('informa todos los motivos a la vez', () => {
    expect(seedConfigProblems({ nodeEnv: 'production', databaseName: 'aula_imc', seedDemoAllowed: undefined })).toHaveLength(3);
  });
});

describe('assertSeedAllowed', () => {
  it('con una configuración inválida no llega a conectarse a la base', async () => {
    const connect = vi.fn();
    await expect(assertSeedAllowed({ ...OK, nodeEnv: 'production' }, connect)).rejects.toBeInstanceOf(SeedRefusedError);
    expect(connect).not.toHaveBeenCalled();
  });

  it('admite una base vacía o que solo tiene datos de demostración', async () => {
    const db = new FakePrisma();
    expect(await assertSeedAllowed(OK, () => db as never)).toBe(db);
    await seedDemo(db as never, 'demo1234');
    expect(await assertSeedAllowed(OK, () => db as never)).toBe(db);
  });

  it('rechaza una base con usuarios reales y no escribe nada', async () => {
    const db = new FakePrisma();
    await db.user.create({ data: { email: 'instructora@empresa.pe', role: 'INSTRUCTOR', firstNames: 'A', lastNames: 'B', passwordHash: 'h' } });
    const disconnect = vi.spyOn(db, '$disconnect');
    await expect(assertSeedAllowed(OK, () => db as never)).rejects.toThrow(/1 usuario\(s\) que no son de demostración/);
    expect(disconnect).toHaveBeenCalled();
    expect(db.users).toHaveLength(1);
    expect(db.companies).toHaveLength(0);
  });

  it('rechaza una base con empresas reales', async () => {
    const db = new FakePrisma();
    await db.company.create({ data: { id: 'c1', name: 'Real SAC', ruc: '20123456789' } });
    await expect(assertSeedAllowed(OK, () => db as never)).rejects.toThrow(/1 empresa\(s\) que no son de demostración/);
  });
});
