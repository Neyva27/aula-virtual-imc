import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { Role } from '../models/user.model';

/** Ruta del cambio obligatorio de contraseña (modo API, contraseña temporal). */
export const PASSWORD_CHANGE_PATH = '/cambiar-clave';

/**
 * Protección de NAVEGACIÓN por rol. La seguridad real está en el backend (modo API). Con una contraseña temporal
 * solo se permite cambiarla (en modo demostración nunca ocurre).
 */
export const roleGuard =
  (role: Role): CanActivateFn =>
  () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    const user = auth.user();
    if (!user) return router.createUrlTree(['/login']);
    if (user.mustChangePassword) return router.createUrlTree([PASSWORD_CHANGE_PATH]);
    if (user.role !== role) return router.createUrlTree([auth.homeFor(user.role)]);
    return true;
  };

/** Si ya hay sesión, /login redirige al inicio del rol (o al cambio de contraseña, si es temporal). */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const user = auth.user();
  if (!user) return true;
  return router.createUrlTree([user.mustChangePassword ? PASSWORD_CHANGE_PATH : auth.homeFor(user.role)]);
};

/** /cambiar-clave: solo con sesión y contraseña temporal. */
export const passwordChangeGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const user = auth.user();
  if (!user) return router.createUrlTree(['/login']);
  return user.mustChangePassword ? true : router.createUrlTree([auth.homeFor(user.role)]);
};
