/**
 * B2.3c: abstracción del envío de correos. El resto del backend depende solo de esta interfaz (token MAIL_SENDER), no de
 * un proveedor concreto.
 *
 * Estado: NO hay ningún proveedor real integrado. El proveedor por defecto (`UnconfiguredMailSender`) se niega a enviar
 * y lo informa: nunca simula un envío correcto. Para enviar correos reales hay que implementar `MailSender` con un
 * proveedor (por ejemplo SMTP con una biblioteca como nodemailer, o la API HTTP de un servicio transaccional) y
 * registrarlo en MailModule. Ver backend/README.md, «Correo de activación».
 */
/** Token de inyección. Es una cadena (no un Symbol) para que sea el mismo aunque el módulo se cargue más de una vez. */
export const MAIL_SENDER = 'MAIL_SENDER';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface MailSender {
  /** false si no hay proveedor real: quien llama no debe intentar enviar ni dar el envío por hecho. */
  readonly configured: boolean;
  /** Resuelve solo si el proveedor ACEPTÓ el mensaje; si no, lanza un error. */
  send(message: MailMessage): Promise<void>;
}

export class MailNotConfiguredError extends Error {
  constructor() {
    super('No hay un proveedor de correo configurado.');
    this.name = 'MailNotConfiguredError';
  }
}

/** Proveedor por defecto: no envía nada y lo dice. */
export class UnconfiguredMailSender implements MailSender {
  readonly configured = false;

  send(): Promise<void> {
    return Promise.reject(new MailNotConfiguredError());
  }
}
