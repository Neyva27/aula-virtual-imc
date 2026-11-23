import { describe, expect, it } from 'vitest';
import { poolConfigFromUrl } from './prisma.service.js';

describe('poolConfigFromUrl', () => {
  it('separa la URL en datos de conexión, decodifica la clave y fija tiempos máximos', () => {
    const config = poolConfigFromUrl('mysql://aula_imc:cl%40ve@localhost:3307/aula_imc_dev');
    expect(config).toMatchObject({
      host: 'localhost',
      port: 3307,
      user: 'aula_imc',
      password: 'cl@ve',
      database: 'aula_imc_dev',
      connectTimeout: 3_000,
      acquireTimeout: 5_000,
    });
  });

  it('no permite obtener la clave pública salvo que se indique (DB_ALLOW_PUBLIC_KEY_RETRIEVAL)', () => {
    expect(poolConfigFromUrl('mysql://u:c@localhost/db').allowPublicKeyRetrieval).toBe(false);
    expect(poolConfigFromUrl('mysql://u:c@localhost/db', true).allowPublicKeyRetrieval).toBe(true);
    expect(poolConfigFromUrl('mysql://u:c@localhost/db').port).toBe(3306);
  });
});
