import { defineConfig } from 'vitest/config';

// Pruebas unitarias (src/**/*.spec.ts). Las de integración HTTP usan vitest.config.e2e.ts
// y las que necesitan MySQL, vitest.config.db.ts.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.spec.ts'],
    env: { NODE_ENV: 'test' },
  },
});
