import 'dotenv/config';
import type { PrismaClient } from '../generated/prisma/client.js';
import { envFlag } from '../config/env.validation.js';
import { createPrismaFromUrl, databaseName } from '../ops/prisma-from-url.js';

/** Conexión de los comandos de operación (db:check-clean, admin:create) con DATABASE_URL de backend/.env. */
export function cliDatabase(): { prisma: PrismaClient; name: string } {
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('Falta DATABASE_URL en backend/.env.');
  return { prisma: createPrismaFromUrl(url, envFlag(process.env['DB_ALLOW_PUBLIC_KEY_RETRIEVAL'])), name: databaseName(url) };
}
