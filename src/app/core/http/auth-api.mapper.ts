import { Role, User } from '../models/user.model';

/** Roles del backend (NestJS, enum Role de Prisma). */
export type ApiRole = 'INSTRUCTOR' | 'STUDENT';

/** Empresa resumida del perfil (`CompanySummaryDto` del backend). */
export interface ApiCompanySummary {
  id: string;
  name: string;
  ruc: string;
}

/**
 * Perfil de usuario que devuelve la API (`UserDto` del backend). Desde B2.1 el estudiante puede pertenecer a varias
 * empresas: `student.companies` (ordenadas por nombre; vacía si no tiene). Antes era `student.company`.
 */
export interface ApiUser {
  id: string;
  email: string;
  role: ApiRole;
  firstNames: string;
  lastNames: string;
  fullName: string;
  active: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  student: { dni: string; companies: ApiCompanySummary[] } | null;
}

/** Respuesta de POST /auth/login y POST /auth/refresh. */
export interface ApiAuthResponse {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: ApiUser;
}

/** El rol recibido no es uno de los dos perfiles conocidos: no se asigna ninguno por defecto. */
export class UnknownRoleError extends Error {
  constructor(role: unknown) {
    super(`El servidor devolvió un perfil no reconocido («${String(role)}»). No se inició la sesión.`);
    this.name = 'UnknownRoleError';
  }
}

const TO_FRONTEND: Record<ApiRole, Role> = { INSTRUCTOR: 'instructor', STUDENT: 'participant' };
const TO_API: Record<Role, ApiRole> = { instructor: 'INSTRUCTOR', participant: 'STUDENT' };

export function toFrontendRole(role: unknown): Role {
  if (role === 'INSTRUCTOR' || role === 'STUDENT') return TO_FRONTEND[role];
  throw new UnknownRoleError(role);
}

export function toApiRole(role: Role): ApiRole {
  return TO_API[role];
}

/** Convierte el perfil de la API al modelo del frontend. */
export function toFrontendUser(user: ApiUser): User {
  return {
    id: user.id,
    fullName: user.fullName,
    firstNames: user.firstNames,
    lastNames: user.lastNames,
    email: user.email,
    ...(user.student?.dni ? { dni: user.student.dni } : {}),
    role: toFrontendRole(user.role),
    mustChangePassword: user.mustChangePassword === true,
  };
}
