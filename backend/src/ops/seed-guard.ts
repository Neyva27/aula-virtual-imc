import type { PrismaClient } from '../generated/prisma/client.js';
import { DEMO_MARKERS } from './demo-accounts.js';

/** Sufijos de las únicas bases donde se admite la semilla de demostración. */
export const SEED_DATABASE_SUFFIXES = ['_dev', '_test'] as const;

export class SeedRefusedError extends Error {
  constructor(readonly reasons: string[]) {
    super(`La semilla de demostración NO se ejecutó (no se escribió nada):\n- ${reasons.join('\n- ')}`);
    this.name = 'SeedRefusedError';
  }
}

export interface SeedGuardInput {
  nodeEnv: string | undefined;
  databaseName: string;
  /** Valor de SEED_DEMO_ALLOWED. Solo «true» lo habilita. */
  seedDemoAllowed: string | undefined;
}

/** Comprobaciones que no necesitan la base: se hacen antes de conectarse. */
export function seedConfigProblems({ nodeEnv, databaseName, seedDemoAllowed }: SeedGuardInput): string[] {
  const problems: string[] = [];
  if (nodeEnv === 'production') problems.push('NODE_ENV=production: la semilla nunca se ejecuta en producción.');
  if (!SEED_DATABASE_SUFFIXES.some((suffix) => databaseName.endsWith(suffix))) {
    problems.push(`La base «${databaseName}» no termina en _dev ni en _test: solo se admite en bases de desarrollo o pruebas.`);
  }
  if (seedDemoAllowed?.trim().toLowerCase() !== 'true') {
    problems.push('Falta SEED_DEMO_ALLOWED=true en backend/.env (solo debe existir en desarrollo).');
  }
  return problems;
}

/** Datos reales presentes: si existen, la base no es de demostración y no se escribe nada. */
export async function realDataProblems(prisma: PrismaClient): Promise<string[]> {
  const [realUsers, realCompanies] = await Promise.all([
    prisma.user.count({ where: { NOT: { email: { endsWith: DEMO_MARKERS.emailSuffix } } } }),
    prisma.company.count({ where: { NOT: { OR: [{ id: DEMO_MARKERS.companyId }, { ruc: DEMO_MARKERS.ruc }] } } }),
  ]);
  const problems: string[] = [];
  if (realUsers > 0) problems.push(`La base tiene ${realUsers} usuario(s) que no son de demostración.`);
  if (realCompanies > 0) problems.push(`La base tiene ${realCompanies} empresa(s) que no son de demostración.`);
  return problems;
}

/**
 * Punto B: la semilla solo escribe si TODAS las condiciones se cumplen. Primero valida la configuración
 * (sin tocar la base) y después, ya conectada, que no haya datos reales. Lanza SeedRefusedError con todos los motivos.
 */
export async function assertSeedAllowed(input: SeedGuardInput, connect: () => PrismaClient): Promise<PrismaClient> {
  const configProblems = seedConfigProblems(input);
  if (configProblems.length) throw new SeedRefusedError(configProblems);
  const prisma = connect();
  try {
    const dataProblems = await realDataProblems(prisma);
    if (dataProblems.length) throw new SeedRefusedError(dataProblems);
    return prisma;
  } catch (error) {
    await prisma.$disconnect();
    throw error;
  }
}
