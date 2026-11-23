import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { seedDemo } from '../../../prisma/seed-data.js';
import { FakePrisma } from '../../../test/support/fake-prisma.js';
import { AuditService } from '../../audit/audit.service.js';
import { ACCOUNT_LOCKED, AuthService, INVALID_CREDENTIALS } from './auth.service.js';
import { PasswordService } from './password.service.js';
import { SessionService } from './session.service.js';

const META = { ip: '10.0.0.1', userAgent: 'vitest' };
const SETTINGS: Record<string, unknown> = {
  REFRESH_TTL_DAYS: 7,
  JWT_ACCESS_TTL_SECONDS: 900,
  LOGIN_MAX_FAILURES: 5,
  LOGIN_LOCK_MINUTES: 15,
};
const config = { get: (key: string) => SETTINGS[key] } as never;

describe('AuthService', () => {
  let db: FakePrisma;
  let passwords: PasswordService;
  let jwt: JwtService;
  let auth: AuthService;

  beforeEach(async () => {
    db = new FakePrisma();
    await seedDemo(db as never, 'demo1234');
    passwords = new PasswordService();
    jwt = new JwtService({ secret: 's'.repeat(32), signOptions: { expiresIn: 900 } });
    const audit = new AuditService(db as never);
    auth = new AuthService(db as never, passwords, new SessionService(db as never, audit, config), jwt, audit, config);
  });

  it('inicia sesión: token con el contenido mínimo, sesión abierta y último acceso registrado', async () => {
    const result = await auth.login(' Ana@Ejemplo.test ', 'demo1234', META);
    const payload = await jwt.verifyAsync(result.accessToken);
    expect(payload).toMatchObject({ sub: 'u1', role: 'STUDENT', sv: 0 });
    expect(Object.keys(payload).sort()).toEqual(['exp', 'iat', 'role', 'sub', 'sv']);
    expect(result.expiresIn).toBe(900);
    expect(result.refresh.token).toBeTruthy();
    expect(db.userByEmail('ana@ejemplo.test').lastLoginAt).toBeInstanceOf(Date);
  });

  it('un correo inexistente también ejecuta una verificación argon2 (mismo tiempo) y el mismo mensaje', async () => {
    const dummy = vi.spyOn(passwords, 'verifyDummy');
    await expect(auth.login('nadie@ejemplo.test', 'x', META)).rejects.toThrow(INVALID_CREDENTIALS);
    expect(dummy).toHaveBeenCalledOnce();
    await expect(auth.login('ana@ejemplo.test', 'x', META)).rejects.toThrow(INVALID_CREDENTIALS);
  });

  it('bloquea tras el quinto fallo y no verifica la contraseña mientras dure el bloqueo', async () => {
    for (let i = 0; i < 5; i++) await expect(auth.login('ana@ejemplo.test', 'mala', META)).rejects.toBeInstanceOf(UnauthorizedException);
    const verify = vi.spyOn(passwords, 'verify');
    await expect(auth.login('ana@ejemplo.test', 'demo1234', META)).rejects.toThrow(ACCOUNT_LOCKED);
    expect(verify).not.toHaveBeenCalled();
    expect(db.actions().filter((a) => a === 'ACCOUNT_LOCKED')).toHaveLength(1);
  });

  it('tras vencer el bloqueo, los fallos vuelven a contarse desde cero', async () => {
    for (let i = 0; i < 5; i++) await auth.login('ana@ejemplo.test', 'mala', META).catch(() => undefined);
    db.userByEmail('ana@ejemplo.test').lockedUntil = new Date(Date.now() - 1);
    await auth.login('ana@ejemplo.test', 'mala', META).catch(() => undefined);
    const user = db.userByEmail('ana@ejemplo.test');
    expect(user.failedLogins).toBe(1);
    expect(user.lockedUntil).toBeNull();
  });

  it('cerrar todas las sesiones incrementa la versión de sesión y revoca los tokens', async () => {
    await auth.login('ana@ejemplo.test', 'demo1234', META);
    await auth.logoutAll('u1', META);
    expect(db.userByEmail('ana@ejemplo.test').sessionVersion).toBe(1);
    expect(db.refreshTokens.every((t) => t.revokedReason === 'LOGOUT_ALL')).toBe(true);
  });

  it('cambiar la contraseña exige la actual, rechaza repetirla y nunca registra contraseñas en la bitácora', async () => {
    await expect(auth.changePassword('u1', 'mala', 'NuevaClave1', META)).rejects.toBeInstanceOf(BadRequestException);
    await expect(auth.changePassword('u1', 'demo1234', 'demo1234', META)).rejects.toThrow(/distinta/);
    await auth.changePassword('u1', 'demo1234', 'NuevaClave1', META);
    const user = db.userByEmail('ana@ejemplo.test');
    expect(await passwords.verify(user.passwordHash, 'NuevaClave1')).toBe(true);
    expect(user.sessionVersion).toBe(1);
    expect(JSON.stringify(db.auditLogs)).not.toMatch(/demo1234|NuevaClave1|\$argon2/);
  });

  it('cerrar sesión sin cookie no falla', async () => {
    await expect(auth.logout(undefined, META)).resolves.toBeUndefined();
  });
});
