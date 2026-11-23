import { describe, expect, it } from 'vitest';
import { seedDemo } from '../../prisma/seed-data.js';
import { FakePrisma } from '../../test/support/fake-prisma.js';
import { PasswordService } from '../modules/auth/password.service.js';
import {
  BootstrapRefusedError,
  createFirstInstructor,
  generateTemporaryPassword,
  validateInstructorInput,
} from './bootstrap-instructor.js';

const INPUT = { email: ' Directora@Empresa.PE ', firstNames: ' María  José ', lastNames: 'Quispe Rojas' };
const passwords = new PasswordService();
const hash = (plain: string) => passwords.hash(plain);

describe('generateTemporaryPassword', () => {
  it('genera 20 caracteres con minúscula, mayúscula y dígito, sin caracteres ambiguos, distinta cada vez', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const p = generateTemporaryPassword();
      expect(p).toHaveLength(20);
      expect(p).toMatch(/[a-z]/);
      expect(p).toMatch(/[A-Z]/);
      expect(p).toMatch(/\d/);
      expect(p).not.toMatch(/[0O1lI]/);
      seen.add(p);
    }
    expect(seen.size).toBe(200);
  });
});

describe('validateInstructorInput', () => {
  it('normaliza correo y espacios', () => {
    expect(validateInstructorInput(INPUT)).toEqual({ email: 'directora@empresa.pe', firstNames: 'María José', lastNames: 'Quispe Rojas' });
  });

  it('rechaza correo inválido y nombres demasiado cortos', () => {
    expect(() => validateInstructorInput({ ...INPUT, email: 'no-es-correo' })).toThrow(BootstrapRefusedError);
    expect(() => validateInstructorInput({ ...INPUT, firstNames: 'A' })).toThrow(/nombres/);
    expect(() => validateInstructorInput({ ...INPUT, lastNames: ' ' })).toThrow(/apellidos/);
  });
});

describe('createFirstInstructor (admin:create)', () => {
  it('crea el primer Instructor con contraseña temporal, cambio obligatorio y registro en la bitácora', async () => {
    const db = new FakePrisma();
    const result = await createFirstInstructor(db as never, INPUT, hash);

    expect(result.email).toBe('directora@empresa.pe');
    const user = db.userByEmail('directora@empresa.pe');
    expect(user).toMatchObject({ role: 'INSTRUCTOR', firstNames: 'María José', mustChangePassword: true, active: true });
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    expect(user.passwordHash).not.toContain(result.temporaryPassword);
    expect(await passwords.verify(user.passwordHash, result.temporaryPassword)).toBe(true);
    // B2.1: se crea con su perfil de Instructor y sin empresas asignadas.
    expect(db.instructors.map((i) => i.userId)).toEqual([result.id]);
    expect(db.instructorCompanies).toHaveLength(0);

    expect(db.auditLogs).toHaveLength(1);
    expect(db.auditLogs[0]).toMatchObject({ action: 'INSTRUCTOR_BOOTSTRAP', entity: 'user', entityId: result.id, actorId: null });
    expect(JSON.stringify(db.auditLogs)).not.toContain(result.temporaryPassword);
  });

  it('se niega si ya existe un Instructor activo (no crea nada)', async () => {
    const db = new FakePrisma();
    await createFirstInstructor(db as never, INPUT, hash);
    await expect(createFirstInstructor(db as never, { ...INPUT, email: 'otro@empresa.pe' }, hash)).rejects.toThrow(
      /Ya existe un Instructor activo/,
    );
    expect(db.users).toHaveLength(1);
  });

  it('también se niega en una base con el Instructor de demostración', async () => {
    const db = new FakePrisma();
    await seedDemo(db as never, 'demo1234');
    await expect(createFirstInstructor(db as never, INPUT, hash)).rejects.toBeInstanceOf(BootstrapRefusedError);
  });

  it('admite crearlo si el único Instructor existente está desactivado', async () => {
    const db = new FakePrisma();
    await createFirstInstructor(db as never, INPUT, hash);
    db.userByEmail('directora@empresa.pe').active = false;
    await expect(createFirstInstructor(db as never, { ...INPUT, email: 'nueva@empresa.pe' }, hash)).resolves.toMatchObject({
      email: 'nueva@empresa.pe',
    });
  });

  it('rechaza un correo ya registrado', async () => {
    const db = new FakePrisma();
    await db.user.create({ data: { email: 'directora@empresa.pe', role: 'STUDENT', firstNames: 'A', lastNames: 'B', passwordHash: 'h' } });
    await expect(createFirstInstructor(db as never, INPUT, hash)).rejects.toThrow(/Ya existe un usuario con ese correo/);
  });
});
