import { SetMetadata, type ExecutionContext } from '@nestjs/common';

export const AUTH_THROTTLE_KEY = 'authThrottle';

/**
 * Aplica, además del límite general por IP, el límite estricto de autenticación (AUTH_THROTTLE_LIMIT).
 * Se usa en el inicio de sesión y la verificación pública. La renovación tiene su propio límite (RefreshThrottleGuard).
 */
export const AuthThrottle = () => SetMetadata(AUTH_THROTTLE_KEY, true);

/** El limitador «auth» se omite en las rutas sin @AuthThrottle(). */
export function skipUnlessAuthThrottled(context: ExecutionContext): boolean {
  return Reflect.getMetadata(AUTH_THROTTLE_KEY, context.getHandler()) !== true;
}
