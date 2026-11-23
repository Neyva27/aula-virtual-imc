import { plainToInstance, Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, Min, MinLength, validateSync } from 'class-validator';

const toBool = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? ['true', '1', 'yes', 'si', 'sí'].includes(value.trim().toLowerCase()) : value;
const toInt = ({ value }: { value: unknown }) => (typeof value === 'string' && value.trim() !== '' ? Number(value) : value);

/** Variables de entorno del backend. Ver backend/.env.example. */
export class Env {
  @IsIn(['development', 'test', 'production'])
  NODE_ENV: 'development' | 'test' | 'production' = 'development';

  @Transform(toInt)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT = 3000;

  @IsString()
  DATABASE_URL: string;

  /**
   * MySQL 8 (caching_sha2_password) sin SSL: permite que el driver obtenga la clave pública del servidor para enviar
   * la contraseña. Solo se admite con la base en el mismo equipo (localhost); en otro servidor se debe usar SSL.
   */
  @Transform(toBool)
  @IsBoolean()
  DB_ALLOW_PUBLIC_KEY_RETRIEVAL = false;

  @IsString()
  @MinLength(32, { message: 'JWT_ACCESS_SECRET debe tener al menos 32 caracteres.' })
  JWT_ACCESS_SECRET: string;

  @Transform(toInt)
  @IsInt()
  @Min(60)
  @Max(3600)
  JWT_ACCESS_TTL_SECONDS = 900;

  @Transform(toInt)
  @IsInt()
  @Min(1)
  @Max(30)
  REFRESH_TTL_DAYS = 7;

  @Transform(toBool)
  @IsBoolean()
  COOKIE_SECURE = true;

  @IsIn(['strict', 'lax', 'none'])
  COOKIE_SAMESITE: 'strict' | 'lax' | 'none' = 'strict';

  @IsString()
  CORS_ORIGIN = 'http://localhost:4200';

  @Transform(toInt)
  @IsInt()
  @Min(1)
  @Max(20)
  LOGIN_MAX_FAILURES = 5;

  @Transform(toInt)
  @IsInt()
  @Min(1)
  @Max(1440)
  LOGIN_LOCK_MINUTES = 15;

  @Transform(toInt)
  @IsInt()
  @Min(1)
  THROTTLE_TTL_SECONDS = 60;

  @Transform(toInt)
  @IsInt()
  @Min(1)
  THROTTLE_LIMIT = 100;

  @Transform(toInt)
  @IsInt()
  @Min(1)
  AUTH_THROTTLE_LIMIT = 10;

  /** Renovaciones por SESIÓN (familia de tokens) en cada ventana de THROTTLE_TTL_SECONDS. */
  @Transform(toInt)
  @IsInt()
  @Min(1)
  REFRESH_SESSION_LIMIT = 30;

  /** Techo por IP de renovaciones con cookie: admite una red compartida y frena un abuso masivo. */
  @Transform(toInt)
  @IsInt()
  @Min(1)
  REFRESH_IP_LIMIT = 600;

  @Transform(toBool)
  @IsBoolean()
  TRUST_PROXY = false;

  @Transform(toBool)
  @IsBoolean()
  SWAGGER_ENABLED = false;

  @IsOptional()
  @IsString()
  SHADOW_DATABASE_URL?: string;

  @IsOptional()
  @IsString()
  TEST_DATABASE_URL?: string;

  @IsOptional()
  @IsString()
  SEED_DEMO_PASSWORD?: string;

  /** Habilita la semilla de demostración (solo desarrollo). En producción la API no arranca si es true. */
  @Transform(toBool)
  @IsBoolean()
  SEED_DEMO_ALLOWED = false;

  /**
   * B2.3c: dirección de la pantalla de activación del frontend (por ejemplo, https://aula.ejemplo.pe/activar-cuenta).
   * El correo enlaza a `<ACTIVATION_URL>#token=<token>`. Sin ella no se envían correos de activación (la cuenta queda
   * pendiente y el enlace se puede reenviar después). En producción debe ser https.
   */
  @IsOptional()
  @IsString()
  ACTIVATION_URL?: string;

  /**
   * SOLO DESARROLLO LOCAL (17/11/2026): en lugar de enviar un correo, el enlace de activación se escribe en la consola
   * del backend y la respuesta indica `emailDelivery: "DEV_CONSOLE"` (nunca se simula un correo enviado). Requiere
   * ACTIVATION_URL. Prohibido en producción: la API no arranca si es true con NODE_ENV=production.
   */
  @Transform(toBool)
  @IsBoolean()
  MAIL_DEV_CONSOLE = false;

  /**
   * Portadas de curso (19/11/2026): carpeta base de los archivos subidos. Las portadas van en
   * `<UPLOADS_DIR>/course-covers/`. Relativa a la carpeta desde la que se inicia el backend (por defecto `storage`,
   * es decir, backend/storage). En MySQL solo se guarda la ruta pública de cada imagen.
   */
  @IsOptional()
  @IsString()
  UPLOADS_DIR?: string;

  /** B2.3c: vigencia del enlace de activación, en horas (por defecto 72 = 3 días; de 1 a 336 = 14 días). */
  @Transform(toInt)
  @IsInt()
  @Min(1)
  @Max(336)
  ACTIVATION_TOKEN_TTL_HOURS = 72;
}

export function isLocalHost(hostname: string): boolean {
  return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(hostname.toLowerCase());
}

/** Lee una variable booleana de process.env fuera de Nest (semilla y pruebas contra MySQL). */
export function envFlag(value: string | undefined): boolean {
  return toBool({ value }) === true;
}

/** Reglas que combinan varias variables o exigen más seguridad en producción. */
function crossFieldErrors(env: Env): string[] {
  const errors: string[] = [];
  let dbUrl: URL | null = null;
  try {
    dbUrl = new URL(env.DATABASE_URL);
  } catch {
    errors.push('DATABASE_URL no es una URL válida (mysql://usuario:clave@servidor:puerto/base).');
  }
  if (dbUrl) {
    if (dbUrl.protocol !== 'mysql:') errors.push('DATABASE_URL debe comenzar con mysql://.');
    // Decisión B1-e: la API nunca se conecta como root.
    if (decodeURIComponent(dbUrl.username).toLowerCase() === 'root') {
      errors.push('DATABASE_URL no puede usar el usuario root: usa el usuario exclusivo de la aplicación.');
    }
    if (!dbUrl.pathname || dbUrl.pathname === '/') errors.push('DATABASE_URL debe indicar el nombre de la base de datos.');
    if (env.DB_ALLOW_PUBLIC_KEY_RETRIEVAL && !isLocalHost(dbUrl.hostname)) {
      errors.push('DB_ALLOW_PUBLIC_KEY_RETRIEVAL solo se admite con la base en el mismo equipo (localhost); en otro servidor usa SSL.');
    }
  }
  if (env.ACTIVATION_URL !== undefined) {
    let activation: URL | null = null;
    try {
      activation = new URL(env.ACTIVATION_URL);
    } catch {
      errors.push('ACTIVATION_URL no es una URL válida (https://servidor/activar-cuenta).');
    }
    if (activation && !['http:', 'https:'].includes(activation.protocol)) errors.push('ACTIVATION_URL debe usar http o https.');
    if (activation?.hash) errors.push('ACTIVATION_URL no debe incluir «#»: el enlace agrega el token después de «#».');
    if (activation && env.NODE_ENV === 'production' && activation.protocol !== 'https:') {
      errors.push('En producción ACTIVATION_URL debe usar https.');
    }
  }
  if (env.COOKIE_SAMESITE === 'none' && !env.COOKIE_SECURE) {
    errors.push('COOKIE_SAMESITE=none exige COOKIE_SECURE=true.');
  }
  if (env.NODE_ENV === 'production') {
    if (!env.COOKIE_SECURE) errors.push('En producción COOKIE_SECURE debe ser true.');
    if (env.SWAGGER_ENABLED) errors.push('En producción SWAGGER_ENABLED debe ser false.');
    if (env.CORS_ORIGIN.split(',').some((o) => o.trim() === '*')) errors.push('En producción CORS_ORIGIN no puede ser «*».');
    if (env.SEED_DEMO_ALLOWED) errors.push('En producción SEED_DEMO_ALLOWED no puede ser true.');
    if (env.MAIL_DEV_CONSOLE) {
      errors.push('En producción MAIL_DEV_CONSOLE no puede ser true: los enlaces de activación no se escriben en la consola.');
    }
  }
  return errors;
}

/** Usado por ConfigModule: si la configuración es inválida, la aplicación no arranca. */
export function validateEnv(config: Record<string, unknown>): Env {
  const env = plainToInstance(Env, config, { exposeDefaultValues: true });
  const errors = validateSync(env, { skipMissingProperties: false, whitelist: false });
  const messages = errors.flatMap((e) => Object.values(e.constraints ?? {}).map((m) => `${e.property}: ${m}`));
  messages.push(...(messages.length ? [] : crossFieldErrors(env)));
  if (messages.length) {
    throw new Error(`Configuración inválida del backend:\n- ${messages.join('\n- ')}`);
  }
  return env;
}
