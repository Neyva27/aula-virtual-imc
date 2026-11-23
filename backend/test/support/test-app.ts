import { Test } from '@nestjs/testing';
import type { INestApplication, Type } from '@nestjs/common';
import type { Response } from 'supertest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { vi } from 'vitest';

/** Variables de entorno de prueba: nunca se lee backend/.env (NODE_ENV=test). */
export const TEST_ENV: Record<string, string> = {
  NODE_ENV: 'test',
  PORT: '3999',
  DATABASE_URL: 'mysql://aula_imc:clave-de-prueba@127.0.0.1:3306/aula_imc_test',
  JWT_ACCESS_SECRET: 'secreto-de-prueba-solo-para-tests-0123456789abcdef',
  JWT_ACCESS_TTL_SECONDS: '900',
  REFRESH_TTL_DAYS: '7',
  COOKIE_SECURE: 'false',
  COOKIE_SAMESITE: 'strict',
  CORS_ORIGIN: 'http://localhost:4200',
  LOGIN_MAX_FAILURES: '5',
  LOGIN_LOCK_MINUTES: '15',
  THROTTLE_TTL_SECONDS: '60',
  THROTTLE_LIMIT: '1000',
  AUTH_THROTTLE_LIMIT: '1000',
  TRUST_PROXY: 'false',
  SWAGGER_ENABLED: 'true',
  // B2.3c: pantalla de activación del frontend (solo para construir enlaces en las pruebas). En https porque algunas
  // pruebas arrancan con NODE_ENV=production, que lo exige. Dominio reservado `.test` (RFC 2606).
  ACTIVATION_URL: 'https://aula.ejemplo.test/activar-cuenta',
  // Portadas subidas (19/11/2026): las pruebas nunca escriben en backend/storage.
  UPLOADS_DIR: join(tmpdir(), 'aula-imc-test-uploads'),
};

export interface TestApp {
  app: INestApplication;
  http: any;
  close(): Promise<void>;
}

/**
 * Crea la aplicación completa (AppModule + configureApp, igual que main.ts) con las variables indicadas.
 * Los módulos se recargan para que ConfigModule valide las variables de cada prueba.
 * `prisma` reemplaza a PrismaService (base simulada o un cliente conectado a aula_imc_test).
 * `controllers` (B2.2a): controladores SOLO de prueba que se montan junto a AppModule, con los mismos guards globales.
 * `providers` (B2.3c): reemplazos de proveedores (por ejemplo, un MailSender simulado).
 */
export async function createTestApp(
  prisma: unknown,
  env: Record<string, string> = {},
  extra: { controllers?: Type[]; providers?: { provide: unknown; useValue: unknown }[] } = {},
): Promise<TestApp> {
  const merged = { ...TEST_ENV, ...env };
  const previous = Object.fromEntries(Object.keys(merged).map((k) => [k, process.env[k]]));
  Object.assign(process.env, merged);

  vi.resetModules();
  const { AppModule } = await import('../../src/app.module.js');
  const { PrismaService } = await import('../../src/prisma/prisma.service.js');
  const { configureApp } = await import('../../src/app.setup.js');

  let builder = Test.createTestingModule({ imports: [AppModule], controllers: extra.controllers ?? [] })
    .overrideProvider(PrismaService)
    .useValue(prisma);
  for (const override of extra.providers ?? []) builder = builder.overrideProvider(override.provide).useValue(override.useValue);
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication({ logger: false });
  configureApp(app);
  const restoreEnv = () => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
  try {
    await app.init();
  } catch (error) {
    // B2.2a: una aplicación que se niega a arrancar (p. ej., ruta /admin sin permiso) no deja variables cambiadas.
    await app.close().catch(() => undefined);
    restoreEnv();
    throw error;
  }

  return {
    app,
    http: app.getHttpServer(),
    async close() {
      await app.close();
      restoreEnv();
    },
  };
}

/** Cookie de renovación de una respuesta (valor y atributos). */
export function refreshCookieOf(res: Response): { value: string; header: string } | null {
  const raw = res.headers['set-cookie'] as unknown as string[] | string | undefined;
  const header = (Array.isArray(raw) ? raw : raw ? [raw] : []).find((c) => c.startsWith('imc_refresh='));
  if (!header) return null;
  return { value: header.split(';')[0].slice('imc_refresh='.length), header };
}

export const CLIENT_HEADER = { 'X-Requested-With': 'XMLHttpRequest' };
export const DEMO_PASSWORD = 'demo1234';
