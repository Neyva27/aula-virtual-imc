import { defineConfig } from 'vitest/config';

// Integración HTTP con la aplicación completa y la base simulada en memoria (no requiere MySQL).
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    env: { NODE_ENV: 'test' },
    testTimeout: 30_000,
    // B2.2b: con cuatro archivos en paralelo, el primer arranque de la aplicación (importar módulos y calcular hashes
    // argon2 de la semilla) puede superar los 10 s por defecto de los hooks.
    hookTimeout: 30_000,
    // Los archivos se ejecutan en serie: cada preparación calcula varios hashes argon2 (19 MiB) y, en paralelo, la
    // contención de CPU hacía vencer los tiempos de forma intermitente.
    fileParallelism: false,
  },
});
