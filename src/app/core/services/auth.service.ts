import { Injectable, Injector, computed, inject } from '@angular/core';
import { Observable, tap, throwError } from 'rxjs';
import { APP_ENVIRONMENT } from '../config/app-environment';
import { SessionStore } from '../auth/session-store';
import { DemoAuthBackend } from '../auth/demo-auth-backend';
import { ApiSession } from '../auth/api-session';
import { Role, User } from '../models/user.model';

/**
 * Sesión de la aplicación. Interfaz única para pantallas, guards y layouts, en los dos modos:
 * - «demo» (predeterminado): sesión SIMULADA en el navegador, sin cambios respecto de B1.2 (DemoAuthBackend).
 * - «api» (`npm run start:api`, B1.3): inicio de sesión con el backend (ApiSession).
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly env = inject(APP_ENVIRONMENT);
  private readonly store = inject(SessionStore);
  private readonly demo = inject(DemoAuthBackend);
  private readonly injector = inject(Injector);

  /** El modo se fija al compilar (archivo de entorno) y no cambia durante la ejecución. */
  readonly apiMode = this.env.authMode === 'api';
  readonly user = this.store.user;
  readonly isLoggedIn = computed(() => this.user() !== null);
  readonly mustChangePassword = computed(() => this.user()?.mustChangePassword === true);
  /** Aviso para el inicio de sesión (modo API: por ejemplo, la API no respondió al abrir la aplicación). */
  readonly notice = this.store.notice.asReadonly();

  constructor() {
    if (!this.apiMode) this.store.set(this.demo.restore());
  }

  /** Al abrir la aplicación (antes del primer ruteo). Modo API: restaura la sesión con la cookie de renovación. */
  initialize(): Promise<void> {
    return this.apiMode ? this.api.restore() : Promise.resolve();
  }

  login(email: string, password: string): Observable<User> {
    if (this.apiMode) return this.api.login(email, password);
    return this.demo.login(email, password).pipe(tap((user) => this.store.set(user)));
  }

  logout(): void {
    if (this.apiMode) {
      this.api.logout();
      return;
    }
    this.store.set(null);
    this.demo.logout();
  }

  /** Cambio de contraseña (solo modo API). Al terminar no queda sesión: hay que volver a iniciarla. */
  changePassword(currentPassword: string, newPassword: string): Observable<void> {
    if (!this.apiMode) return throwError(() => new Error('El cambio de contraseña solo está disponible con el inicio de sesión de la API.'));
    return this.api.changePassword(currentPassword, newPassword);
  }

  /** Activación de la cuenta con el enlace del correo (solo modo API). No inicia sesión. */
  activateAccount(token: string, newPassword: string): Observable<void> {
    if (!this.apiMode) return throwError(() => new Error('La activación de cuentas solo está disponible con la API.'));
    return this.api.activateAccount(token, newPassword);
  }

  /** Inicio de cada rol (en los dos modos: el Dashboard del Instructor y el panel del estudiante). */
  homeFor(role: Role): string {
    return role === 'instructor' ? '/instructor' : '/panel';
  }

  /** Se obtiene solo en modo API: en modo demostración no se crea ni se usa HttpClient. */
  private get api(): ApiSession {
    return this.injector.get(ApiSession);
  }
}
