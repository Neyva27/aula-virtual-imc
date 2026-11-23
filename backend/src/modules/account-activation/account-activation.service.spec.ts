/**
 * B2.3c: AccountActivationService con la base simulada y un proveedor de correo SIMULADO (no se envía ningún correo
 * real). El flujo HTTP completo está en test/b2-3c.e2e-spec.ts.
 */
import { BadRequestException, Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedDemo } from '../../../prisma/seed-data.js';
import { FakeMailSender } from '../../../test/support/fake-mail.js';
import { FakePrisma } from '../../../test/support/fake-prisma.js';
import { AuditService } from '../../audit/audit.service.js';
import { UnconfiguredMailSender, type MailSender } from '../../mail/mail-sender.js';
import { PasswordService } from '../auth/password.service.js';
import { AccountActivationService, hashActivationToken, INVALID_ACTIVATION_LINK } from './account-activation.service.js';

const passwords = new PasswordService();
const NEW_PASSWORD = 'ClaveNueva2026';

function build(db: FakePrisma, mail: MailSender, env: Record<string, unknown> = {}) {
  const values: Record<string, unknown> = { ACTIVATION_TOKEN_TTL_HOURS: 72, ACTIVATION_URL: 'https://aula.ejemplo.test/activar-cuenta', ...env };
  const config = { get: (key: string) => values[key] };
  return new AccountActivationService(db as never, passwords, new AuditService(db as never), config as never, mail);
}

/** Estudiante pendiente «p1» (como lo deja el registro de B2.3c) en una base con la semilla de demostración. */
async function pendingStudent(db: FakePrisma) {
  await seedDemo(db as never, 'demo1234');
  await db.user.create({
    data: {
      id: 'p1',
      email: 'p1@prueba.test',
      role: 'STUDENT',
      firstNames: 'Paula',
      lastNames: 'Pendiente',
      passwordHash: await passwords.hash('secreto-aleatorio-desconocido'),
      activationPending: true,
    },
  });
  await db.student.create({ data: { userId: 'p1', dni: '10000001' } });
  db.auditLogs = [];
}

describe('AccountActivationService (B2.3c)', () => {
  let db: FakePrisma;
  let mail: FakeMailSender;
  let service: AccountActivationService;
  let logged: string[];

  beforeEach(async () => {
    db = new FakePrisma();
    await pendingStudent(db);
    mail = new FakeMailSender();
    service = build(db, mail);
    logged = [];
    for (const level of ['log', 'warn', 'error', 'debug', 'verbose'] as const) {
      vi.spyOn(Logger.prototype, level).mockImplementation((message: unknown) => void logged.push(String(message)));
    }
  });
  afterEach(() => vi.restoreAllMocks());

  const issue = () => db.$transaction((tx) => service.issue(tx as never, 'p1', 'a1'));

  describe('emisión', () => {
    it('guarda solo el hash SHA-256 del token, con vencimiento de 72 h por defecto', async () => {
      const before = Date.now();
      const issued = await issue();
      expect(issued.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(db.activationTokens).toHaveLength(1);
      const [row] = db.activationTokens;
      expect(row.tokenHash).toBe(hashActivationToken(issued.token));
      expect(row.tokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect(JSON.stringify(db.activationTokens)).not.toContain(issued.token);
      expect(row.expiresAt.getTime() - before).toBeGreaterThanOrEqual(72 * 3_600_000 - 1_000);
      expect(row).toMatchObject({ userId: 'p1', issuedById: 'a1', usedAt: null, revokedAt: null });
    });

    it('emitir un enlace nuevo anula los anteriores sin usar', async () => {
      const first = await issue();
      await issue();
      const old = db.activationTokens.find((t) => t.tokenHash === hashActivationToken(first.token))!;
      expect(old.revokedAt).toBeInstanceOf(Date);
      await expect(service.activate(first.token, NEW_PASSWORD, null)).rejects.toThrow(INVALID_ACTIVATION_LINK);
    });
  });

  describe('envío del correo', () => {
    const recipient = { userId: 'p1', email: 'p1@prueba.test', firstNames: 'Paula' };

    it('con el proveedor (simulado) aceptando: enlace con el token tras «#token=», sin contraseña', async () => {
      const issued = await issue();
      const res = await service.deliver(recipient, issued, 'a1');
      expect(res).toEqual({ status: 'PENDING', emailDelivery: 'SENT', expiresAt: issued.expiresAt.toISOString() });
      expect(mail.sent).toHaveLength(1);
      expect(mail.sent[0].to).toBe('p1@prueba.test');
      expect(mail.sent[0].text).toContain(`https://aula.ejemplo.test/activar-cuenta#token=${issued.token}`);
      expect(mail.sent[0].text).not.toMatch(/contraseña:\s*\S/i);
      expect(db.auditLogs).toEqual([expect.objectContaining({ action: 'ACTIVATION_EMAIL_SENT', actorId: 'a1', entityId: 'p1' })]);
    });

    it('sin proveedor real (el de la aplicación) o sin ACTIVATION_URL: NOT_CONFIGURED, nunca «enviado»', async () => {
      const issued = await issue();
      expect((await build(db, new UnconfiguredMailSender()).deliver(recipient, issued, 'a1')).emailDelivery).toBe('NOT_CONFIGURED');
      expect((await build(db, mail, { ACTIVATION_URL: undefined }).deliver(recipient, issued, 'a1')).emailDelivery).toBe('NOT_CONFIGURED');
      expect(mail.sent).toHaveLength(0);
    });

    it('si el proveedor falla: FAILED, sin lanzar, y sin token ni dirección en registros o bitácora', async () => {
      const issued = await issue();
      mail.failNext = true;
      const res = await service.deliver(recipient, issued, 'a1');
      expect(res.emailDelivery).toBe('FAILED');
      expect(db.auditLogs).toEqual([
        expect.objectContaining({ action: 'ACTIVATION_EMAIL_FAILED', entityId: 'p1', data: { reason: 'FAILED' } }),
      ]);
      const everything = JSON.stringify([logged, db.auditLogs]);
      expect(logged.length).toBeGreaterThan(0);
      expect(everything).not.toContain(issued.token);
      expect(everything).not.toContain('p1@prueba.test');
    });
  });

  describe('MAIL_DEV_CONSOLE (solo desarrollo local)', () => {
    const recipient = { userId: 'p1', email: 'p1@prueba.test', firstNames: 'Paula' };

    it('escribe el enlace en la consola, responde DEV_CONSOLE y NO envía ningún correo', async () => {
      const issued = await issue();
      const res = await build(db, mail, { MAIL_DEV_CONSOLE: true, NODE_ENV: 'development' }).deliver(recipient, issued, 'a1');
      expect(res.emailDelivery).toBe('DEV_CONSOLE');
      expect(res.status).toBe('PENDING');
      expect(mail.sent).toHaveLength(0);
      const consoleText = logged.join('\n');
      expect(consoleText).toContain(`https://aula.ejemplo.test/activar-cuenta#token=${issued.token}`);
      expect(consoleText).toContain('NO se envió ningún correo');
      // La bitácora registra el resultado sin el token ni el enlace.
      expect(db.auditLogs).toEqual([expect.objectContaining({ action: 'ACTIVATION_LINK_DEV_CONSOLE', entityId: 'p1' })]);
      expect(JSON.stringify(db.auditLogs)).not.toContain(issued.token);
    });

    it('sin ACTIVATION_URL: NOT_CONFIGURED y ningún enlace en la consola', async () => {
      const issued = await issue();
      const res = await build(db, mail, { MAIL_DEV_CONSOLE: true, NODE_ENV: 'development', ACTIVATION_URL: undefined }).deliver(
        recipient,
        issued,
        'a1',
      );
      expect(res.emailDelivery).toBe('NOT_CONFIGURED');
      expect(logged.join('\n')).not.toContain(issued.token);
    });

    it('en producción nunca escribe el enlace (aunque la validación del entorno ya lo impide)', async () => {
      const issued = await issue();
      const res = await build(db, new UnconfiguredMailSender(), { MAIL_DEV_CONSOLE: true, NODE_ENV: 'production' }).deliver(
        recipient,
        issued,
        'a1',
      );
      expect(res.emailDelivery).toBe('NOT_CONFIGURED');
      expect(logged.join('\n')).not.toContain(issued.token);
    });

    it('desactivado (por defecto): comportamiento anterior', async () => {
      const issued = await issue();
      expect((await build(db, new UnconfiguredMailSender()).deliver(recipient, issued, 'a1')).emailDelivery).toBe('NOT_CONFIGURED');
      expect(logged.join('\n')).not.toContain(issued.token);
    });
  });

  describe('activación', () => {
    it('token válido: crea la contraseña (argon2id), activa la cuenta y consume el token', async () => {
      const issued = await issue();
      const versionBefore = db.userByEmail('p1@prueba.test').sessionVersion;
      await service.activate(issued.token, NEW_PASSWORD, '10.0.0.1');
      const user = db.userByEmail('p1@prueba.test');
      expect(user.activationPending).toBe(false);
      expect(user.mustChangePassword).toBe(false);
      expect(user.passwordHash).toMatch(/^\$argon2id\$/);
      expect(user.passwordHash).not.toContain(NEW_PASSWORD);
      expect(await passwords.verify(user.passwordHash, NEW_PASSWORD)).toBe(true);
      expect(user.sessionVersion).toBe(versionBefore + 1);
      expect(db.activationTokens[0].usedAt).toBeInstanceOf(Date);
      expect(db.auditLogs.at(-1)).toMatchObject({ action: 'STUDENT_ACCOUNT_ACTIVATED', actorId: 'p1', entityId: 'p1', ip: '10.0.0.1' });
      expect(JSON.stringify(db.auditLogs)).not.toMatch(new RegExp(`${issued.token}|${NEW_PASSWORD}`));
    });

    it('activar no cambia empresas, matrículas ni otros datos del estudiante', async () => {
      await db.company.create({ data: { id: 'emp-x', name: 'Empresa X de prueba', ruc: '20123456789' } });
      await db.studentCompany.create({ data: { studentId: 'p1', companyId: 'emp-x' } });
      const issued = await issue();
      const before = JSON.stringify([db.studentCompanies, db.enrollments, db.students, db.companies]);
      await service.activate(issued.token, NEW_PASSWORD, null);
      expect(JSON.stringify([db.studentCompanies, db.enrollments, db.students, db.companies])).toBe(before);
    });

    it('reutilizado, alterado, inexistente, mal formado o vencido → el MISMO 400', async () => {
      const issued = await issue();
      await service.activate(issued.token, NEW_PASSWORD, null);
      const tampered = `${issued.token.slice(0, -1)}${issued.token.endsWith('A') ? 'B' : 'A'}`;
      const expired = await db.$transaction((tx) => service.issue(tx as never, 'u1', 'a1')); // otra cuenta, luego vencida
      db.activationTokens.find((t) => t.tokenHash === hashActivationToken(expired.token))!.expiresAt = new Date(Date.now() - 1_000);
      for (const token of [issued.token, tampered, 'A'.repeat(43), 'no-es-un-token', expired.token]) {
        const attempt = service.activate(token, NEW_PASSWORD, null);
        await expect(attempt).rejects.toBeInstanceOf(BadRequestException);
        await expect(attempt).rejects.toThrow(INVALID_ACTIVATION_LINK);
      }
      const reasons = db.auditLogs.filter((a) => a.action === 'ACCOUNT_ACTIVATION_FAILED').map((a) => (a.data as { reason: string }).reason);
      expect(reasons).toEqual(['USED', 'UNKNOWN', 'UNKNOWN', 'MALFORMED', 'EXPIRED']);
      expect(JSON.stringify(db.auditLogs)).not.toContain(issued.token);
    });

    it('cuenta ya activada con un enlace aún vigente → 400, y no se toca la contraseña', async () => {
      const issued = await issue();
      const user = db.userByEmail('p1@prueba.test');
      user.activationPending = false;
      const hashBefore = user.passwordHash;
      await expect(service.activate(issued.token, NEW_PASSWORD, null)).rejects.toThrow(INVALID_ACTIVATION_LINK);
      expect(user.passwordHash).toBe(hashBefore);
      expect(db.auditLogs.at(-1)).toMatchObject({ action: 'ACCOUNT_ACTIVATION_FAILED', data: { reason: 'ALREADY_ACTIVE' } });
    });

    it('dos activaciones simultáneas con el mismo token: solo una prospera', async () => {
      const issued = await issue();
      const results = await Promise.allSettled([
        service.activate(issued.token, NEW_PASSWORD, null),
        service.activate(issued.token, 'OtraClave2026', null),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(db.auditLogs.filter((a) => a.action === 'STUDENT_ACCOUNT_ACTIVATED')).toHaveLength(1);
    });
  });
});
