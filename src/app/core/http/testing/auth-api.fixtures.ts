import { ApiUser } from '../auth-api.mapper';

/** SOLO PARA PRUEBAS: perfil de la API con datos ficticios de la semilla de desarrollo. */
export function apiUser(overrides: Partial<ApiUser> = {}): ApiUser {
  return {
    id: 'u1',
    email: 'ana@ejemplo.test',
    role: 'STUDENT',
    firstNames: 'Ana',
    lastNames: 'Torres Quispe',
    fullName: 'Ana Torres Quispe',
    active: true,
    mustChangePassword: false,
    lastLoginAt: null,
    student: { dni: '00000001', companies: [{ id: 'emp-demo', name: 'Empresa de demostración', ruc: '00000000001' }] },
    ...overrides,
  };
}
