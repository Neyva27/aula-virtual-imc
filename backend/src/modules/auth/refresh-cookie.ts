import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Request, Response } from 'express';
import type { Env } from '../../config/env.validation.js';

export const REFRESH_COOKIE = 'imc_refresh';
/** La cookie solo viaja a las rutas de autenticación, nunca al resto de la API. */
export const REFRESH_COOKIE_PATH = '/api/v1/auth';

/** Cookie del token de renovación: HttpOnly, Secure según el entorno y SameSite configurable (decisión D-5). */
@Injectable()
export class RefreshCookie {
  constructor(private readonly config: ConfigService<Env, true>) {}

  set(res: Response, token: string, expiresAt: Date): void {
    res.cookie(REFRESH_COOKIE, token, { ...this.options(), expires: expiresAt });
  }

  clear(res: Response): void {
    res.clearCookie(REFRESH_COOKIE, this.options());
  }

  read(req: Request): string | undefined {
    const value = (req.cookies as Record<string, unknown> | undefined)?.[REFRESH_COOKIE];
    return typeof value === 'string' && value.length > 0 && value.length <= 200 ? value : undefined;
  }

  private options(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.get('COOKIE_SECURE', { infer: true }),
      sameSite: this.config.get('COOKIE_SAMESITE', { infer: true }),
      path: REFRESH_COOKIE_PATH,
    };
  }
}
