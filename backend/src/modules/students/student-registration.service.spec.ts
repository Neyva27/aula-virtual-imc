/**
 * B2.3c: StudentRegistrationService (registro y reenvío del enlace) con la base simulada y un proveedor de correo
 * SIMULADO: no se envía ningún correo real. HTTP completo: test/b2-3c.e2e-spec.ts.
 */
import { ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it } from 'vitest';
import { seedDemo } from '../../../prisma/seed-data.js';
import { FakeMailSender } from '../../../test/support/fake-mail.js';
import { FakePrisma } from '../../../test/support/fake-prisma.js';
import { AuditService } from '../../audit/audit.service.js';
import { CompanyScopeService } from '../../authz/company-scope.service.js';
import { Role } from '../../generated/prisma/enums.js';
import { UnconfiguredMailSender, type MailSender } from '../../mail/mail-sender.js';
import { AccountActivationService, hashActivationToken } from '../account-activation/account-activation.service.js';
import { PasswordService } from '../auth/password.service.js';
import {
  ALREADY_ACTIVATED,
  DNI_TAKEN,
  DUPLICATE_ACCOUNT,
  EMAIL_TAKEN,
  INACTIVE_ACCOUNT,
  StudentRegistrationService,
} from './student-registration.service.js';
import { StudentsService } from './students.service.js';

const passwords = new PasswordService();
const as = (id: string) => ({ id, role: Role.INSTRUCTOR, sessionVersion: 0, mustChangePassword: false });
const ctx = (id = 'a1') => ({ actor: as(id), ip: '10.0.0.1' });
// RUC: valores de prueba ya usados en pruebas anteriores, y un marcador claramente no real.
const RUC_A = '20123456789';
const RUC_MARKER = 'ABC-1234567';
const INPUT = { firstNames: 'Paula', lastNames: 'Nueva Prueba', email: 'paula@prueba.test', dni: '20000001', companyIds: ['emp-demo'] };

function build(db: FakePrisma, mail: MailSender) {
  const config = { get: (key: string) => ({ ACTIVATION_TOKEN_TTL_HOURS: 72, ACTIVATION_URL: 'https://aula.ejemplo.test/activar-cuenta' })[key] };
  const scope = new CompanyScopeService(db as never);
  const activation = new AccountActivationService(db as never, passwords, new AuditService(db as never), config as never, mail);
  return new StudentRegistrationService(db as never, scope, passwords, activation, new StudentsService(db as never, scope));
}

/** a1 → emp-demo y emp-y; i2 → emp-x; i3 sin empresas. */
async function scenario(db: FakePrisma) {
  await seedDemo(db as never, 'demo1234');
  await db.company.create({ data: { id: 'emp-x', name: 'Empresa X de prueba', ruc: RUC_A } });
  await db.company.create({ data: { id: 'emp-y', name: 'Empresa Y de prueba', ruc: RUC_MARKER } });
  for (const id of ['i2', 'i3']) {
    await db.user.create({ data: { id, email: `${id}@prueba.test`, role: 'INSTRUCTOR', firstNames: 'I', lastNames: id, passwordHash: 'h' } });
    await db.instructor.create({ data: { userId: id } });
  }
  await db.instructorCompany.create({ data: { instructorId: 'i2', companyId: 'emp-x' } });
  await db.instructorCompany.create({ data: { instructorId: 'a1', companyId: 'emp-y' } });
  db.auditLogs = [];
}

describe('StudentRegistrationService (B2.3c)', () => {
  let db: FakePrisma;
  let mail: FakeMailSender;
  let service: StudentRegistrationService;
  const counts = () => ({
    users: db.users.length,
    students: db.students.length,
    links: db.studentCompanies.length,
    tokens: db.activationTokens.length,
    enrollments: db.enrollments.length,
    audits: db.auditLogs.length,
  });

  beforeEach(async () => {
    db = new FakePrisma();
    await scenario(db);
    mail = new FakeMailSender();
    service = build(db, mail);
  });

  describe('registro', () => {
    it('crea usuario pendiente, perfil, empresas y enlace (hash), sin matrículas ni contraseña conocida', async () => {
      const res = await service.register(INPUT, ctx());
      const user = db.userByEmail('paula@prueba.test');
      expect(user).toMatchObject({ role: 'STUDENT', activationPending: true, active: true, mustChangePassword: false });
      expect(user.passwordHash).toMatch(/^\$argon2id\$/);
      expect(db.students.find((s) => s.userId === user.id)).toMatchObject({ dni: '20000001' });
      expect(db.studentCompanies.filter((l) => l.studentId === user.id)).toEqual([
        expect.objectContaining({ companyId: 'emp-demo', assignedById: 'a1' }),
      ]);
      expect(db.enrollments).toHaveLength(0);
      expect(db.activationTokens).toEqual([expect.objectContaining({ userId: user.id, issuedById: 'a1', usedAt: null })]);
      expect(db.activationTokens[0].tokenHash).toBe(hashActivationToken(mail.lastToken()));

      expect(res.activation).toMatchObject({ status: 'PENDING', emailDelivery: 'SENT' });
      expect(res.student).toMatchObject({ id: user.id, email: 'paula@prueba.test', dni: '20000001', active: true });
      expect(JSON.stringify(res)).not.toContain(mail.lastToken());
      expect(mail.sent[0].to).toBe('paula@prueba.test');

      expect(db.auditLogs.map((a) => a.action)).toEqual(['STUDENT_CREATED', 'ACTIVATION_EMAIL_SENT']);
      expect(db.auditLogs[0]).toMatchObject({ actorId: 'a1', entity: 'student', entityId: user.id, ip: '10.0.0.1', data: { companyIds: ['emp-demo'] } });
      expect(JSON.stringify(db.auditLogs)).not.toMatch(/paula@prueba|20000001|Paula|Nueva Prueba/);
      expect(JSON.stringify(db.auditLogs)).not.toContain(mail.lastToken());
    });

    it('guarda quién lo registró (del contexto autenticado) y solo ese Instructor lo ve', async () => {
      const { student } = await service.register(INPUT, ctx());
      expect(db.students.find((s) => s.userId === student.id)!.registeredById).toBe('a1');
      const scope = new CompanyScopeService(db as never);
      expect(await scope.canAccessStudent(as('a1'), student.id)).toBe(true);
      expect(await scope.canAccessStudent(as('i2'), student.id)).toBe(false);
    });

    it.each([
      ['sin el campo companyIds', (({ companyIds: _omit, ...rest }) => rest)(INPUT)],
      ['con companyIds vacío', { ...INPUT, companyIds: [] }],
    ])('sin empresas (%s): se registra, vinculado solo a quien lo registró', async (_label, input) => {
      const res = await service.register(input as typeof INPUT, ctx('i3')); // i3 no tiene empresas
      const user = db.userByEmail('paula@prueba.test');
      expect(db.students.find((s) => s.userId === user.id)).toMatchObject({ registeredById: 'i3' });
      expect(db.studentCompanies.filter((l) => l.studentId === user.id)).toEqual([]);
      expect(res.student).toMatchObject({ id: user.id, companies: [] });
      expect(res.activation.status).toBe('PENDING');
      expect(db.auditLogs[0]).toMatchObject({ action: 'STUDENT_CREATED', actorId: 'i3', data: { companyIds: [] } });
    });

    it('varias empresas propias (repetidos ignorados)', async () => {
      const res = await service.register({ ...INPUT, companyIds: ['emp-demo', 'emp-y', 'emp-y'] }, ctx());
      expect(res.student.companies.map((c) => c.id)).toEqual(['emp-demo', 'emp-y']);
    });

    it('empresa inexistente → 404 sin crear nada (opción A: cualquier empresa existente y activa es válida)', async () => {
      const before = counts();
      await expect(service.register({ ...INPUT, companyIds: ['emp-demo', 'no-existe'] }, ctx())).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.register({ ...INPUT, companyIds: ['no-existe'] }, ctx())).rejects.toBeInstanceOf(NotFoundException);
      expect(counts()).toEqual(before);
      expect(mail.sent).toHaveLength(0);
    });

    it('empresa inactiva → 409 sin crear nada', async () => {
      db.companies.find((c) => c.id === 'emp-y')!.active = false;
      const before = counts();
      await expect(service.register({ ...INPUT, companyIds: ['emp-demo', 'emp-y'] }, ctx())).rejects.toThrow(
        'La empresa «Empresa Y de prueba» está desactivada y no admite nuevas asignaciones.',
      );
      expect(counts()).toEqual(before);
    });

    it('correo o DNI ya registrados → 409 (mensajes del frontend), sin vincular a la cuenta existente', async () => {
      const before = counts();
      await expect(service.register({ ...INPUT, email: 'ANA@ejemplo.test' }, ctx())).rejects.toThrow(EMAIL_TAKEN);
      await expect(service.register({ ...INPUT, dni: '00000001' }, ctx())).rejects.toThrow(DNI_TAKEN);
      // Un correo existente fuera del alcance del Instructor también se rechaza (no se vincula).
      await db.user.create({ data: { id: 'x9', email: 'ajeno@prueba.test', role: 'STUDENT', firstNames: 'A', lastNames: 'B', passwordHash: 'h' } });
      await expect(service.register({ ...INPUT, email: 'ajeno@prueba.test' }, ctx())).rejects.toBeInstanceOf(ConflictException);
      expect(counts()).toEqual({ ...before, users: before.users + 1 });
      expect(db.studentCompanies.some((l) => l.studentId === 'x9')).toBe(false);
    });

    it('error durante la transacción: no queda usuario, perfil, empresas, enlace ni bitácora, y no se envía correo', async () => {
      const before = counts();
      const original = db.studentCompany.create;
      let calls = 0;
      db.studentCompany.create = async (args) => {
        if (++calls === 2) throw new Error('fallo simulado de la base');
        return original(args);
      };
      await expect(service.register({ ...INPUT, companyIds: ['emp-demo', 'emp-y'] }, ctx())).rejects.toThrow('fallo simulado');
      expect(counts()).toEqual(before);
      expect(mail.sent).toHaveLength(0);
    });

    it('carrera con otro registro (clave única) → 409 sin cuenta a medias', async () => {
      const before = counts();
      db.student.create = async () => {
        throw Object.assign(new Error('Unique constraint failed on students'), { code: 'P2002' });
      };
      await expect(service.register(INPUT, ctx())).rejects.toThrow(DUPLICATE_ACCOUNT);
      expect(counts()).toEqual(before);
    });

    it('si falla el correo: la cuenta queda pendiente (FAILED) y el reenvío emite un enlace nuevo', async () => {
      mail.failNext = true;
      const res = await service.register(INPUT, ctx());
      expect(res.activation.emailDelivery).toBe('FAILED');
      const user = db.userByEmail('paula@prueba.test');
      expect(user.activationPending).toBe(true);
      const firstHash = db.activationTokens[0].tokenHash;

      const resent = await service.resendActivation(user.id, ctx());
      expect(resent.activation.emailDelivery).toBe('SENT');
      expect(db.activationTokens).toHaveLength(2);
      expect(db.activationTokens.find((t) => t.tokenHash === firstHash)!.revokedAt).toBeInstanceOf(Date);
      expect(db.auditLogs.map((a) => a.action)).toEqual([
        'STUDENT_CREATED',
        'ACTIVATION_EMAIL_FAILED',
        'STUDENT_ACTIVATION_LINK_ISSUED',
        'ACTIVATION_EMAIL_SENT',
      ]);
    });

    it('sin proveedor de correo real: NOT_CONFIGURED (nunca «enviado») y la cuenta queda pendiente', async () => {
      const res = await build(db, new UnconfiguredMailSender()).register(INPUT, ctx());
      expect(res.activation.emailDelivery).toBe('NOT_CONFIGURED');
      expect(db.userByEmail('paula@prueba.test').activationPending).toBe(true);
    });
  });

  describe('reenvío del enlace', () => {
    it('fuera del alcance → 404; cuenta ya activada → 409; cuenta desactivada → 409', async () => {
      const { student } = await service.register(INPUT, ctx());
      await expect(service.resendActivation(student.id, ctx('i2'))).rejects.toBeInstanceOf(NotFoundException);
      // u1 (cuenta de la semilla, ya activa): la semilla no indica quién lo registró → fuera del alcance de a1 (404).
      await expect(service.resendActivation('u1', ctx())).rejects.toBeInstanceOf(NotFoundException);
      await db.student.update({ where: { userId: 'u1' }, data: { registeredById: 'a1' } });
      await expect(service.resendActivation('u1', ctx())).rejects.toThrow(ALREADY_ACTIVATED);
      db.userByEmail('paula@prueba.test').active = false;
      await expect(service.resendActivation(student.id, ctx())).rejects.toThrow(INACTIVE_ACCOUNT);
    });
  });
});
