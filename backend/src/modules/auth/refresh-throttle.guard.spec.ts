import type { ExecutionContext } from '@nestjs/common';
import { ThrottlerException, type ThrottlerStorage } from '@nestjs/throttler';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RefreshThrottleGuard } from './refresh-throttle.guard.js';
import { hashToken } from './session.service.js';

const LIMITS: Record<string, number> = { AUTH_THROTTLE_LIMIT: 2, REFRESH_IP_LIMIT: 6, REFRESH_SESSION_LIMIT: 2, THROTTLE_TTL_SECONDS: 60 };
const future = () => new Date(Date.now() + 60_000);

describe('RefreshThrottleGuard', () => {
  let hits: Map<string, number>;
  let rows: Map<string, { familyId: string; revokedAt: Date | null; expiresAt: Date }>;
  let findUnique: ReturnType<typeof vi.fn>;
  let guard: RefreshThrottleGuard;
  const header = vi.fn();

  const ctx = (token?: string, ip = '10.0.0.1') =>
    ({ switchToHttp: () => ({ getRequest: () => ({ ip, token }), getResponse: () => ({ header }) }) }) as unknown as ExecutionContext;

  beforeEach(() => {
    hits = new Map();
    rows = new Map();
    header.mockClear();
    findUnique = vi.fn(async ({ where }: { where: { tokenHash: string } }) => rows.get(where.tokenHash) ?? null);
    const storage = {
      increment: vi.fn(async (key: string, _ttl: number, limit: number) => {
        const totalHits = (hits.get(key) ?? 0) + 1;
        hits.set(key, totalHits);
        return { totalHits, timeToExpire: 60, isBlocked: totalHits > limit, timeToBlockExpire: 60 };
      }),
    } as unknown as ThrottlerStorage;
    guard = new RefreshThrottleGuard(
      storage,
      { refreshToken: { findUnique } } as never,
      { read: (req: { token?: string }) => req.token } as never,
      { get: (key: string) => LIMITS[key] } as never,
    );
    rows.set(hashToken('sesion-a'), { familyId: 'fam-a', revokedAt: null, expiresAt: future() });
    rows.set(hashToken('sesion-a2'), { familyId: 'fam-a', revokedAt: null, expiresAt: future() });
    rows.set(hashToken('sesion-b'), { familyId: 'fam-b', revokedAt: null, expiresAt: future() });
    rows.set(hashToken('revocado'), { familyId: 'fam-r', revokedAt: new Date(), expiresAt: future() });
    rows.set(hashToken('vencido'), { familyId: 'fam-v', revokedAt: null, expiresAt: new Date(Date.now() - 1000) });
  });

  it('cuenta por sesión: dos sesiones de la misma IP no se bloquean entre sí', async () => {
    await guard.canActivate(ctx('sesion-a'));
    await guard.canActivate(ctx('sesion-a'));
    await expect(guard.canActivate(ctx('sesion-a'))).rejects.toBeInstanceOf(ThrottlerException);
    expect(header).toHaveBeenCalledWith('Retry-After', '60');
    await expect(guard.canActivate(ctx('sesion-b'))).resolves.toBe(true);
  });

  it('la rotación no reinicia el contador: el token nuevo sigue en la misma familia', async () => {
    await guard.canActivate(ctx('sesion-a'));
    await guard.canActivate(ctx('sesion-a2'));
    await expect(guard.canActivate(ctx('sesion-a2'))).rejects.toBeInstanceOf(ThrottlerException);
  });

  it.each(['desconocido', 'revocado', 'vencido', undefined])('token %s: usa el límite estricto por IP', async (token) => {
    await guard.canActivate(ctx(token));
    await guard.canActivate(ctx(token));
    await expect(guard.canActivate(ctx(token))).rejects.toBeInstanceOf(ThrottlerException);
    expect(hits.get('refresh:invalid:10.0.0.1')).toBe(3);
    expect([...hits.keys()].some((k) => k.startsWith('refresh:session:'))).toBe(false);
  });

  it('solicitudes inválidas no bloquean a una sesión válida de la misma IP', async () => {
    for (let i = 0; i < 2; i++) await guard.canActivate(ctx('falso'));
    await expect(guard.canActivate(ctx('falso'))).rejects.toBeInstanceOf(ThrottlerException);
    await expect(guard.canActivate(ctx('sesion-b'))).resolves.toBe(true);
  });

  it('sin cookie no consulta la base; al superar el techo por IP tampoco', async () => {
    await guard.canActivate(ctx(undefined));
    expect(findUnique).not.toHaveBeenCalled();
    hits.set('refresh:ip:10.0.0.1', 6);
    await expect(guard.canActivate(ctx('sesion-a'))).rejects.toBeInstanceOf(ThrottlerException);
    expect(findUnique).not.toHaveBeenCalled();
  });
});
