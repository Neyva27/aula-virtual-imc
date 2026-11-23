import { execSync } from 'node:child_process';
import { testDatabaseUrl } from './test-database.js';

/** Aplica las migraciones a la base de pruebas antes de la suite (no crea ni borra bases). */
export default function setup(): void {
  const url = testDatabaseUrl();
  try {
    execSync('npx prisma migrate deploy', { stdio: 'inherit', env: { ...process.env, DATABASE_URL: url } });
  } catch {
    throw new Error(
      'No se pudieron aplicar las migraciones en la base de pruebas. Comprueba que ejecutaste ' +
        'prisma/sql/crear-bases-locales.local.sql (o crear-bases-locales.sql) en MySQL Workbench y que ' +
        'TEST_DATABASE_URL de backend/.env tiene la misma contraseña. El detalle del error aparece arriba.',
    );
  }
}
