import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post, Req, Res, UnauthorizedException, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCookieAuth,
  ApiHeader,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AllowPendingPasswordChange, CurrentUser, Public } from '../../common/decorators.js';
import type { AuthUser } from '../../common/auth-user.js';
import { ClientHeaderGuard } from '../../common/guards/client-header.guard.js';
import { AuthThrottle } from '../../common/throttle.js';
import { UserDto } from '../users/user.dto.js';
import { UsersService } from '../users/users.service.js';
import { AuthResponseDto, ChangePasswordDto, LoginDto } from './auth.dto.js';
import { AuthService, type AuthResult } from './auth.service.js';
import { RefreshCookie, REFRESH_COOKIE } from './refresh-cookie.js';
import { RefreshThrottleGuard } from './refresh-throttle.guard.js';
import type { ClientMeta } from './session.service.js';

function meta(req: Request): ClientMeta {
  const agent = req.headers['user-agent'];
  return { ip: req.ip ?? null, userAgent: typeof agent === 'string' ? agent.slice(0, 255) : null };
}

const CLIENT_HEADER = { name: 'X-Requested-With', required: true, description: 'Debe ser «XMLHttpRequest».' };

@ApiTags('Autenticación')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
    private readonly cookie: RefreshCookie,
  ) {}

  @Public()
  @AuthThrottle()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: AuthResponseDto, description: `Además, deja la cookie HttpOnly «${REFRESH_COOKIE}».` })
  @ApiBadRequestResponse({ description: 'Datos con formato inválido o campos no permitidos.' })
  @ApiUnauthorizedResponse({ description: 'Credenciales incorrectas, cuenta bloqueada o desactivada.' })
  @ApiTooManyRequestsResponse({ description: 'Demasiados intentos desde esta IP.' })
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<AuthResponseDto> {
    return this.respond(res, await this.auth.login(dto.email, dto.password, meta(req)));
  }

  // Sus límites (por sesión y por IP) los aplica RefreshThrottleGuard: una IP puede ser la red compartida de una empresa.
  @Public()
  @SkipThrottle({ default: true })
  @UseGuards(ClientHeaderGuard, RefreshThrottleGuard)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth(REFRESH_COOKIE)
  @ApiHeader(CLIENT_HEADER)
  @ApiOkResponse({ type: AuthResponseDto, description: 'Rota la cookie de renovación y entrega un token de acceso nuevo.' })
  @ApiUnauthorizedResponse({ description: 'Sin cookie, cookie vencida, revocada o reutilizada.' })
  @ApiTooManyRequestsResponse({ description: 'Demasiadas renovaciones de esta sesión, o demasiadas solicitudes inválidas desde esta IP.' })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<AuthResponseDto> {
    const token = this.cookie.read(req);
    try {
      if (!token) throw new UnauthorizedException('Tu sesión no es válida o venció. Inicia sesión nuevamente.');
      return this.respond(res, await this.auth.refresh(token, meta(req)));
    } catch (error) {
      this.cookie.clear(res);
      throw error;
    }
  }

  @Public()
  @UseGuards(ClientHeaderGuard)
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiCookieAuth(REFRESH_COOKIE)
  @ApiHeader(CLIENT_HEADER)
  @ApiNoContentResponse({ description: 'Sesión cerrada (también si ya no era válida).' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.logout(this.cookie.read(req), meta(req));
    this.cookie.clear(res);
  }

  @Post('logout-all')
  @AllowPendingPasswordChange()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiNoContentResponse({ description: 'Se cerraron todas las sesiones del usuario en todos los dispositivos.' })
  async logoutAll(@CurrentUser() user: AuthUser, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.logoutAll(user.id, meta(req));
    this.cookie.clear(res);
  }

  @Get('me')
  @AllowPendingPasswordChange()
  @ApiBearerAuth()
  @ApiOkResponse({ type: UserDto })
  @ApiUnauthorizedResponse({ description: 'Sin token de acceso válido.' })
  me(@CurrentUser() user: AuthUser): Promise<UserDto> {
    return this.users.findById(user.id);
  }

  @Patch('password')
  @AllowPendingPasswordChange()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiNoContentResponse({ description: 'Contraseña cambiada. Se cierran todas las sesiones: hay que iniciar sesión otra vez.' })
  @ApiBadRequestResponse({ description: 'Contraseña actual incorrecta o nueva contraseña inválida.' })
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.changePassword(user.id, dto.currentPassword, dto.newPassword, meta(req));
    this.cookie.clear(res);
  }

  private respond(res: Response, result: AuthResult): AuthResponseDto {
    this.cookie.set(res, result.refresh.token, result.refresh.expiresAt);
    return { accessToken: result.accessToken, tokenType: 'Bearer', expiresIn: result.expiresIn, user: result.user };
  }
}
