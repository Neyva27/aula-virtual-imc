import { defineConfig } from 'vitest/config';

// Pruebas contra MySQL real (base aula_imc_test). Requieren haber ejecutado prisma/sql/crear-bases-locales.sql
// y tener TEST_DATABASE_URL en backend/.env. Se ejecutan en serie porque comparten la base.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['test/db/**/*.db-spec.ts'],
    globalSetup: ['test/db/global-setup.ts'],
    env: { NODE_ENV: 'test' },
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
