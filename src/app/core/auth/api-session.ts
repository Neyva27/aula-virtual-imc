import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, firstValueFrom, map, tap, throwError, timeout } from 'rxjs';
import { APP_ENVIRONMENT } from '../config/app-environment';
import { ApiAuthResponse, toFrontendUser, UnknownRoleError } from '../http/auth-api.mapper';
import { NETWORK_ERROR_MESSAGE, toDisplayError } from '../http/api-errors';
import { User } from '../models/user.model';
import { SessionStore } from './session-store';
import { withRefreshLock } from './refresh-lock';

/** Límite de una renovación de sesión (también mientras se retiene el cerrojo entre pestañas). */
export const REFRESH_TIMEOUT_MS = 15_000;

/**
 * Sesión del MODO API (B1.3).
 * - El token de acceso vive solo en memoria (este objeto): nunca en localStorage ni sessionStorage. Al recargar la
 *   página se pierde y se recupera con la cookie de renovación.
 * - La cookie de renovación (HttpOnly) la gestiona el navegador; el código nunca la lee.
 * - La cabecera X-Requested-With y el envío de la cookie los añade authInterceptor.
 */
@Injectable({ providedIn: 'root' })
export class ApiSession {
  private readonly http = inject(HttpClient);
  private readonly env = inject(APP_ENVIRONMENT);
  private readonly store = inject(SessionStore);
  private readonly router = inject(Router);

  private accessToken: string | null = null;
  /** Renovación en curso: las solicitudes que la necesiten a la vez comparten esta (una sola por pestaña). */
  private inflight: Promise<string> | null = null;

  token(): string | null {
    return this.accessToken;
  }

  login(email: string, password: string): Observable<User> {
    return this.http.post<ApiAuthResponse>(`${this.env.apiUrl}/auth/login`, { email, password }).pipe(
      map((response) => this.accept(response)),
      catchError((error: unknown) => throwError(() => toDisplayError(error))),
    );
  }

  /**
   * Restaura la sesión al abrir la aplicación con la cookie de renovación, con un tiempo máximo para no bloquear el
   * arranque. Sin cookie válida, la aplicación queda sin sesión. Nunca cambia al modo demostración.
   */
  async restore(): Promise<void> {
    try {
      await this.refresh(this.env.sessionRestoreTimeoutMs);
      this.store.notice.set('');
    } catch (error) {
      this.clearLocal();
      if (error instanceof UnknownRoleError) {
        this.store.notice.set(error.message);
        return;
      }
      // 401: no hay sesión que restaurar (no es un error). Sin respuesta, tiempo agotado, 429 o 5xx: la API no está disponible.
      const unreachable = !(error instanceof HttpErrorResponse) || error.status === 0 || error.status === 429 || error.status >= 500;
      this.store.notice.set(unreachable ? NETWORK_ERROR_MESSAGE : '');
    }
  }

  /**
   * Renueva la sesión y devuelve el nuevo token. Una sola renovación a la vez por pestaña (las demás esperan la misma)
   * y, si el navegador lo permite, también entre pestañas (Web Locks, ver refresh-lock.ts).
   */
  refresh(timeoutMs?: number): Promise<string> {
    // Con `timeoutMs` (al abrir la aplicación) el límite cubre también la espera del cerrojo entre pestañas.
    // Toda renovación tiene además un límite propio, para que ninguna pestaña retenga el cerrojo indefinidamente.
    const lockSignal = timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined;
    this.inflight ??= withRefreshLock(
      () => {
        const request = this.http.post<ApiAuthResponse>(`${this.env.apiUrl}/auth/refresh`, null);
        return firstValueFrom(request.pipe(timeout(timeoutMs ?? REFRESH_TIMEOUT_MS)));
      },
      undefined,
      lockSignal,
    )
      .then((response) => {
        this.accept(response);
        return response.accessToken;
      })
      .finally(() => (this.inflight = null));
    return this.inflight;
  }

  /** Cierra la sesión: el estado local se borra de inmediato y el servidor revoca la cookie (si falla, igual se cierra aquí). */
  logout(): void {
    this.clearLocal();
    this.http.post(`${this.env.apiUrl}/auth/logout`, null).subscribe({ error: () => undefined });
  }

  /**
   * Activa la cuenta de un estudiante con el token del enlace y su contraseña nueva (POST /auth/activate, pública).
   * No inicia sesión: después hay que ingresar con la contraseña creada.
   */
  activateAccount(token: string, newPassword: string): Observable<void> {
    return this.http.post<void>(`${this.env.apiUrl}/auth/activate`, { token, newPassword }).pipe(
      map(() => undefined),
      catchError((error: unknown) => throwError(() => toDisplayError(error))),
    );
  }

  /** Cambia la contraseña. El servidor cierra todas las sesiones: se borra la local y hay que volver a iniciar sesión. */
  changePassword(currentPassword: string, newPassword: string): Observable<void> {
    return this.http.patch<void>(`${this.env.apiUrl}/auth/password`, { currentPassword, newPassword }).pipe(
      tap(() => this.clearLocal()),
      map(() => undefined),
      catchError((error: unknown) => throwError(() => toDisplayError(error))),
    );
  }

  /** La sesión ya no es válida (renovación rechazada): se borra y se vuelve al inicio de sesión con un aviso. */
  expire(): void {
    this.clearLocal();
    void this.router.navigate(['/login'], { queryParams: { aviso: 'sesion-expirada' } });
  }

  /** La API exige cambiar la contraseña temporal (403 PasswordChangeRequired). */
  requirePasswordChange(): void {
    const user = this.store.user();
    if (user && !user.mustChangePassword) this.store.set({ ...user, mustChangePassword: true });
    void this.router.navigateByUrl('/cambiar-clave');
  }

  private accept(response: ApiAuthResponse): User {
    const user = toFrontendUser(response.user); // lanza UnknownRoleError ante un rol desconocido
    this.accessToken = response.accessToken;
    this.store.set(user);
    return user;
  }

  private clearLocal(): void {
    this.accessToken = null;
    this.store.set(null);
  }
}
