import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../generated/prisma/client.js';
import type { Env } from '../config/env.validation.js';

/**
 * Configuración del pool a partir de DATABASE_URL, con tiempos máximos para no quedar esperando indefinidamente.
 * `allowPublicKeyRetrieval`: ver DB_ALLOW_PUBLIC_KEY_RETRIEVAL (solo con MySQL en localhost; se valida al arrancar).
 */
export function poolConfigFromUrl(databaseUrl: string, allowPublicKeyRetrieval = false) {
  const url = new URL(databaseUrl);
  return {
    allowPublicKeyRetrieval,
    host: url.hostname,
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\//, '')),
    connectionLimit: 10,
    connectTimeout: 3_000,
    acquireTimeout: 5_000,
  };
}

/**
 * Cliente de Prisma compartido. Prisma 7 se conecta a MySQL mediante el adaptador MariaDB.
 * La conexión se abre en la primera consulta: la API arranca aunque MySQL no esté disponible,
 * y /api/v1/health informa el estado de la base.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(config: ConfigService<Env, true>) {
    super({
      adapter: new PrismaMariaDb(
        poolConfigFromUrl(config.get('DATABASE_URL', { infer: true }), config.get('DB_ALLOW_PUBLIC_KEY_RETRIEVAL', { infer: true })),
      ),
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
