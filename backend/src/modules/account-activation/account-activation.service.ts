import { createHash, randomBytes } from 'node:crypto';
import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../../audit/audit.service.js';
import type { Env } from '../../config/env.validation.js';
import { MAIL_SENDER, type MailSender } from '../../mail/mail-sender.js';
import { PasswordService } from '../auth/password.service.js';

/** Un único mensaje para token inexistente, alterado, vencido, usado, anulado o cuenta ya activada: no revela nada. */
export const INVALID_ACTIVATION_LINK =
  'El enlace de activación no es válido o ya venció. Pide a tu instructor que te envíe uno nuevo.';

/**
 * Resultado del envío del correo. SENT significa que el proveedor configurado ACEPTÓ el mensaje (no que llegó al
 * buzón). NOT_CONFIGURED: no hay proveedor real o falta ACTIVATION_URL. FAILED: el proveedor lo rechazó o falló.
 * DEV_CONSOLE (solo desarrollo, MAIL_DEV_CONSOLE=true): NO se envió ningún correo; el enlace se escribió en la consola
 * del backend.
 */
export type EmailDelivery = 'SENT' | 'FAILED' | 'NOT_CONFIGURED' | 'DEV_CONSOLE';

export interface ActivationSummary {
  status: 'PENDING';
  emailDelivery: EmailDelivery;
  expiresAt: string;
}

export interface IssuedActivationToken {
  /** Token en claro: SOLO para construir el enlace del correo. Nunca se guarda, se registra ni se devuelve al cliente. */
  token: string;
  expiresAt: Date;
}

/** 256 bits aleatorios en base64url (43 caracteres). */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function hashActivationToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

const limaDate = (date: Date) =>
  date.toLocaleString('es-PE', { timeZone: 'America/Lima', dateStyle: 'long', timeStyle: 'short' });

/**
 * B2.3c: enlaces de activación de cuentas de estudiantes.
 * - Token de 256 bits (`randomBytes`); en la base solo su hash SHA-256 (como los tokens de renovación de B1.1).
 * - Vigencia ACTIVATION_TOKEN_TTL_HOURS (72 h por defecto). Un solo uso: se consume con una actualización
 *   condicional dentro de una transacción, así que dos activaciones simultáneas con el mismo token no pueden prosperar.
 * - Emitir un enlace nuevo anula los anteriores sin usar; activar la cuenta anula todos los demás.
 * - El envío del correo ocurre DESPUÉS de confirmar la transacción y nunca lanza: devuelve su resultado. Si falla, la
 *   cuenta queda «pendiente de activación» (estado explícito) y el Instructor puede reenviar el enlace.
 */
@Injectable()
export class AccountActivationService {
  private readonly logger = new Logger(AccountActivationService.name);
  /** Solo para MAIL_DEV_CONSOLE (desarrollo local): único lugar donde se escribe un enlace de activación. */
  private readonly devLogger = new Logger('ActivacionDesarrollo');

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<Env, true>,
    @Inject(MAIL_SENDER) private readonly mail: MailSender,
  ) {}

  /** Crea un enlace nuevo para el usuario (dentro de la transacción de quien llama) y anula los anteriores sin usar. */
  async issue(tx: Prisma.TransactionClient, userId: string, issuedById: string): Promise<IssuedActivationToken> {
    const now = new Date();
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(now.getTime() + this.config.get('ACTIVATION_TOKEN_TTL_HOURS', { infer: true }) * 3_600_000);
    await tx.accountActivationToken.updateMany({ where: { userId, usedAt: null, revokedAt: null }, data: { revokedAt: now } });
    await tx.accountActivationToken.create({ data: { userId, tokenHash: hashActivationToken(token), expiresAt, issuedById } });
    return { token, expiresAt };
  }

  /** Enlace `<ACTIVATION_URL>#token=…`, o null si falta ACTIVATION_URL. El token va en el fragmento: no llega a los registros del servidor web. */
  linkFor(token: string): string | null {
    const base = this.config.get('ACTIVATION_URL', { infer: true });
    return base ? `${base}#token=${token}` : null;
  }

  /**
   * Envía el correo de activación. Nunca lanza y nunca registra el token ni la dirección: registra el resultado en la
   * bitácora (sin datos personales) y lo devuelve.
   */
  async deliver(
    recipient: { userId: string; email: string; firstNames: string },
    issued: IssuedActivationToken,
    actorId: string,
    /** Primera línea del correo. Por defecto, la del estudiante registrado por su instructor. */
    intro = 'Tu instructor te registró en el Aula Virtual IMC. Para activar tu cuenta y crear tu contraseña, abre este enlace:',
  ): Promise<ActivationSummary> {
    const summary = (emailDelivery: EmailDelivery): ActivationSummary => ({
      status: 'PENDING',
      emailDelivery,
      expiresAt: issued.expiresAt.toISOString(),
    });
    const base = this.config.get('ACTIVATION_URL', { infer: true });
    // Solo desarrollo local: el enlace va a la consola del backend, no a un correo. Doble protección: la validación del
    // entorno ya impide arrancar en producción con MAIL_DEV_CONSOLE=true.
    if (this.config.get('MAIL_DEV_CONSOLE', { infer: true }) && this.config.get('NODE_ENV', { infer: true }) !== 'production') {
      if (!base) {
        this.devLogger.warn('MAIL_DEV_CONSOLE=true, pero falta ACTIVATION_URL: no se puede construir el enlace de activación.');
        await this.logDelivery(actorId, recipient.userId, 'NOT_CONFIGURED');
        return summary('NOT_CONFIGURED');
      }
      this.devLogger.warn(
        [
          'SOLO DESARROLLO (MAIL_DEV_CONSOLE=true). NO se envió ningún correo.',
          `Enlace de activación para ${recipient.email} (vence el ${limaDate(issued.expiresAt)}, hora de Lima):`,
          `${base}#token=${issued.token}`,
        ].join('\n'),
      );
      await this.logDelivery(actorId, recipient.userId, 'DEV_CONSOLE');
      return summary('DEV_CONSOLE');
    }
    if (!this.mail.configured || !base) {
      await this.logDelivery(actorId, recipient.userId, 'NOT_CONFIGURED');
      return summary('NOT_CONFIGURED');
    }
    const link = `${base}#token=${issued.token}`;
    try {
      await this.mail.send({
        to: recipient.email,
        subject: 'Activa tu cuenta del Aula Virtual IMC',
        text: [
          `Hola, ${recipient.firstNames}:`,
          '',
          intro,
          '',
          link,
          '',
          `El enlace es personal, se puede usar una sola vez y vence el ${limaDate(issued.expiresAt)} (hora de Lima).`,
          'Si no esperabas este correo, ignóralo: nadie podrá usar tu cuenta sin este enlace.',
        ].join('\n'),
      });
    } catch (error) {
      // Sin token, enlace ni dirección en el registro del servidor.
      this.logger.error(`No se pudo enviar el correo de activación del usuario ${recipient.userId}: ${(error as Error).name}`);
      await this.logDelivery(actorId, recipient.userId, 'FAILED');
      return summary('FAILED');
    }
    await this.logDelivery(actorId, recipient.userId, 'SENT');
    return summary('SENT');
  }

  /**
   * Activa la cuenta: el estudiante crea su contraseña con el token del enlace. Cualquier problema con el token
   * (inexistente, alterado, vencido, usado, anulado) o una cuenta ya activada responde el MISMO 400.
   */
  async activate(token: string, newPassword: string, ip: string | null): Promise<void> {
    const fail = async (reason: string, userId: string | null = null): Promise<never> => {
      await this.audit.log({ action: 'ACCOUNT_ACTIVATION_FAILED', actorId: userId, ip, data: { reason } });
      throw new BadRequestException(INVALID_ACTIVATION_LINK);
    };
    if (!TOKEN_PATTERN.test(token)) return fail('MALFORMED');

    const now = new Date();
    const row = await this.prisma.accountActivationToken.findUnique({
      where: { tokenHash: hashActivationToken(token) },
      select: { id: true, userId: true, expiresAt: true, usedAt: true, revokedAt: true },
    });
    if (!row) return fail('UNKNOWN');
    if (row.usedAt) return fail('USED', row.userId);
    if (row.revokedAt) return fail('REVOKED', row.userId);
    if (row.expiresAt.getTime() <= now.getTime()) return fail('EXPIRED', row.userId);

    // El hash (argon2id, como el resto del proyecto) se calcula fuera de la transacción para no alargarla.
    const passwordHash = await this.passwords.hash(newPassword);
    let reason: string | null = null;
    try {
      await this.prisma.$transaction(async (tx) => {
        // Consumo atómico: solo una transacción puede marcar el token como usado.
        const claimed = await tx.accountActivationToken.updateMany({
          where: { id: row.id, usedAt: null, revokedAt: null, expiresAt: { gt: now } },
          data: { usedAt: now },
        });
        if (claimed.count !== 1) {
          reason = 'RACE';
          throw new BadRequestException(INVALID_ACTIVATION_LINK);
        }
        const user = await tx.user.findUnique({ where: { id: row.userId }, select: { activationPending: true } });
        if (!user?.activationPending) {
          reason = 'ALREADY_ACTIVE';
          throw new BadRequestException(INVALID_ACTIVATION_LINK);
        }
        await tx.user.update({
          where: { id: row.userId },
          data: {
            passwordHash,
            activationPending: false,
            mustChangePassword: false,
            failedLogins: 0,
            lockedUntil: null,
            sessionVersion: { increment: 1 },
          },
        });
        // Cualquier otro enlace pendiente de esta cuenta deja de servir.
        await tx.accountActivationToken.updateMany({
          where: { userId: row.userId, usedAt: null, revokedAt: null },
          data: { revokedAt: now },
        });
        await tx.auditLog.create({ data: { action: 'STUDENT_ACCOUNT_ACTIVATED', actorId: row.userId, entity: 'user', entityId: row.userId, ip } });
      });
    } catch (error) {
      if (reason) return fail(reason, row.userId);
      throw error;
    }
  }

  /** Bitácora del resultado, sin token, enlace ni dirección. */
  private logDelivery(actorId: string, studentId: string, result: EmailDelivery): Promise<void> {
    const base = { actorId, entity: 'student', entityId: studentId };
    if (result === 'SENT') return this.audit.log({ action: 'ACTIVATION_EMAIL_SENT', ...base });
    if (result === 'DEV_CONSOLE') return this.audit.log({ action: 'ACTIVATION_LINK_DEV_CONSOLE', ...base });
    return this.audit.log({ action: 'ACTIVATION_EMAIL_FAILED', ...base, data: { reason: result } });
  }
}
