import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiOkResponse, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { Public } from '../common/decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** El health check responde siempre en pocos segundos, aunque MySQL no conteste. */
const DB_CHECK_TIMEOUT_MS = 3_000;

export interface HealthStatus {
  status: 'ok' | 'error';
  database: 'ok' | 'unavailable';
  timestamp: string;
}

@ApiTags('Salud')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** Estado de la API y de la conexión a MySQL. No expone versiones, rutas ni datos de configuración. */
  @Public()
  @SkipThrottle()
  @Get()
  @ApiOkResponse({ description: 'API y base de datos disponibles.' })
  @ApiServiceUnavailableResponse({ description: 'La base de datos no responde.' })
  async check(@Res({ passthrough: true }) res: Response): Promise<HealthStatus> {
    let database: HealthStatus['database'] = 'ok';
    try {
      await Promise.race([
        this.prisma.$queryRaw`SELECT 1`,
        new Promise((_, reject) => setTimeout(() => reject(new Error('tiempo agotado')), DB_CHECK_TIMEOUT_MS).unref()),
      ]);
    } catch {
      database = 'unavailable';
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
    }
    return { status: database === 'ok' ? 'ok' : 'error', database, timestamp: new Date().toISOString() };
  }
}
