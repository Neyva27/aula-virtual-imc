import type { Role } from '../generated/prisma/enums.js';

/** Usuario autenticado, adjuntado a la solicitud por JwtAuthGuard. */
export interface AuthUser {
  id: string;
  role: Role;
  sessionVersion: number;
  mustChangePassword: boolean;
}

/** Contenido del token de acceso: lo mínimo para identificar al usuario y su sesión. */
export interface AccessTokenPayload {
  sub: string;
  role: Role;
  /** Versión de sesión del usuario al emitir el token. */
  sv: number;
}
