import { UnauthorizedException } from '@nestjs/common';
import { beforeEach, describe, expect, it } from 'vitest';
import { FakePrisma } from '../../../test/support/fake-prisma.js';
import { AuditService } from '../../audit/audit.service.js';
import { hashToken, SessionService } from './session.service.js';

const META = { ip: '127.0.0.1', userAgent: 'vitest' };
const config = { get: (key: string) => ({ REFRESH_TTL_DAYS: 7 })[key] } as never;

describe('SessionService (rotación y revocación)', () => {
  let db: FakePrisma;
  let sessions: SessionService;

  beforeEach(async () => {
    db = new FakePrisma();
    await db.user.create({ data: { id: 'u1', email: 'ana@ejemplo.test', role: 'STUDENT', firstNames: 'Ana', lastNames: 'T', passwordHash: 'x' } });
    sessions = new SessionService(db as never, new AuditService(db as never), config);
  });

  it('abre una sesión de 7 días y guarda solo el hash SHA-256 del token', async () => {
    const issued = await sessions.open('u1', META);
    expect(issued.token).toMatch(/^[A-Za-z0-9_-]{43}$/); // 256 bits en base64url
    const row = db.refreshTokens[0];
    expect(row.tokenHash).toBe(hashToken(issued.token));
    expect(row.tokenHash).not.toBe(issued.token);
    const days = (issued.expiresAt.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.99);
    expect(days).toBeLessThanOrEqual(7);
  });

  it('rota: revoca el token usado, emite otro de la misma familia y conserva el vencimiento', async () => {
    const first = await sessions.open('u1', META);
    const { userId, refresh } = await sessions.rotate(first.token, META);
    expect(userId).toBe('u1');
    expect(refresh.token).not.toBe(first.token);
    expect(refresh.expiresAt.getTime()).toBe(first.expiresAt.getTime());
    const [old, next] = db.refreshTokens;
    expect(old.revokedReason).toBe('ROTATED');
    expect(next.familyId).toBe(old.familyId);
    expect(next.revokedAt).toBeNull();
  });

  it('detecta la reutilización de un token rotado y revoca toda la familia', async () => {
    const first = await sessions.open('u1', META);
    const { refresh } = await sessions.rotate(first.token, META);
    await expect(sessions.rotate(first.token, META)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(sessions.rotate(refresh.token, META)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(db.refreshTokens.every((t) => t.revokedAt)).toBe(true);
    expect(db.refreshTokens[1].revokedReason).toBe('REUSE_DETECTED');
    expect(db.actions()).toContain('REFRESH_REUSE_DETECTED');
  });

  it('si dos renovaciones usan el mismo token a la vez, solo una gana', async () => {
    const first = await sessions.open('u1', META);
    const results = await Promise.allSettled([sessions.rotate(first.token, META), sessions.rotate(first.token, META)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });

  it('rechaza tokens desconocidos, vencidos o de usuarios desactivados', async () => {
    await expect(sessions.rotate('desconocido', META)).rejects.toBeInstanceOf(UnauthorizedException);

    const expired = await sessions.open('u1', META);
    db.refreshTokens[0].expiresAt = new Date(Date.now() - 1);
    await expect(sessions.rotate(expired.token, META)).rejects.toBeInstanceOf(UnauthorizedException);

    const other = await sessions.open('u1', META);
    db.userByEmail('ana@ejemplo.test').active = false;
    await expect(sessions.rotate(other.token, META)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(db.refreshTokens[1].revokedAt).not.toBeNull();
  });

  it('cierra la sesión del token y todas las sesiones del usuario', async () => {
    const a = await sessions.open('u1', META);
    await sessions.open('u1', META);
    expect(await sessions.closeByToken(a.token)).toBe('u1');
    expect(db.refreshTokens[0].revokedReason).toBe('LOGOUT');
    expect(db.refreshTokens[1].revokedAt).toBeNull();
    expect(await sessions.closeByToken('desconocido')).toBeNull();

    await sessions.revokeAllForUser('u1', 'LOGOUT_ALL');
    expect(db.refreshTokens.every((t) => t.revokedAt)).toBe(true);
  });
});
