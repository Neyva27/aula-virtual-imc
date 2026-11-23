import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectThrottlerStorage, ThrottlerException, type ThrottlerStorage } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import type { Env } from '../../config/env.validation.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { RefreshCookie } from './refresh-cookie.js';
import { hashToken } from './session.service.js';

export const REFRESH_THROTTLED = 'Demasiadas solicitudes. Espera un momento e inténtalo nuevamente.';

/**
 * Límite de POST /auth/refresh (23/11/2026). Una IP puede ser la red compartida de una empresa, así que cada sesión
 * válida tiene su propio contador y un alumno no bloquea a otro:
 * - sesión válida: REFRESH_SESSION_LIMIT por familia de tokens (la familia sobrevive a la rotación);
 * - sin cookie o con un token inexistente, revocado o vencido: el límite estricto por IP (AUTH_THROTTLE_LIMIT), en un
 *   contador aparte que no afecta a las sesiones válidas;
 * - toda solicitud con cookie: techo amplio por IP (REFRESH_IP_LIMIT), antes de consultar la base.
 * No cambia la rotación, la detección de reutilización ni el límite del inicio de sesión.
 */
@Injectable()
export class RefreshThrottleGuard implements CanActivate {
  constructor(
    @InjectThrottlerStorage() private readonly storage: ThrottlerStorage,
    private readonly prisma: PrismaService,
    private readonly cookie: RefreshCookie,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const ip = req.ip ?? 'desconocida';
    const invalidLimit = this.config.get('AUTH_THROTTLE_LIMIT', { infer: true });
    const token = this.cookie.read(req);
    if (!token) {
      await this.hit(res, `refresh:invalid:${ip}`, invalidLimit);
      return true;
    }
    await this.hit(res, `refresh:ip:${ip}`, this.config.get('REFRESH_IP_LIMIT', { infer: true }));
    const row = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(token) },
      select: { familyId: true, revokedAt: true, expiresAt: true },
    });
    if (row && !row.revokedAt && row.expiresAt.getTime() > Date.now()) {
      await this.hit(res, `refresh:session:${row.familyId}`, this.config.get('REFRESH_SESSION_LIMIT', { infer: true }));
    } else {
      await this.hit(res, `refresh:invalid:${ip}`, invalidLimit);
    }
    return true;
  }

  private async hit(res: Response, key: string, limit: number): Promise<void> {
    const ttl = this.config.get('THROTTLE_TTL_SECONDS', { infer: true }) * 1000;
    const record = await this.storage.increment(key, ttl, limit, ttl, 'refresh');
    if (record.isBlocked) {
      res.header('Retry-After', String(record.timeToBlockExpire));
      throw new ThrottlerException(REFRESH_THROTTLED);
    }
  }
}
