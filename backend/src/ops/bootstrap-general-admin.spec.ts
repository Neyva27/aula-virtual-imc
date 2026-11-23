import { describe, expect, it } from 'vitest';
import { seedDemo } from '../../prisma/seed-data.js';
import { FakePrisma } from '../../test/support/fake-prisma.js';
import { PasswordService } from '../modules/auth/password.service.js';
import { createFirstInstructor } from './bootstrap-instructor.js';
import { BootstrapRefusedError } from './bootstrap-instructor.js';
import { grantFirstGeneralAdmin, normalizeEmail } from './bootstrap-general-admin.js';

const passwords = new PasswordService();
const hash = (plain: string) => passwords.hash(plain);

async function withInstructor() {
  const db = new FakePrisma();
  const created = await createFirstInstructor(db as never, { email: 'directora@empresa.pe', firstNames: 'María', lastNames: 'Quispe' }, hash);
  return { db, created };
}

describe('grantFirstGeneralAdmin (admin:grant-general)', () => {
  it('otorga el permiso al Instructor indicado sin cambiar su rol, contraseña, cambio obligatorio ni sesiones', async () => {
    const { db, created } = await withInstructor();
    const before = { ...db.userByEmail('directora@empresa.pe') };

    const result = await grantFirstGeneralAdmin(db as never, '  Directora@Empresa.PE ');

    expect(result).toEqual({ userId: created.id, email: 'directora@empresa.pe' });
    expect(db.instructorPermissions).toEqual([
      expect.objectContaining({ instructorId: created.id, permission: 'IMC_GENERAL_ADMIN', grantedById: null }),
    ]);
    const after = db.userByEmail('directora@empresa.pe');
    expect(after).toEqual(before); // rol INSTRUCTOR, hash, mustChangePassword y sessionVersion intactos
    expect(after.role).toBe('INSTRUCTOR');
    expect(db.auditLogs.at(-1)).toMatchObject({
      action: 'GENERAL_ADMIN_GRANTED',
      actorId: null,
      entity: 'user',
      entityId: created.id,
      data: { method: 'cli', permission: 'IMC_GENERAL_ADMIN' },
    });
  });

  it('se niega si ya hay una cuenta activa con el permiso (incluida la misma)', async () => {
    const { db } = await withInstructor();
    await seedDemo(db as never, 'demo1234'); // agrega el Instructor de demostración a1
    await grantFirstGeneralAdmin(db as never, 'directora@empresa.pe');
    await expect(grantFirstGeneralAdmin(db as never, 'admin@ejemplo.test')).rejects.toThrow(/Ya existe una cuenta activa/);
    await expect(grantFirstGeneralAdmin(db as never, 'directora@empresa.pe')).rejects.toThrow(/Ya existe una cuenta activa/);
    expect(db.instructorPermissions).toHaveLength(1);
  });

  it('admite habilitar otra cuenta si la única con el permiso está desactivada (recuperación por consola)', async () => {
    const { db } = await withInstructor();
    await seedDemo(db as never, 'demo1234');
    await grantFirstGeneralAdmin(db as never, 'directora@empresa.pe');
    db.userByEmail('directora@empresa.pe').active = false;
    await expect(grantFirstGeneralAdmin(db as never, 'admin@ejemplo.test')).resolves.toMatchObject({ userId: 'a1' });
  });

  it('rechaza cuentas inexistentes, estudiantes, desactivadas o sin perfil de Instructor, sin escribir nada', async () => {
    const db = new FakePrisma();
    await seedDemo(db as never, 'demo1234');
    await db.user.create({ data: { id: 'sin-perfil', email: 'sinperfil@prueba.test', role: 'INSTRUCTOR', firstNames: 'N', lastNames: 'A', passwordHash: 'h' } });
    await db.user.create({ data: { id: 'inactivo', email: 'inactivo@prueba.test', role: 'INSTRUCTOR', firstNames: 'N', lastNames: 'A', passwordHash: 'h', active: false } });
    await db.instructor.create({ data: { userId: 'inactivo' } });
    const audits = db.auditLogs.length;

    await expect(grantFirstGeneralAdmin(db as never, 'nadie@prueba.test')).rejects.toThrow(/No existe una cuenta/);
    await expect(grantFirstGeneralAdmin(db as never, 'ana@ejemplo.test')).rejects.toThrow(/rol Instructor/);
    await expect(grantFirstGeneralAdmin(db as never, 'inactivo@prueba.test')).rejects.toThrow(/desactivada/);
    await expect(grantFirstGeneralAdmin(db as never, 'sinperfil@prueba.test')).rejects.toThrow(/perfil de Instructor/);
    await expect(grantFirstGeneralAdmin(db as never, 'no-es-correo')).rejects.toBeInstanceOf(BootstrapRefusedError);

    expect(db.instructorPermissions).toHaveLength(0);
    expect(db.auditLogs).toHaveLength(audits);
  });

  it('la base rechaza otorgar el permiso a un usuario sin perfil de Instructor (clave foránea simulada)', async () => {
    const db = new FakePrisma();
    await seedDemo(db as never, 'demo1234');
    await expect(db.instructorPermission.create({ data: { instructorId: 'u1', permission: 'IMC_GENERAL_ADMIN' } })).rejects.toThrow(
      /perfil de Instructor/,
    );
  });

  it('normalizeEmail valida y normaliza el correo', () => {
    expect(normalizeEmail(' A@B.PE ')).toBe('a@b.pe');
    expect(() => normalizeEmail('sin-arroba')).toThrow(BootstrapRefusedError);
  });
});
