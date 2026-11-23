import { describe, expect, it } from 'vitest';
import { Prisma } from '../../generated/prisma/client.js';
import { validationMessages } from '../../app.setup.js';
import { isDatabaseUnavailable } from './all-exceptions.filter.js';

describe('isDatabaseUnavailable', () => {
  it('reconoce los errores de conexión con MySQL', () => {
    const pool = new Prisma.PrismaClientKnownRequestError('pool failed to retrieve a connection from pool', {
      code: 'P2010',
      clientVersion: 'test',
    });
    expect(isDatabaseUnavailable(pool)).toBe(true);
    expect(isDatabaseUnavailable(new Prisma.PrismaClientKnownRequestError('x', { code: 'P1001', clientVersion: 'test' }))).toBe(true);
    expect(isDatabaseUnavailable(new Error("Access denied for user 'aula_imc'@'localhost'"))).toBe(true);
  });

  it('no confunde otros errores con una caída de la base', () => {
    expect(isDatabaseUnavailable(new Prisma.PrismaClientKnownRequestError('Unique', { code: 'P2002', clientVersion: 'test' }))).toBe(false);
    expect(isDatabaseUnavailable(new Error('otro error'))).toBe(false);
    expect(isDatabaseUnavailable('texto')).toBe(false);
  });
});

describe('validationMessages', () => {
  it('traduce los campos no permitidos e incluye los anidados', () => {
    const messages = validationMessages([
      { property: 'role', constraints: { whitelistValidation: 'property role should not exist' }, children: [] },
      { property: 'email', constraints: { isEmail: 'Ingresa un correo electrónico válido.' }, children: [] },
      { property: 'perfil', children: [{ property: 'dni', constraints: { matches: 'DNI inválido.' }, children: [] }] },
    ]);
    expect(messages).toEqual(['El campo «role» no está permitido.', 'Ingresa un correo electrónico válido.', 'DNI inválido.']);
  });
});
