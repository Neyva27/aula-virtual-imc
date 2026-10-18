import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, map, tap } from 'rxjs';
import { DataRepository } from './data-repository';
import { DEMO_CONFIG } from '../config/demo.config';
import { Role, User } from '../models/user.model';

/**
 * Sesión SIMULADA solo para la demostración. No es autenticación segura:
 * la autenticación y los permisos reales se implementarán en el backend.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly repo = inject(DataRepository);
  private readonly storageKey = 'imc-demo-session';

  private readonly _user = signal<User | null>(this.restore());
  readonly user = this._user.asReadonly();
  readonly isLoggedIn = computed(() => this._user() !== null);

  login(email: string, password: string): Observable<User> {
    return this.repo.getUsers().pipe(
      map((users) => {
        const found = users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
        if (!found || password !== DEMO_CONFIG.demoPassword) {
          throw new Error('Correo o contraseña incorrectos.');
        }
        return found;
      }),
      tap((user) => {
        this._user.set(user);
        try {
          localStorage.setItem(this.storageKey, JSON.stringify(user));
        } catch {
          /* sin almacenamiento disponible */
        }
      }),
    );
  }

  logout(): void {
    this._user.set(null);
    try {
      localStorage.removeItem(this.storageKey);
    } catch {
      /* sin almacenamiento disponible */
    }
  }

  homeFor(role: Role): string {
    return role === 'admin' ? '/admin' : '/panel';
  }

  private restore(): User | null {
    try {
      const raw = localStorage.getItem(this.storageKey);
      return raw ? (JSON.parse(raw) as User) : null;
    } catch {
      return null;
    }
  }
}
