/**
 * B2.3c: proveedor de correo SIMULADO para las pruebas. No envía nada: guarda los mensajes en memoria. Que una prueba
 * obtenga `SENT` con este proveedor solo significa que el código llamó al proveedor y este aceptó el mensaje; no se envió
 * ningún correo real.
 */
import type { MailMessage, MailSender } from '../../src/mail/mail-sender.js';

export class FakeMailSender implements MailSender {
  readonly configured = true;
  sent: MailMessage[] = [];
  /** Si es true, el siguiente envío falla como lo haría un proveedor caído. */
  failNext = false;

  async send(message: MailMessage): Promise<void> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('El servidor de correo rechazó la conexión (simulado).');
    }
    this.sent.push(message);
  }

  /** Token del último correo (lo que sigue a «#token=» en el enlace). */
  lastToken(): string {
    const text = this.sent.at(-1)?.text ?? '';
    const match = /#token=([A-Za-z0-9_-]+)/.exec(text);
    if (!match) throw new Error('No hay ningún enlace de activación en el último correo simulado.');
    return match[1];
  }
}
