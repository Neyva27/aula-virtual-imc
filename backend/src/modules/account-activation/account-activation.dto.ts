import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';
import { NewPasswordPolicy } from '../auth/auth.dto.js';

export class ActivateAccountDto {
  @ApiProperty({ description: 'Token del enlace de activación (lo que sigue a «#token=»).' })
  @MaxLength(200, { message: 'El enlace de activación no es válido.' })
  @IsString({ message: 'El enlace de activación no es válido.' })
  token: string;

  @ApiProperty({ format: 'password', minLength: 8, description: 'Al menos 8 caracteres, con letras y números.' })
  @NewPasswordPolicy()
  newPassword: string;
}

export class ActivationSummaryDto {
  @ApiProperty({ enum: ['PENDING'] }) status: 'PENDING';
  @ApiProperty({
    enum: ['SENT', 'FAILED', 'NOT_CONFIGURED', 'DEV_CONSOLE'],
    description:
      'SENT: el proveedor de correo aceptó el mensaje (no garantiza que llegó). FAILED: el envío falló. ' +
      'NOT_CONFIGURED: no hay proveedor de correo o falta ACTIVATION_URL. En los dos últimos casos se puede reenviar. ' +
      'DEV_CONSOLE (solo desarrollo local): NO se envió ningún correo; el enlace se escribió en la consola del backend.',
  })
  emailDelivery: 'SENT' | 'FAILED' | 'NOT_CONFIGURED' | 'DEV_CONSOLE';
  @ApiProperty({ format: 'date-time', description: 'Vencimiento del enlace emitido.' }) expiresAt: string;
}
