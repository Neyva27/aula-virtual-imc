import { Injectable } from '@nestjs/common';
import argon2 from 'argon2';

/** Parámetros mínimos recomendados por OWASP para argon2id (19 MiB, 2 iteraciones, 1 hilo). */
const ARGON2_OPTIONS = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

@Injectable()
export class PasswordService {
  private dummyHash: Promise<string> | null = null;

  hash(plain: string): Promise<string> {
    return argon2.hash(plain, ARGON2_OPTIONS);
  }

  /** Devuelve false ante cualquier error (hash con formato inválido, por ejemplo): nunca lanza. */
  async verify(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      return false;
    }
  }

  /**
   * Verificación contra un hash ficticio, para que un correo inexistente tarde lo mismo que una contraseña
   * incorrecta y no se pueda deducir qué cuentas existen midiendo el tiempo de respuesta.
   */
  async verifyDummy(plain: string): Promise<void> {
    this.dummyHash ??= this.hash('contraseña-ficticia-para-igualar-tiempos');
    await this.verify(await this.dummyHash, plain);
  }
}
