import { Global, Module } from '@nestjs/common';
import { MAIL_SENDER, UnconfiguredMailSender } from './mail-sender.js';

/**
 * B2.3c: proveedor de correo (global). Hoy es `UnconfiguredMailSender`: no hay proveedor real integrado, así que ningún
 * correo se envía. Al integrar uno, se cambia solo este `useClass`/`useFactory` (con su configuración en variables de
 * entorno), sin tocar a quienes envían.
 */
@Global()
@Module({
  providers: [{ provide: MAIL_SENDER, useClass: UnconfiguredMailSender }],
  exports: [MAIL_SENDER],
})
export class MailModule {}
