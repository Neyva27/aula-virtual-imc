import { toApiRole, toFrontendRole, toFrontendUser, UnknownRoleError } from './auth-api.mapper';
import { apiUser } from './testing/auth-api.fixtures';

describe('Conversión de roles y perfil de la API (B1.3)', () => {
  it('convierte los roles en ambos sentidos', () => {
    expect(toFrontendRole('INSTRUCTOR')).toBe('instructor');
    expect(toFrontendRole('STUDENT')).toBe('participant');
    expect(toApiRole('instructor')).toBe('INSTRUCTOR');
    expect(toApiRole('participant')).toBe('STUDENT');
  });

  it('un rol desconocido es un error: nunca se asigna un perfil por defecto', () => {
    for (const role of ['ADMIN', 'admin', 'instructor', '', null, undefined]) {
      expect(() => toFrontendRole(role)).toThrow(UnknownRoleError);
    }
  });

  it('convierte el perfil del estudiante con su DNI', () => {
    expect(toFrontendUser(apiUser())).toEqual({
      id: 'u1',
      fullName: 'Ana Torres Quispe',
      firstNames: 'Ana',
      lastNames: 'Torres Quispe',
      email: 'ana@ejemplo.test',
      dni: '00000001',
      role: 'participant',
      mustChangePassword: false,
    });
  });

  it('convierte el perfil del Instructor (sin DNI) y la contraseña temporal', () => {
    const user = toFrontendUser(apiUser({ id: 'a1', role: 'INSTRUCTOR', student: null, mustChangePassword: true }));
    expect(user.role).toBe('instructor');
    expect(user.dni).toBeUndefined();
    expect(user.mustChangePassword).toBe(true);
  });
});
