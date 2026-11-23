import { applyDecorators, Controller, createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import { AdminPermission, Role } from '../generated/prisma/enums.js';
import type { AuthUser } from './auth-user.js';

export const IS_PUBLIC_KEY = 'isPublic';
export const ROLES_KEY = 'roles';
export const ALLOW_PENDING_PASSWORD_KEY = 'allowPendingPasswordChange';
/** B2.2a: permisos administrativos especiales que exige una ruta (AdminPermissionGuard, global). */
export const ADMIN_PERMISSIONS_KEY = 'adminPermissions';
/** B2.2a: prefijo reservado de las rutas administrativas. Toda ruta bajo él DEBE exigir un permiso (ver AdminRoutesVerifier). */
export const ADMIN_ROUTE_PREFIX = 'admin';

/**
 * Ruta permitida aunque el usuario deba cambiar su contraseña (mustChangePassword). Sin este decorador,
 * JwtAuthGuard responde 403 «PasswordChangeRequired». Se usa solo en perfil, cambio de contraseña y cierre de sesión.
 */
export const AllowPendingPasswordChange = () => SetMetadata(ALLOW_PENDING_PASSWORD_KEY, true);

/** Ruta accesible sin token de acceso. Todas las demás están protegidas por JwtAuthGuard (global). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Restringe la ruta a los roles indicados (RolesGuard, global). */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

const KNOWN_PERMISSIONS: readonly string[] = Object.values(AdminPermission);

/** El valor es un permiso administrativo definido en el esquema (enum `AdminPermission`). */
export function isAdminPermission(value: unknown): value is AdminPermission {
  return typeof value === 'string' && KNOWN_PERMISSIONS.includes(value);
}

/**
 * B2.2a: exige que el usuario autenticado tenga TODOS los permisos administrativos indicados (AdminPermissionGuard).
 * El permiso se comprueba en la base en cada solicitud; nunca se toma del token ni de la petición.
 * Falla al definir la ruta (al cargar la aplicación) si no se indica ningún permiso o si alguno no existe.
 */
export function RequireAdminPermission(...permissions: AdminPermission[]) {
  if (!permissions.length || !permissions.every(isAdminPermission)) {
    throw new Error('RequireAdminPermission: indica al menos un permiso administrativo existente.');
  }
  return SetMetadata(ADMIN_PERMISSIONS_KEY, [...permissions]);
}

/**
 * B2.2a: operación de la administración general de IMC. Exige el rol INSTRUCTOR **y** el permiso
 * IMC_GENERAL_ADMIN. Un Instructor sin el permiso y un estudiante reciben 403.
 */
export const GeneralAdmin = () =>
  applyDecorators(Roles(Role.INSTRUCTOR), RequireAdminPermission(AdminPermission.IMC_GENERAL_ADMIN));

/**
 * B2.2a: controlador administrativo. Monta las rutas bajo `/admin/<ruta>` y protege TODAS con `@GeneralAdmin()`
 * a nivel de clase, para que ningún método nuevo quede abierto por olvido.
 */
export const AdminController = (path: string) =>
  applyDecorators(Controller(`${ADMIN_ROUTE_PREFIX}/${path.replace(/^\/+/, '')}`), GeneralAdmin());

/** Usuario autenticado de la solicitud. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest<Request & { user: AuthUser }>().user,
);
