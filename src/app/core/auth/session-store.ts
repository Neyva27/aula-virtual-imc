import { Injectable, signal } from '@angular/core';
import { User } from '../models/user.model';

/** Estado único de la sesión (usuario autenticado), compartido por el modo demostración y el modo API. */
@Injectable({ providedIn: 'root' })
export class SessionStore {
  private readonly _user = signal<User | null>(null);
  readonly user = this._user.asReadonly();
  /** Aviso para la pantalla de inicio de sesión (por ejemplo, la API no respondió al abrir la aplicación). */
  readonly notice = signal('');

  set(user: User | null): void {
    this._user.set(user);
  }
}
