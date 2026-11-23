import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AccountActivationController } from './account-activation.controller.js';
import { AccountActivationService } from './account-activation.service.js';

/** B2.3c: enlaces de activación de cuentas (emisión, envío por correo y activación pública en `/auth/activate`). */
@Module({
  imports: [AuthModule], // PasswordService (mismo hash argon2id que el resto del proyecto)
  controllers: [AccountActivationController],
  providers: [AccountActivationService],
  exports: [AccountActivationService],
})
export class AccountActivationModule {}
