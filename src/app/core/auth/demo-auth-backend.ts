import { Injectable, inject } from '@angular/core';
import { Observable, map, tap } from 'rxjs';
import { DataRepository } from '../services/data-repository';
import { DEMO_CONFIG } from '../config/demo.config';
import { normalizeRole, splitFullName, User } from '../models/user.model';

/**
 * Sesión SIMULADA del modo demostración (comportamiento anterior a B1.3, sin cambios): usuarios de los datos
 * de prueba, contraseña compartida y sesión en localStorage. No es autenticación segura.
 */
@Injectable({ providedIn: 'root' })
export class DemoAuthBackend {
  private readonly repo = inject(DataRepository);
  private readonly storageKey = 'imc-demo-session';

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
        try {
          localStorage.setItem(this.storageKey, JSON.stringify(user));
        } catch {
          /* sin almacenamiento disponible */
        }
      }),
    );
  }

  logout(): void {
    try {
      localStorage.removeItem(this.storageKey);
    } catch {
      /* sin almacenamiento disponible */
    }
  }

  /**
   * Restaura la sesión guardada. Compatible con sesiones anteriores a B1.2: el rol «admin» se interpreta como
   * «instructor» y, si faltan, se obtienen nombres y apellidos del nombre completo. Todo en memoria: la clave
   * guardada no se reescribe (se actualiza en el siguiente inicio de sesión).
   */
  restore(): User | null {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) return null;
      const saved = JSON.parse(raw) as Partial<User> & { role?: unknown };
      const role = normalizeRole(saved.role);
      if (!role || typeof saved.id !== 'string' || typeof saved.fullName !== 'string') return null;
      const names =
        typeof saved.firstNames === 'string' && typeof saved.lastNames === 'string'
          ? { firstNames: saved.firstNames, lastNames: saved.lastNames }
          : splitFullName(saved.fullName);
      return { ...(saved as User), ...names, role };
    } catch {
      return null;
    }
  }
}
