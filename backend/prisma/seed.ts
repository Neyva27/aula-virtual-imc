/**
 * Semilla de DEMOSTRACIÓN (solo desarrollo). Ejecutar con `npm run db:seed` (o `npx prisma db seed`).
 *
 * Antes de escribir comprueba (punto B, src/ops/seed-guard.ts), y si falla cualquiera no escribe nada:
 * 1. NODE_ENV distinto de production;
 * 2. el nombre de la base termina en _dev o _test;
 * 3. SEED_DEMO_ALLOWED=true en backend/.env;
 * 4. la base no tiene usuarios ni empresas reales.
 * Solo crea lo que falta y no modifica registros existentes (prisma/seed-data.ts).
 */
import 'dotenv/config';
import { envFlag } from '../src/config/env.validation.js';
import { createPrismaFromUrl, databaseName } from '../src/ops/prisma-from-url.js';
import { assertSeedAllowed } from '../src/ops/seed-guard.js';
import { seedDemo } from './seed-data.js';

async function main() {
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('Falta DATABASE_URL en backend/.env.');

  const prisma = await assertSeedAllowed(
    {
      nodeEnv: process.env['NODE_ENV'],
      databaseName: databaseName(url),
      seedDemoAllowed: process.env['SEED_DEMO_ALLOWED'],
    },
    () => createPrismaFromUrl(url, envFlag(process.env['DB_ALLOW_PUBLIC_KEY_RETRIEVAL'])),
  );
  try {
    const created = await seedDemo(prisma, process.env['SEED_DEMO_PASSWORD'] || 'demo1234');
    console.log(
      `Semilla aplicada en «${databaseName(url)}». Creados: ${created.companies} empresa(s), ${created.users} usuario(s), ` +
        `${created.students} estudiante(s), ${created.instructors} perfil(es) de Instructor, ` +
        `${created.studentCompanies + created.instructorCompanies} asociación(es) con empresas. ` +
        'Los registros que ya existían no se modificaron.',
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  // SeedRefusedError ya enumera todos los motivos en su mensaje.
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
