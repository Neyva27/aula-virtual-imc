import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../generated/prisma/client.js';
import { isLocalHost } from '../config/env.validation.js';
import { poolConfigFromUrl } from '../prisma/prisma.service.js';

/**
 * Cliente de Prisma para scripts fuera de Nest (semilla, db:check-clean, admin:create, pruebas contra MySQL).
 * Aplica la misma regla que la API: obtener la clave pública de MySQL solo se admite con la base en localhost.
 */
export function createPrismaFromUrl(databaseUrl: string, allowPublicKeyRetrieval: boolean): PrismaClient {
  if (allowPublicKeyRetrieval && !isLocalHost(new URL(databaseUrl).hostname)) {
    throw new Error('DB_ALLOW_PUBLIC_KEY_RETRIEVAL solo se admite con la base en el mismo equipo (localhost); en otro servidor usa SSL.');
  }
  return new PrismaClient({ adapter: new PrismaMariaDb(poolConfigFromUrl(databaseUrl, allowPublicKeyRetrieval)) });
}

/** Nombre de la base de una URL mysql:// (sin credenciales), para mostrarlo en los scripts. */
export function databaseName(databaseUrl: string): string {
  return decodeURIComponent(new URL(databaseUrl).pathname.replace(/^\//, ''));
}
