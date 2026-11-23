import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../../audit/audit.service.js';
import type { Env } from '../../config/env.validation.js';
import type { AccessTokenPayload } from '../../common/auth-user.js';
import { toUserDto, USER_PUBLIC_SELECT, type UserDto } from '../users/user.dto.js';
import { PasswordService } from './password.service.js';
import { SessionService, type ClientMeta, type IssuedRefreshToken } from './session.service.js';

/** Mismo mensaje para correo inexistente y contraseña incorrecta: no revela qué cuentas existen. */
export const INVALID_CREDENTIALS = 'Correo o contraseña incorrectos.';
export const ACCOUNT_LOCKED =
  'Tu cuenta está bloqueada temporalmente por varios intentos fallidos. Inténtalo nuevamente en unos minutos.';
export const ACCOUNT_DISABLED = 'Tu cuenta está desactivada. Comunícate con tu instructor.';

export interface AuthResult {
  accessToken: string;
  expiresIn: number;
  user: UserDto;
  refresh: IssuedRefreshToken;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async login(emailInput: string, password: string, meta: ClientMeta): Promise<AuthResult> {
    const email = emailInput.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, passwordHash: true, active: true, failedLogins: true, lockedUntil: true, activationPending: true },
    });

    if (!user) {
      await this.passwords.verifyDummy(password);
      await this.audit.log({ action: 'LOGIN_FAILED', ip: meta.ip, data: { reason: 'UNKNOWN_ACCOUNT' } });
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    const now = Date.now();
    if (user.lockedUntil && user.lockedUntil.getTime() > now) {
      await this.audit.log({ action: 'LOGIN_FAILED', actorId: user.id, ip: meta.ip, data: { reason: 'LOCKED' } });
      throw new UnauthorizedException(ACCOUNT_LOCKED);
    }

    if (!(await this.passwords.verify(user.passwordHash, password))) {
      await this.registerFailure(user.id, user.lockedUntil ? 0 : user.failedLogins, meta);
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    // B2.3c: cuenta pendiente de activación. Su hash es el de un secreto aleatorio que nadie conoce, así que en la
    // práctica ya falló arriba; esta comprobación es una defensa adicional y responde igual que una contraseña errónea.
    if (user.activationPending) {
      await this.audit.log({ action: 'LOGIN_FAILED', actorId: user.id, ip: meta.ip, data: { reason: 'ACTIVATION_PENDING' } });
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    if (!user.active) {
      await this.audit.log({ action: 'LOGIN_FAILED', actorId: user.id, ip: meta.ip, data: { reason: 'DISABLED' } });
      throw new UnauthorizedException(ACCOUNT_DISABLED);
    }

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date(now) },
      select: { ...USER_PUBLIC_SELECT, sessionVersion: true },
    });
    const refresh = await this.sessions.open(user.id, meta);
    await this.audit.log({ action: 'LOGIN_OK', actorId: user.id, ip: meta.ip });
    return { ...(await this.accessFor(updated.id, updated.role, updated.sessionVersion)), user: toUserDto(updated), refresh };
  }

  async refresh(token: string, meta: ClientMeta): Promise<AuthResult> {
    const { userId, refresh } = await this.sessions.rotate(token, meta);
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { ...USER_PUBLIC_SELECT, sessionVersion: true },
    });
    if (!user) throw new UnauthorizedException('Tu sesión no es válida o venció. Inicia sesión nuevamente.');
    return { ...(await this.accessFor(user.id, user.role, user.sessionVersion)), user: toUserDto(user), refresh };
  }

  /** Cierra la sesión del token de la cookie. Es idempotente: sin token o con uno inválido no falla. */
  async logout(token: string | undefined, meta: ClientMeta): Promise<void> {
    if (!token) return;
    const userId = await this.sessions.closeByToken(token);
    if (userId) await this.audit.log({ action: 'LOGOUT', actorId: userId, ip: meta.ip });
  }

  /** Cierra todas las sesiones: revoca los tokens de renovación e invalida los tokens de acceso emitidos. */
  async logoutAll(userId: string, meta: ClientMeta): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { sessionVersion: { increment: 1 } } });
    await this.sessions.revokeAllForUser(userId, 'LOGOUT_ALL');
    await this.audit.log({ action: 'LOGOUT_ALL', actorId: userId, ip: meta.ip });
  }

  /** Cambia la contraseña y cierra todas las sesiones: hay que volver a iniciar sesión. */
  async changePassword(userId: string, current: string, next: string, meta: ClientMeta): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
    if (!user || !(await this.passwords.verify(user.passwordHash, current))) {
      throw new BadRequestException('La contraseña actual no es correcta.');
    }
    if (current === next) throw new BadRequestException('La nueva contraseña debe ser distinta de la actual.');
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: await this.passwords.hash(next),
        mustChangePassword: false,
        sessionVersion: { increment: 1 },
      },
    });
    await this.sessions.revokeAllForUser(userId, 'PASSWORD_CHANGED');
    await this.audit.log({ action: 'PASSWORD_CHANGED', actorId: userId, ip: meta.ip });
  }

  private async registerFailure(userId: string, previousFailures: number, meta: ClientMeta): Promise<void> {
    const max = this.config.get('LOGIN_MAX_FAILURES', { infer: true });
    const failures = previousFailures + 1;
    const lock = failures >= max;
    const minutes = this.config.get('LOGIN_LOCK_MINUTES', { infer: true });
    await this.prisma.user.update({
      where: { id: userId },
      data: lock
        ? { failedLogins: 0, lockedUntil: new Date(Date.now() + minutes * 60_000) }
        : { failedLogins: failures, lockedUntil: null },
    });
    await this.audit.log({ action: 'LOGIN_FAILED', actorId: userId, ip: meta.ip, data: { reason: 'BAD_PASSWORD', failures } });
    if (lock) await this.audit.log({ action: 'ACCOUNT_LOCKED', actorId: userId, ip: meta.ip, data: { minutes } });
  }

  private async accessFor(id: string, role: AccessTokenPayload['role'], sv: number) {
    const payload: AccessTokenPayload = { sub: id, role, sv };
    return {
      accessToken: await this.jwt.signAsync(payload),
      expiresIn: this.config.get('JWT_ACCESS_TTL_SECONDS', { infer: true }),
    };
  }
}
