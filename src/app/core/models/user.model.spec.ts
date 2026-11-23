import { normalizeRole, splitFullName } from './user.model';

describe('Rol Instructor y nombres (B1.2)', () => {
  it('normalizeRole convierte el rol anterior «admin» en «instructor» y conserva los vigentes', () => {
    expect(normalizeRole('admin')).toBe('instructor');
    expect(normalizeRole('instructor')).toBe('instructor');
    expect(normalizeRole('participant')).toBe('participant');
  });

  it('normalizeRole rechaza valores desconocidos', () => {
    for (const value of ['ADMIN', 'superadmin', '', null, undefined, 1]) expect(normalizeRole(value)).toBeNull();
  });

  it('splitFullName separa la primera palabra como nombres y el resto como apellidos', () => {
    expect(splitFullName('Ana Torres Quispe')).toEqual({ firstNames: 'Ana', lastNames: 'Torres Quispe' });
    expect(splitFullName('  María   José  Pérez ')).toEqual({ firstNames: 'María', lastNames: 'José Pérez' });
    expect(splitFullName('Rosa')).toEqual({ firstNames: 'Rosa', lastNames: '' });
  });
});
