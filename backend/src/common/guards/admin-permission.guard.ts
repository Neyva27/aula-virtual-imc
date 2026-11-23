import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AuditService } from '../../audit/audit.service.js';
import { Role } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AuthUser } from '../auth-user.js';
import { ADMIN_PERMISSIONS_KEY, isAdminPermission } from '../decorators.js';

/** Mismo mensaje que RolesGuard: no se revela qué permiso falta. */
export const ADMIN_FORBIDDEN_MESSAGE = 'No tienes permiso para realizar esta acción.';

/**
 * B2.2a. Guard global (después de JwtAuthGuard y RolesGuard). Si la ruta (método o clase) declara permisos
 * administrativos con @RequireAdminPermission / @GeneralAdmin / @AdminController:
 * - el usuario autenticado debe tener el rol INSTRUCTOR (el permiso no sustituye al rol);
 * - y TODOS los permisos declarados en `instructor_permissions`, consultados en la base en CADA solicitud.
 *   Por eso retirar un permiso surte efecto de inmediato y el token de acceso no cambia (no lleva permisos).
 * Deniega por defecto: sin usuario, con un permiso desconocido o vacío, o sin la fila del permiso → 403.
 * La identidad sale solo de `request.user` (JwtAuthGuard); se ignoran parámetros, encabezados y cuerpo.
 */
@Injectable()
export class AdminPermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Se combinan método y clase: si ambos declaran permisos, se exigen todos.
    const declared = [context.getHandler(), context.getClass()]
      .map((target) => this.reflector.get<unknown>(ADMIN_PERMISSIONS_KEY, target))
      .filter((value) => value !== undefined);
    if (!declared.length) return true;

    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const user = request.user;
    const required = declared.flatMap((value) => (Array.isArray(value) ? (value as unknown[]) : [value]));

    if (!required.length || !required.every(isAdminPermission)) return this.deny(request, user, 'INVALID_PERMISSION');
    if (!user || user.role !== Role.INSTRUCTOR) return this.deny(request, user, 'ROLE');

    const held = await this.prisma.instructorPermission.findMany({
      where: { instructorId: user.id, permission: { in: required } },
      select: { permission: true },
    });
    const granted = new Set<string>(held.map((row) => row.permission));
    if (!required.every((permission) => granted.has(permission))) return this.deny(request, user, 'MISSING_PERMISSION');
    return true;
  }

  private async deny(request: Request, user: AuthUser | undefined, reason: string): Promise<never> {
    // Se registra el intento (sin datos de la petición más allá del método y la ruta) para detectar sondeos.
    await this.audit.log({
      action: 'ADMIN_ACCESS_DENIED',
      actorId: user?.id ?? null,
      ip: request.ip ?? null,
      data: { reason, method: request.method, path: request.path },
    });
    throw new ForbiddenException(ADMIN_FORBIDDEN_MESSAGE);
  }
}
