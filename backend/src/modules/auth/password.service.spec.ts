import { describe, expect, it } from 'vitest';
import { PasswordService } from './password.service.js';

describe('PasswordService (argon2id)', () => {
  const service = new PasswordService();

  it('genera un hash argon2id distinto del texto y distinto en cada llamada', async () => {
    const a = await service.hash('demo1234');
    const b = await service.hash('demo1234');
    expect(a).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(a).not.toContain('demo1234');
    expect(a).not.toBe(b); // sal aleatoria
  });

  it('verifica la contraseña correcta y rechaza la incorrecta', async () => {
    const hash = await service.hash('demo1234');
    expect(await service.verify(hash, 'demo1234')).toBe(true);
    expect(await service.verify(hash, 'Demo1234')).toBe(false);
    expect(await service.verify(hash, '')).toBe(false);
  });

  it('no lanza con un hash inválido: devuelve false', async () => {
    expect(await service.verify('no-es-un-hash', 'demo1234')).toBe(false);
  });

  it('la verificación ficticia no lanza (iguala el tiempo de un correo inexistente)', async () => {
    await expect(service.verifyDummy('cualquiera')).resolves.toBeUndefined();
  });
});
