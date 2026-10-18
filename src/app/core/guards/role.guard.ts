import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { Role } from '../models/user.model';

/** Protección VISUAL de rutas para la demostración. La seguridad real va en el backend. */
export const roleGuard =
  (role: Role): CanActivateFn =>
  () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    const user = auth.user();
    if (!user) return router.createUrlTree(['/login']);
    if (user.role !== role) return router.createUrlTree([auth.homeFor(user.role)]);
    return true;
  };

/** Si ya hay sesión, /login redirige al inicio del rol. */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const user = auth.user();
  return user ? router.createUrlTree([auth.homeFor(user.role)]) : true;
};
