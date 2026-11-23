import { describe, expect, it } from 'vitest';
import { validateEnv } from './env.validation.js';

const BASE = {
  DATABASE_URL: 'mysql://aula_imc:clave@localhost:3306/aula_imc_dev',
  JWT_ACCESS_SECRET: 'x'.repeat(32),
  COOKIE_SECURE: 'false',
};

describe('validateEnv', () => {
  it('acepta una configuración mínima y aplica los valores aprobados por defecto', () => {
    const env = validateEnv(BASE);
    expect(env.JWT_ACCESS_TTL_SECONDS).toBe(900); // 15 minutos (B1-d)
    expect(env.REFRESH_TTL_DAYS).toBe(7);
    expect(env.LOGIN_MAX_FAILURES).toBe(5);
    expect(env.LOGIN_LOCK_MINUTES).toBe(15);
    expect(env.COOKIE_SAMESITE).toBe('strict');
    expect(env.COOKIE_SECURE).toBe(false);
    expect(env.SWAGGER_ENABLED).toBe(false);
    expect(env.PORT).toBe(3000);
  });

  it('convierte números y booleanos escritos como texto', () => {
    const env = validateEnv({ ...BASE, PORT: '4000', SWAGGER_ENABLED: 'true', TRUST_PROXY: '1' });
    expect(env.PORT).toBe(4000);
    expect(env.SWAGGER_ENABLED).toBe(true);
    expect(env.TRUST_PROXY).toBe(true);
  });

  it('no arranca sin secreto JWT, con un secreto corto o sin DATABASE_URL', () => {
    expect(() => validateEnv({ ...BASE, JWT_ACCESS_SECRET: undefined })).toThrow(/JWT_ACCESS_SECRET/);
    expect(() => validateEnv({ ...BASE, JWT_ACCESS_SECRET: 'corto' })).toThrow(/al menos 32 caracteres/);
    expect(() => validateEnv({ ...BASE, DATABASE_URL: undefined })).toThrow(/DATABASE_URL/);
  });

  it('rechaza conectarse como root (decisión B1-e) y URLs que no son de MySQL', () => {
    expect(() => validateEnv({ ...BASE, DATABASE_URL: 'mysql://root:clave@localhost:3306/aula_imc_dev' })).toThrow(/root/);
    expect(() => validateEnv({ ...BASE, DATABASE_URL: 'postgres://u:c@localhost/db' })).toThrow(/mysql:\/\//);
    expect(() => validateEnv({ ...BASE, DATABASE_URL: 'mysql://u:c@localhost:3306/' })).toThrow(/nombre de la base/);
    expect(() => validateEnv({ ...BASE, DATABASE_URL: 'no es una url' })).toThrow(/no es una URL válida/);
  });

  it('exige reglas más estrictas en producción', () => {
    const prod = { ...BASE, NODE_ENV: 'production' };
    expect(() => validateEnv(prod)).toThrow(/COOKIE_SECURE debe ser true/);
    expect(() => validateEnv({ ...prod, COOKIE_SECURE: 'true', SWAGGER_ENABLED: 'true' })).toThrow(/SWAGGER_ENABLED/);
    expect(() => validateEnv({ ...prod, COOKIE_SECURE: 'true', CORS_ORIGIN: '*' })).toThrow(/CORS_ORIGIN/);
    expect(() => validateEnv({ ...prod, COOKIE_SECURE: 'true', SEED_DEMO_ALLOWED: 'true' })).toThrow(/SEED_DEMO_ALLOWED/);
    expect(validateEnv({ ...prod, COOKIE_SECURE: 'true' }).NODE_ENV).toBe('production');
    expect(validateEnv({ ...prod, COOKIE_SECURE: 'true' }).SEED_DEMO_ALLOWED).toBe(false);
  });

  it('MAIL_DEV_CONSOLE: falso por defecto, permitido en desarrollo y PROHIBIDO en producción', () => {
    expect(validateEnv(BASE).MAIL_DEV_CONSOLE).toBe(false);
    expect(validateEnv({ ...BASE, MAIL_DEV_CONSOLE: 'true' }).MAIL_DEV_CONSOLE).toBe(true);
    const prod = { ...BASE, NODE_ENV: 'production', COOKIE_SECURE: 'true' };
    expect(() => validateEnv({ ...prod, MAIL_DEV_CONSOLE: 'true' })).toThrow(/MAIL_DEV_CONSOLE/);
    expect(validateEnv(prod).MAIL_DEV_CONSOLE).toBe(false);
  });

  it('SameSite=None exige una cookie Secure', () => {
    expect(() => validateEnv({ ...BASE, COOKIE_SAMESITE: 'none' })).toThrow(/COOKIE_SAMESITE=none/);
    expect(() => validateEnv({ ...BASE, COOKIE_SAMESITE: 'cualquiera' })).toThrow(/COOKIE_SAMESITE/);
  });

  it('DB_ALLOW_PUBLIC_KEY_RETRIEVAL está desactivado por defecto y solo se admite con MySQL en localhost', () => {
    expect(validateEnv(BASE).DB_ALLOW_PUBLIC_KEY_RETRIEVAL).toBe(false);
    expect(validateEnv({ ...BASE, DB_ALLOW_PUBLIC_KEY_RETRIEVAL: 'true' }).DB_ALLOW_PUBLIC_KEY_RETRIEVAL).toBe(true);
    expect(
      validateEnv({ ...BASE, DATABASE_URL: 'mysql://aula_imc:c@127.0.0.1:3306/aula_imc_dev', DB_ALLOW_PUBLIC_KEY_RETRIEVAL: 'true' })
        .DB_ALLOW_PUBLIC_KEY_RETRIEVAL,
    ).toBe(true);
    expect(() =>
      validateEnv({ ...BASE, DATABASE_URL: 'mysql://aula_imc:c@db.ejemplo.test:3306/aula_imc', DB_ALLOW_PUBLIC_KEY_RETRIEVAL: 'true' }),
    ).toThrow(/solo se admite con la base en el mismo equipo/);
  });

  it('rechaza valores fuera de rango', () => {
    expect(() => validateEnv({ ...BASE, JWT_ACCESS_TTL_SECONDS: '10' })).toThrow(/JWT_ACCESS_TTL_SECONDS/);
    expect(() => validateEnv({ ...BASE, PORT: '70000' })).toThrow(/PORT/);
  });

  it('B2.3c: activación opcional, 72 h por defecto, URL válida sin «#» y https en producción', () => {
    const env = validateEnv(BASE);
    expect(env.ACTIVATION_URL).toBeUndefined();
    expect(env.ACTIVATION_TOKEN_TTL_HOURS).toBe(72);
    expect(validateEnv({ ...BASE, ACTIVATION_URL: 'http://localhost:4200/activar-cuenta' }).ACTIVATION_URL).toBe(
      'http://localhost:4200/activar-cuenta',
    );
    expect(() => validateEnv({ ...BASE, ACTIVATION_URL: 'no-es-url' })).toThrow(/ACTIVATION_URL no es una URL válida/);
    expect(() => validateEnv({ ...BASE, ACTIVATION_URL: 'ftp://servidor/activar' })).toThrow(/http o https/);
    expect(() => validateEnv({ ...BASE, ACTIVATION_URL: 'https://servidor/activar#x' })).toThrow(/«#»/);
    const production = { ...BASE, NODE_ENV: 'production', COOKIE_SECURE: 'true' };
    expect(() => validateEnv({ ...production, ACTIVATION_URL: 'http://servidor/activar' })).toThrow(/https/);
    expect(validateEnv({ ...production, ACTIVATION_URL: 'https://servidor/activar' }).NODE_ENV).toBe('production');
    expect(() => validateEnv({ ...BASE, ACTIVATION_TOKEN_TTL_HOURS: '0' })).toThrow(/ACTIVATION_TOKEN_TTL_HOURS/);
    expect(() => validateEnv({ ...BASE, ACTIVATION_TOKEN_TTL_HOURS: '400' })).toThrow(/ACTIVATION_TOKEN_TTL_HOURS/);
  });
});
