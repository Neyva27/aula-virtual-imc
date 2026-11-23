import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';

/**
 * Protección adicional contra CSRF en las rutas que usan la cookie de renovación.
 * Exige la cabecera `X-Requested-With: XMLHttpRequest`: un formulario de otro sitio no puede enviarla,
 * y una solicitud de otro origen con esa cabecera requiere un preflight que CORS rechaza.
 */
@Injectable()
export class ClientHeaderGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const header = context.switchToHttp().getRequest<Request>().headers['x-requested-with'];
    if (typeof header !== 'string' || header.toLowerCase() !== 'xmlhttprequest') {
      throw new ForbiddenException('Solicitud no permitida.');
    }
    return true;
  }
}
