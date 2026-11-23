import { Body, Controller, HttpCode, HttpStatus, Ip, Post } from '@nestjs/common';
import { ApiBadRequestResponse, ApiNoContentResponse, ApiTags, ApiTooManyRequestsResponse } from '@nestjs/swagger';
import { Public } from '../../common/decorators.js';
import { AuthThrottle } from '../../common/throttle.js';
import { ActivateAccountDto } from './account-activation.dto.js';
import { AccountActivationService } from './account-activation.service.js';

/** B2.3c: activación pública de la cuenta con el token del enlace del correo. */
@ApiTags('Autenticación')
@Controller('auth')
export class AccountActivationController {
  constructor(private readonly activation: AccountActivationService) {}

  @Public()
  @AuthThrottle()
  @Post('activate')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Cuenta activada. El estudiante ya puede iniciar sesión con su contraseña.' })
  @ApiBadRequestResponse({ description: 'Enlace no válido, vencido o ya usado (mismo mensaje), o contraseña que no cumple la política.' })
  @ApiTooManyRequestsResponse({ description: 'Demasiados intentos desde esta IP.' })
  async activate(@Body() body: ActivateAccountDto, @Ip() ip: string): Promise<void> {
    await this.activation.activate(body.token, body.newPassword, ip ?? null);
  }
}
