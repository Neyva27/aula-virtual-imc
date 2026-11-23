import { randomBytes } from 'node:crypto';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { Role } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CompanyScopeService, STUDENT_NOT_FOUND } from '../../authz/company-scope.service.js';
import { PasswordService } from '../auth/password.service.js';
import { AccountActivationService, type IssuedActivationToken } from '../account-activation/account-activation.service.js';
import type { ActivationStatusDto, RegisterStudentDto, RegisterStudentResultDto, ResendActivationResultDto, WhatsappActivationResultDto } from './student.dto.js';
import { companyInactiveForStudents, StudentsService, type InstructorContext } from './students.service.js';

/** Mensajes iguales a los del frontend en modo demostración (`addParticipant`). */
export const EMAIL_TAKEN = 'Ya existe un usuario con ese correo electrónico.';
export const DNI_TAKEN = 'Ya existe un participante con ese DNI.';
export const DUPLICATE_ACCOUNT = 'Ya existe un usuario con ese correo electrónico o DNI.';
export const ALREADY_ACTIVATED = 'La cuenta del estudiante ya está activada.';
export const INACTIVE_ACCOUNT = 'La cuenta del estudiante está desactivada.';
export const COMPANY_NAME_OTHER_RUC =
  'Ya existe una empresa con esa razón social y otro RUC. Revisa el RUC o elige la empresa existente en el buscador.';
/** Empresa desactivada con el RUC indicado: no se duplica ni se reactiva automáticamente (20/11/2026). */
export const companyRucInactive = (ruc: string, name: string) =>
  `La empresa con RUC ${ruc} («${name}») está desactivada: no admite participantes nuevos y no se reactiva automáticamente.`;

export const NO_WHATSAPP = 'El participante no tiene un número de WhatsApp registrado. Agrégalo antes de generar el enlace.';
export const ACTIVATION_URL_MISSING = 'El servidor no tiene configurada la dirección de activación (ACTIVATION_URL).';
export const NO_LINK_TO_OPEN = 'No hay un enlace de activación vigente. Genera uno nuevo.';

/** wa.me exige el código de país: un celular de 9 dígitos es peruano (+51). El número guardado no se modifica. */
export const whatsappDigits = (phone: string) => (phone.startsWith('+') ? phone.slice(1) : `51${phone}`);

/** Mensaje sin nombre, DNI ni correo: viaja en la URL de wa.me. Nunca incluye una contraseña. */
export function whatsappActivationMessage(link: string, expiresAt: Date): string {
  const expires = expiresAt.toLocaleString('es-PE', { timeZone: 'America/Lima', dateStyle: 'long', timeStyle: 'short' });
  return [
    'Hola. Te registraron en el Aula Virtual IMC.',
    'Para activar tu cuenta y crear tu contraseña, abre este enlace personal:',
    link,
    `Se puede usar una sola vez y vence el ${expires} (hora de Lima). No lo compartas.`,
  ].join('\n');
}

const WRITE_TX = { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted } as const;
const unique = (ids: readonly string[]) => [...new Set(ids)];

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002';
}

/**
 * B2.3c: registro de estudiantes por el Instructor y reenvío del enlace de activación.
 *
 * Registro (todo o nada, en una transacción): usuario STUDENT pendiente de activación, perfil con DNI y con el
 * Instructor que lo registró (`registered_by`, que decide quién lo ve), sus empresas si se indican (opcionales desde el
 * 17/11/2026) y el enlace de activación (solo su hash). La contraseña inicial es el hash argon2id de un secreto aleatorio que nadie
 * conoce: la cuenta no sirve para iniciar sesión hasta que el estudiante cree la suya con el enlace. No se crean
 * matrículas (B2.4). El correo se envía DESPUÉS de confirmar: si falla, la cuenta queda pendiente (estado explícito) y
 * se informa en la respuesta; el Instructor puede reenviar el enlace.
 */
@Injectable()
export class StudentRegistrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: CompanyScopeService,
    private readonly passwords: PasswordService,
    private readonly activation: AccountActivationService,
    private readonly students: StudentsService,
  ) {}

  async register(rawInput: RegisterStudentDto, ctx: InstructorContext): Promise<RegisterStudentResultDto> {
    // El DTO ya normaliza; se repite aquí para que la unicidad no dependa de quién llame al servicio.
    const input = {
      firstNames: rawInput.firstNames,
      lastNames: rawInput.lastNames,
      email: rawInput.email.trim().toLowerCase(),
      dni: rawInput.dni.trim(),
      whatsapp: rawInput.whatsapp ?? null,
      companyIds: rawInput.companyIds ?? [],
      company: rawInput.company ? { name: rawInput.company.name.trim().replace(/\s+/g, ' '), ruc: rawInput.company.ruc.trim() } : null,
    };
    // Empresas OPCIONALES (decisión del 17/11/2026, sustituye a P4). Si se indican, deben ser propias (404) y activas (409).
    const companyIds = unique(input.companyIds);
    await this.scope.assertCompaniesInScope(ctx.actor, companyIds);
    const placeholderHash = await this.passwords.hash(randomBytes(32).toString('base64url'));

    let issued: IssuedActivationToken;
    let userId: string;
    let companyOutcome: 'CREATED' | 'REUSED' | undefined;
    try {
      ({ issued, userId, companyOutcome } = await this.prisma.$transaction(async (tx) => {
        const companies = await tx.company.findMany({ where: { id: { in: companyIds } }, select: { id: true, name: true, active: true } });
        const inactive = companyIds.map((id) => companies.find((c) => c.id === id)).find((c) => c && !c.active);
        if (inactive) throw new ConflictException(companyInactiveForStudents(inactive.name));
        if (await tx.user.findUnique({ where: { email: input.email }, select: { id: true } })) throw new ConflictException(EMAIL_TAKEN);
        if (await tx.student.findUnique({ where: { dni: input.dni } })) throw new ConflictException(DNI_TAKEN);

        // Empresa por razón social y RUC (20/11/2026). Si algo falla después, la transacción no deja la empresa creada.
        let outcome: 'CREATED' | 'REUSED' | undefined;
        if (input.company) {
          const { name, ruc } = input.company;
          const byRuc = await tx.company.findFirst({ where: { ruc }, select: { id: true, name: true, active: true } });
          if (byRuc && !byRuc.active) throw new ConflictException(companyRucInactive(ruc, byRuc.name));
          if (byRuc) {
            outcome = 'REUSED';
            if (!companyIds.includes(byRuc.id)) companyIds.push(byRuc.id);
          } else {
            if (await tx.company.findFirst({ where: { name }, select: { id: true } })) throw new ConflictException(COMPANY_NAME_OTHER_RUC);
            const created = await tx.company.create({ data: { name, ruc }, select: { id: true } });
            await tx.auditLog.create({
              data: {
                action: 'COMPANY_CREATED',
                actorId: ctx.actor.id,
                entity: 'company',
                entityId: created.id,
                ip: ctx.ip,
                data: { name, ruc, via: 'student-registration' },
              },
            });
            outcome = 'CREATED';
            companyIds.push(created.id);
          }
        }

        const user = await tx.user.create({
          data: {
            email: input.email,
            firstNames: input.firstNames,
            lastNames: input.lastNames,
            role: Role.STUDENT,
            passwordHash: placeholderHash,
            activationPending: true,
            mustChangePassword: false,
          },
          select: { id: true },
        });
        // Quién lo registró decide quién lo ve (regla del 17/11/2026). Sale del token, nunca de la petición.
        await tx.student.create({ data: { userId: user.id, dni: input.dni, whatsapp: input.whatsapp, registeredById: ctx.actor.id } });
        for (const companyId of companyIds) {
          await tx.studentCompany.create({ data: { studentId: user.id, companyId, assignedById: ctx.actor.id } });
        }
        const token = await this.activation.issue(tx, user.id, ctx.actor.id);
        // Sin correo, DNI ni nombres en la bitácora.
        await tx.auditLog.create({
          data: { action: 'STUDENT_CREATED', actorId: ctx.actor.id, entity: 'student', entityId: user.id, ip: ctx.ip, data: { companyIds } },
        });
        return { issued: token, userId: user.id, companyOutcome: outcome };
      }, WRITE_TX));
    } catch (error) {
      // Dos registros simultáneos con el mismo correo o DNI: el índice único decide (sin cuenta a medias).
      if (isUniqueViolation(error)) throw new ConflictException(DUPLICATE_ACCOUNT);
      throw error;
    }

    const activation = await this.activation.deliver(
      { userId, email: input.email, firstNames: input.firstNames },
      issued,
      ctx.actor.id,
    );
    return { student: await this.students.findOne(ctx.actor, userId), activation, ...(companyOutcome ? { companyOutcome } : {}) };
  }

  /**
   * Activación manual por WhatsApp: emite un enlace nuevo (anula los anteriores) y devuelve el wa.me con el mensaje
   * preparado. No envía nada: la plataforma solo registra que el enlace se generó.
   */
  async prepareWhatsappActivation(studentId: string, ctx: InstructorContext): Promise<WhatsappActivationResultDto> {
    await this.scope.assertStudentInScope(ctx.actor, studentId);
    if (!this.activation.linkFor('x')) throw new ConflictException(ACTIVATION_URL_MISSING);
    const { issued, phone } = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT user_id FROM students WHERE user_id = ${studentId} FOR UPDATE`;
      const user = await tx.user.findUnique({ where: { id: studentId }, select: { active: true, activationPending: true } });
      if (!user) throw new NotFoundException(STUDENT_NOT_FOUND);
      if (!user.activationPending) throw new ConflictException(ALREADY_ACTIVATED);
      if (!user.active) throw new ConflictException(INACTIVE_ACCOUNT);
      const student = await tx.student.findUnique({ where: { userId: studentId }, select: { whatsapp: true } });
      if (!student?.whatsapp) throw new ConflictException(NO_WHATSAPP);
      const token = await this.activation.issue(tx, studentId, ctx.actor.id);
      await tx.auditLog.create({
        data: { action: 'ACTIVATION_WHATSAPP_LINK_GENERATED', actorId: ctx.actor.id, entity: 'student', entityId: studentId, ip: ctx.ip },
      });
      return { issued: token, phone: student.whatsapp };
    }, WRITE_TX);
    const text = whatsappActivationMessage(this.activation.linkFor(issued.token)!, issued.expiresAt);
    return {
      status: 'LINK_GENERATED',
      whatsappUrl: `https://wa.me/${whatsappDigits(phone)}?text=${encodeURIComponent(text)}`,
      expiresAt: issued.expiresAt.toISOString(),
    };
  }

  /** Registra que el Instructor abrió WhatsApp. No significa que el mensaje se envió ni que se entregó. */
  async markWhatsappOpened(studentId: string, ctx: InstructorContext): Promise<ActivationStatusDto> {
    await this.scope.assertStudentInScope(ctx.actor, studentId);
    const current = await this.activationStatus(studentId, ctx);
    if (current.linkState !== 'VIGENTE') throw new ConflictException(NO_LINK_TO_OPEN);
    await this.prisma.auditLog.create({
      data: { action: 'ACTIVATION_WHATSAPP_OPENED', actorId: ctx.actor.id, entity: 'student', entityId: studentId, ip: ctx.ip },
    });
    return this.activationStatus(studentId, ctx);
  }

  async activationStatus(studentId: string, ctx: InstructorContext): Promise<ActivationStatusDto> {
    await this.scope.assertStudentInScope(ctx.actor, studentId);
    const user = await this.prisma.user.findUnique({ where: { id: studentId }, select: { activationPending: true } });
    if (!user) throw new NotFoundException(STUDENT_NOT_FOUND);
    const token = await this.prisma.accountActivationToken.findFirst({
      where: { userId: studentId },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, expiresAt: true, usedAt: true, revokedAt: true },
    });
    const events = token
      ? await this.prisma.auditLog.findMany({
          where: { entity: 'student', entityId: studentId, action: { in: ['ACTIVATION_WHATSAPP_LINK_GENERATED', 'ACTIVATION_WHATSAPP_OPENED'] }, createdAt: { gte: token.createdAt } },
          select: { action: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
        })
      : [];
    const at = (action: string) => events.find((e) => e.action === action)?.createdAt.toISOString() ?? null;
    const linkState = !token ? 'SIN_ENLACE' : token.usedAt ? 'USADO' : token.revokedAt ? 'ANULADO' : token.expiresAt.getTime() <= Date.now() ? 'VENCIDO' : 'VIGENTE';
    return {
      activationPending: user.activationPending,
      linkGeneratedAt: at('ACTIVATION_WHATSAPP_LINK_GENERATED'),
      whatsappOpenedAt: at('ACTIVATION_WHATSAPP_OPENED'),
      expiresAt: token?.expiresAt.toISOString() ?? null,
      linkState,
    };
  }

  /**
   * Reenvía el enlace (por ejemplo, si el envío inicial falló o el enlace venció): emite uno nuevo, anula los anteriores
   * y envía el correo. Solo para estudiantes del alcance (404) con la cuenta pendiente (409 si ya está activada) y
   * activa (409 si está desactivada).
   */
  async resendActivation(studentId: string, ctx: InstructorContext): Promise<ResendActivationResultDto> {
    await this.scope.assertStudentInScope(ctx.actor, studentId);
    const { issued, recipient } = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT user_id FROM students WHERE user_id = ${studentId} FOR UPDATE`;
      const user = await tx.user.findUnique({
        where: { id: studentId },
        select: { id: true, email: true, firstNames: true, active: true, activationPending: true },
      });
      if (!user) throw new NotFoundException(STUDENT_NOT_FOUND);
      if (!user.activationPending) throw new ConflictException(ALREADY_ACTIVATED);
      if (!user.active) throw new ConflictException(INACTIVE_ACCOUNT);
      const token = await this.activation.issue(tx, studentId, ctx.actor.id);
      await tx.auditLog.create({
        data: { action: 'STUDENT_ACTIVATION_LINK_ISSUED', actorId: ctx.actor.id, entity: 'student', entityId: studentId, ip: ctx.ip },
      });
      return { issued: token, recipient: { userId: user.id, email: user.email, firstNames: user.firstNames } };
    }, WRITE_TX);
    return { activation: await this.activation.deliver(recipient, issued, ctx.actor.id) };
  }
}
