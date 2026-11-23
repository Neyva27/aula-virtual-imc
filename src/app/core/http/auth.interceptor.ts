import { HttpContextToken, HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { APP_ENVIRONMENT } from '../config/app-environment';
import { ApiSession } from '../auth/api-session';
import { isPasswordChangeRequired } from './api-errors';

/** Marca de una solicitud ya reintentada tras renovar la sesión: no se vuelve a reintentar (sin bucles). */
const RETRIED = new HttpContextToken<boolean>(() => false);

/** Rutas que gestionan la propia sesión: no llevan token de acceso ni disparan una renovación ante un 401. */
const SESSION_ENDPOINTS = new Set(['/auth/login', '/auth/refresh', '/auth/logout', '/auth/activate']);

function apiPath(url: string, apiUrl: string): string | null {
  if (url === apiUrl || url.startsWith(`${apiUrl}/`)) return url.slice(apiUrl.length).split('?')[0] || '/';
  return null;
}

/**
 * Interceptor de la API (B1.3). Solo actúa sobre las solicitudes a `apiUrl`:
 * - añade `X-Requested-With: XMLHttpRequest` (obligatoria en /auth/refresh y /auth/logout: protección CSRF);
 * - envía la cookie de renovación solo a /auth/* (`withCredentials`);
 * - añade el token de acceso (en memoria) salvo en las rutas de sesión;
 * - ante un 401, renueva UNA vez (compartida, ver ApiSession.refresh) y reintenta la solicitud UNA vez; si la
 *   renovación es rechazada o el reintento vuelve a dar 401, cierra la sesión con el aviso de sesión expirada;
 * - ante un 403 «PasswordChangeRequired», lleva al cambio obligatorio de contraseña.
 * En modo demostración no hay solicitudes a la API, así que no interviene.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const env = inject(APP_ENVIRONMENT);
  const path = apiPath(req.url, env.apiUrl);
  if (path === null) return next(req);

  const session = inject(ApiSession);
  const sessionEndpoint = SESSION_ENDPOINTS.has(path);
  const base = req.clone({
    setHeaders: { 'X-Requested-With': 'XMLHttpRequest' },
    withCredentials: path.startsWith('/auth/'),
  });
  const authorize = (request: HttpRequest<unknown>, token: string | null) =>
    token && !sessionEndpoint ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : request;

  return next(authorize(base, session.token())).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse)) return throwError(() => error);
      if (isPasswordChangeRequired(error)) {
        session.requirePasswordChange();
        return throwError(() => error);
      }
      if (error.status !== 401 || sessionEndpoint || req.context.get(RETRIED)) return throwError(() => error);

      return from(session.refresh()).pipe(
        catchError((refreshError: unknown) => {
          // Renovación rechazada por el servidor: la sesión terminó. Sin conexión: se conserva y se informa el error.
          if (refreshError instanceof HttpErrorResponse && (refreshError.status === 401 || refreshError.status === 403)) {
            session.expire();
          }
          return throwError(() => refreshError);
        }),
        switchMap((token) =>
          next(authorize(base.clone({ context: base.context.set(RETRIED, true) }), token)).pipe(
            catchError((retryError: unknown) => {
              if (retryError instanceof HttpErrorResponse && retryError.status === 401) session.expire();
              return throwError(() => retryError);
            }),
          ),
        ),
      );
    }),
  );
};
