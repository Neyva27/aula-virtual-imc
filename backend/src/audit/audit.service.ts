import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';

export type AuditAction =
  | 'LOGIN_OK'
  | 'LOGIN_FAILED'
  | 'ACCOUNT_LOCKED'
  | 'LOGOUT'
  | 'LOGOUT_ALL'
  | 'REFRESH_REUSE_DETECTED'
  | 'PASSWORD_CHANGED'
  | 'INSTRUCTOR_BOOTSTRAP'
  // B2.2a: permiso de administración general otorgado por consola, y accesos denegados a rutas administrativas.
  | 'GENERAL_ADMIN_GRANTED'
  | 'ADMIN_ACCESS_DENIED'
  // B2.2b: gestión de empresas (se escriben dentro de la transacción de cada operación, en CompaniesService).
  | 'COMPANY_CREATED'
  | 'COMPANY_UPDATED'
  | 'COMPANY_DEACTIVATED'
  | 'COMPANY_ACTIVATED'
  // B2.2c: asignación y retiro de instructores en empresas (en la transacción de InstructorAssignmentsService).
  | 'INSTRUCTOR_COMPANY_ASSIGNED'
  | 'INSTRUCTOR_COMPANY_REMOVED'
  // B2.3b: asignación y retiro de empresas de estudiantes (en la transacción de StudentsService).
  | 'STUDENT_COMPANY_ASSIGNED'
  | 'STUDENT_COMPANY_REMOVED'
  // B2.3c: registro de estudiantes y activación de cuentas (sin correo, DNI, tokens ni contraseñas).
  | 'STUDENT_CREATED'
  | 'STUDENT_ACTIVATION_LINK_ISSUED'
  | 'ACTIVATION_EMAIL_SENT'
  | 'ACTIVATION_EMAIL_FAILED'
  // 17/11/2026: solo desarrollo local (MAIL_DEV_CONSOLE): el enlace se escribió en la consola, no se envió correo.
  | 'ACTIVATION_LINK_DEV_CONSOLE'
  | 'STUDENT_ACCOUNT_ACTIVATED'
  | 'ACCOUNT_ACTIVATION_FAILED';

export interface AuditEntry {
  action: AuditAction;
  actorId?: string | null;
  entity?: string;
  entityId?: string;
  ip?: string | null;
  /** Nunca incluir contraseñas, tokens ni hashes. */
  data?: Prisma.InputJsonValue;
}

/** Bitácora de acciones sensibles. Un fallo al registrar no interrumpe la operación del usuario. */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          action: entry.action,
          actorId: entry.actorId ?? null,
          entity: entry.entity ?? null,
          entityId: entry.entityId ?? null,
          ip: entry.ip ?? null,
          ...(entry.data === undefined ? {} : { data: entry.data }),
        },
      });
    } catch (error) {
      this.logger.error(`No se pudo registrar la acción ${entry.action}: ${(error as Error).message}`);
    }
  }
}
