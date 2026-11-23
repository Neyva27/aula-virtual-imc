import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AccessTokenPayload, AuthUser } from '../auth-user.js';
import { ALLOW_PENDING_PASSWORD_KEY, IS_PUBLIC_KEY } from '../decorators.js';

const UNAUTHORIZED = 'Tu sesión no es válida o venció. Inicia sesión nuevamente.';
/** Código estable para que el frontend redirija a la pantalla de cambio de contraseña. */
export const PASSWORD_CHANGE_REQUIRED = 'PasswordChangeRequired';
export const PASSWORD_CHANGE_MESSAGE = 'Debes cambiar tu contraseña temporal antes de continuar.';

/**
 * Guard global: exige un token de acceso válido salvo en las rutas marcadas con @Public().
 * Además del token, comprueba en la base que el usuario siga activo y que su versión de sesión coincida,
 * para que «cerrar todas las sesiones», desactivar una cuenta o cambiar la contraseña surtan efecto de inmediato.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const [scheme, token] = (request.headers.authorization ?? '').split(' ');
    if (scheme !== 'Bearer' || !token) throw new UnauthorizedException(UNAUTHORIZED);

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token);
    } catch {
      throw new UnauthorizedException(UNAUTHORIZED);
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, role: true, active: true, sessionVersion: true, mustChangePassword: true, activationPending: true },
    });
    // B2.3c: una cuenta pendiente de activación nunca tiene sesión válida (defensa adicional; no puede iniciar sesión).
    if (!user || !user.active || user.activationPending || user.sessionVersion !== payload.sv || user.role !== payload.role) {
      throw new UnauthorizedException(UNAUTHORIZED);
    }

    // Contraseña temporal (por ejemplo, la del primer Instructor): solo se permite cambiarla, ver el perfil y salir.
    const allowedWhilePending = this.reflector.getAllAndOverride<boolean>(ALLOW_PENDING_PASSWORD_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (user.mustChangePassword && !allowedWhilePending) {
      throw new ForbiddenException({ statusCode: 403, error: PASSWORD_CHANGE_REQUIRED, message: PASSWORD_CHANGE_MESSAGE });
    }

    request.user = {
      id: user.id,
      role: user.role,
      sessionVersion: user.sessionVersion,
      mustChangePassword: user.mustChangePassword,
    };
    return true;
  }
}
