import { inject } from '@angular/core';
import { CanMatchFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { APP_ENVIRONMENT, isApiMode } from '../config/app-environment';
import { GENERAL_ADMIN } from '../models/admin.model';
import { ApiDataRepository } from '../services/api-data-repository';

/**
 * Pantallas de la administración general de IMC (empresas e instructores), dentro del panel del Instructor: solo en
 * modo API y solo con el permiso IMC_GENERAL_ADMIN (consultado al servidor). Sin el permiso, vuelve al Dashboard.
 * Es protección de NAVEGACIÓN: la seguridad real la aplica el servidor en cada ruta `/admin`.
 */
export const generalAdminMatch: CanMatchFn = () => {
  if (!isApiMode(inject(APP_ENVIRONMENT))) return false;
  const router = inject(Router);
  return inject(ApiDataRepository)
    .myPermissions()
    .pipe(
      map((permissions) => (permissions.includes(GENERAL_ADMIN) ? true : router.createUrlTree(['/instructor']))),
      catchError(() => of(router.createUrlTree(['/instructor']))),
    );
};
