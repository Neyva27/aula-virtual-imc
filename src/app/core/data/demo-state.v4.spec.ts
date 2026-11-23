import {
  DEMO_INSTRUCTOR_NEW_NAME,
  DEMO_INSTRUCTOR_OLD_NAME,
  DemoStateV3,
  isDemoState,
  isDemoStateV3,
  migrateV2,
  migrateV3toV4,
  verifyMigrationV4,
} from './demo-state';
import { SEED_V2 } from './seed';

/** Estado v3 de prueba (el mismo camino que un estado guardado antes de B1.2). Datos ficticios. */
function v3State(): DemoStateV3 {
  return migrateV2(structuredClone(SEED_V2));
}

describe('Migración v3 → v4 (B1.2)', () => {
  it('produce un estado v4 válido y reconoce los formatos', () => {
    const v3 = v3State();
    const v4 = migrateV3toV4(v3);
    expect(isDemoStateV3(v3)).toBe(true);
    expect(isDemoState(v3)).toBe(false);
    expect(isDemoState(v4)).toBe(true);
    expect(isDemoStateV3(v4)).toBe(false);
    expect(verifyMigrationV4(v3, v4)).toEqual([]);
  });

  it('convierte «admin» en «instructor» y conserva el resto de los roles, correos, DNI e identificadores', () => {
    const v3 = v3State();
    const v4 = migrateV3toV4(v3);
    expect(v4.users.map((u) => [u.id, u.role, u.email, u.dni])).toEqual(
      v3.users.map((u) => [u.id, u.role === 'admin' ? 'instructor' : 'participant', u.email, u.dni]),
    );
    expect(v4.users.find((u) => u.id === 'a1')!.email).toBe('admin@ejemplo.test'); // correo conservado
  });

  it('cambia el nombre de a1 a «Instructor de Prueba» solo si conserva el original', () => {
    const v4 = migrateV3toV4(v3State());
    expect(v4.users.find((u) => u.id === 'a1')).toMatchObject({
      fullName: DEMO_INSTRUCTOR_NEW_NAME,
      firstNames: 'Instructor',
      lastNames: 'de Prueba',
    });

    const custom = v3State();
    custom.users.find((u) => u.id === 'a1')!.fullName = 'Lucía Paredes Ríos';
    const migrated = migrateV3toV4(custom).users.find((u) => u.id === 'a1')!;
    expect(migrated).toMatchObject({ fullName: 'Lucía Paredes Ríos', firstNames: 'Lucía', lastNames: 'Paredes Ríos', nameReview: true });
    expect(migrated.fullName).not.toBe(DEMO_INSTRUCTOR_OLD_NAME);
  });

  it('separa nombres y apellidos: conocidos para la demostración, automáticos (y para revisar) para los demás', () => {
    const v3 = v3State();
    v3.users.push({ id: 'u-extra', fullName: 'María José Quispe Rojas', email: 'extra@ejemplo.test', dni: '00000077', role: 'participant' });
    v3.users.find((u) => u.id === 'u2')!.fullName = 'Luis Alberto Mendoza';
    const users = migrateV3toV4(v3).users;
    expect(users.find((u) => u.id === 'u1')).toMatchObject({ fullName: 'Ana Torres Quispe', firstNames: 'Ana', lastNames: 'Torres Quispe' });
    expect(users.find((u) => u.id === 'u1')!.nameReview).toBeUndefined();
    expect(users.find((u) => u.id === 'u2')).toMatchObject({ firstNames: 'Luis', lastNames: 'Alberto Mendoza', nameReview: true });
    expect(users.find((u) => u.id === 'u-extra')).toMatchObject({
      fullName: 'María José Quispe Rojas',
      firstNames: 'María',
      lastNames: 'José Quispe Rojas',
      nameReview: true,
    });
  });

  it('copia sin cambios todas las demás colecciones y no modifica el estado original', () => {
    const v3 = v3State();
    const before = JSON.stringify(v3);
    const v4 = migrateV3toV4(v3);
    expect(JSON.stringify(v3)).toBe(before);
    for (const key of ['courses', 'modules', 'videos', 'exams', 'questions', 'enrollments', 'attempts', 'certificates'] as const) {
      expect(v4[key]).toEqual(v3[key]);
      expect(v4[key]).not.toBe(v3[key]); // copia, no la misma referencia
    }
  });

  it('es repetible: migrar dos veces el mismo v3 da exactamente el mismo resultado', () => {
    const v3 = v3State();
    expect(JSON.stringify(migrateV3toV4(v3))).toBe(JSON.stringify(migrateV3toV4(v3)));
  });

  it('la verificación detecta pérdidas o alteraciones', () => {
    const v3 = v3State();
    const lostAttempt = migrateV3toV4(v3);
    lostAttempt.attempts.pop();
    expect(verifyMigrationV4(v3, lostAttempt).join()).toMatch(/attempts/);

    const changedEmail = migrateV3toV4(v3);
    changedEmail.users[0].email = 'otro@ejemplo.test';
    expect(verifyMigrationV4(v3, changedEmail).join()).toMatch(/correo/);

    const wrongRole = migrateV3toV4(v3);
    wrongRole.users.find((u) => u.id === 'a1')!.role = 'participant';
    expect(verifyMigrationV4(v3, wrongRole).join()).toMatch(/rol/);

    const lostUser = migrateV3toV4(v3);
    lostUser.users.pop();
    expect(verifyMigrationV4(v3, lostUser).join()).toMatch(/Usuarios/);

    const badNames = migrateV3toV4(v3);
    badNames.users[0].lastNames = 'Otro';
    expect(verifyMigrationV4(v3, badNames).join()).toMatch(/nombres y apellidos/);
  });

  it('un rol desconocido en v3 hace fallar la verificación (no se convierte en silencio)', () => {
    const v3 = v3State();
    (v3.users[0] as { role: string }).role = 'superadmin';
    expect(verifyMigrationV4(v3, migrateV3toV4(v3)).join()).toMatch(/rol «superadmin»/);
  });
});
