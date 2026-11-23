import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../../audit/audit.service.js';
import type { Env } from '../../config/env.validation.js';

export interface ClientMeta {
  ip: string | null;
  userAgent: string | null;
}

export interface IssuedRefreshToken {
  /** Valor que viaja en la cookie. Nunca se guarda: en la base solo queda su hash. */
  token: string;
  expiresAt: Date;
}

export type RevokeReason = 'ROTATED' | 'LOGOUT' | 'LOGOUT_ALL' | 'PASSWORD_CHANGED' | 'REUSE_DETECTED';

const INVALID_SESSION = 'Tu sesión no es válida o venció. Inicia sesión nuevamente.';

/** Hash del token de renovación. El token tiene 256 bits aleatorios, así que basta SHA-256 (no requiere argon2). */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Sesiones renovables (tokens de renovación) con rotación y revocación.
 * - Cada inicio de sesión abre una «familia» con vencimiento absoluto (REFRESH_TTL_DAYS).
 * - Cada renovación revoca el token usado y emite otro de la misma familia, con el mismo vencimiento.
 * - Presentar un token ya rotado indica un posible robo: se revoca toda la familia.
 */
@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async open(userId: string, meta: ClientMeta): Promise<IssuedRefreshToken> {
    const days = this.config.get('REFRESH_TTL_DAYS', { infer: true });
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    return this.create(userId, randomUUID(), expiresAt, meta);
  }

  /** Rota el token: devuelve el usuario y un token nuevo. Lanza 401 si el token no sirve. */
  async rotate(token: string, meta: ClientMeta): Promise<{ userId: string; refresh: IssuedRefreshToken }> {
    const current = await this.prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!current) throw new UnauthorizedException(INVALID_SESSION);

    if (current.revokedAt) {
      if (current.revokedReason === 'ROTATED') await this.handleReuse(current.userId, current.familyId, meta);
      throw new UnauthorizedException(INVALID_SESSION);
    }
    if (current.expiresAt.getTime() <= Date.now()) throw new UnauthorizedException(INVALID_SESSION);

    const user = await this.prisma.user.findUnique({ where: { id: current.userId }, select: { active: true } });
    if (!user?.active) {
      await this.revokeFamily(current.familyId, 'LOGOUT');
      throw new UnauthorizedException(INVALID_SESSION);
    }

    // Revocación condicional: si dos solicitudes usan el mismo token a la vez, solo una gana.
    const next = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.refreshToken.updateMany({
        where: { id: current.id, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: 'ROTATED' },
      });
      if (claimed.count !== 1) return null;
      const issued = this.newToken();
      const created = await tx.refreshToken.create({
        data: {
          userId: current.userId,
          familyId: current.familyId,
          tokenHash: hashToken(issued),
          expiresAt: current.expiresAt,
          ip: meta.ip,
          userAgent: meta.userAgent,
        },
      });
      await tx.refreshToken.update({ where: { id: current.id }, data: { replacedById: created.id } });
      return { token: issued, expiresAt: current.expiresAt };
    });

    if (!next) {
      await this.handleReuse(current.userId, current.familyId, meta);
      throw new UnauthorizedException(INVALID_SESSION);
    }
    return { userId: current.userId, refresh: next };
  }

  /** Cierra la sesión a la que pertenece el token (si existe). No falla si el token ya no es válido. */
  async closeByToken(token: string): Promise<string | null> {
    const current = await this.prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!current) return null;
    await this.revokeFamily(current.familyId, 'LOGOUT');
    return current.userId;
  }

  async revokeAllForUser(userId: string, reason: RevokeReason): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  private async revokeFamily(familyId: string, reason: RevokeReason): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  private async handleReuse(userId: string, familyId: string, meta: ClientMeta): Promise<void> {
    await this.revokeFamily(familyId, 'REUSE_DETECTED');
    await this.audit.log({ action: 'REFRESH_REUSE_DETECTED', actorId: userId, entity: 'session', entityId: familyId, ip: meta.ip });
  }

  private async create(userId: string, familyId: string, expiresAt: Date, meta: ClientMeta): Promise<IssuedRefreshToken> {
    const token = this.newToken();
    await this.prisma.refreshToken.create({
      data: { userId, familyId, tokenHash: hashToken(token), expiresAt, ip: meta.ip, userAgent: meta.userAgent },
    });
    return { token, expiresAt };
  }

  private newToken(): string {
    return randomBytes(32).toString('base64url');
  }
}
