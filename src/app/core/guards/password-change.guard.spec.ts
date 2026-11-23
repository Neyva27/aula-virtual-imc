import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { SessionStore } from '../auth/session-store';
import { AuthService } from '../services/auth.service';
import { DataRepository } from '../services/data-repository';
import { MockDataRepository } from '../services/mock-data-repository';
import { User } from '../models/user.model';
import { guestGuard, passwordChangeGuard, roleGuard } from './role.guard';

@Component({ template: 'stub' })
class Stub {}

const instructor: User = {
  id: 'a1', fullName: 'Instructor de Prueba', firstNames: 'Instructor', lastNames: 'de Prueba',
  email: 'admin@ejemplo.test', role: 'instructor',
};

async function setup(user: User | null) {
  localStorage.clear();
  TestBed.configureTestingModule({
    providers: [
      { provide: DataRepository, useClass: MockDataRepository },
      provideRouter([
        { path: 'login', component: Stub, canActivate: [guestGuard] },
        { path: 'cambiar-clave', component: Stub, canActivate: [passwordChangeGuard] },
        { path: 'instructor', component: Stub, canActivate: [roleGuard('instructor')] },
        { path: 'panel', component: Stub, canActivate: [roleGuard('participant')] },
      ]),
    ],
  });
  // AuthService restaura la sesión simulada al crearse: primero se crea y después se fija el usuario de la prueba.
  TestBed.inject(AuthService);
  TestBed.inject(SessionStore).set(user);
  return { harness: await RouterTestingHarness.create(), router: TestBed.inject(Router) };
}

describe('Guards: cambio obligatorio de contraseña (B1.3)', () => {
  it('con contraseña temporal, toda ruta protegida y el login llevan a /cambiar-clave', async () => {
    const { harness, router } = await setup({ ...instructor, mustChangePassword: true });
    for (const url of ['/instructor', '/panel', '/login']) {
      await harness.navigateByUrl(url);
      expect(router.url).toBe('/cambiar-clave');
    }
  });

  it('/cambiar-clave sin sesión lleva al login', async () => {
    const { harness, router } = await setup(null);
    await harness.navigateByUrl('/cambiar-clave');
    expect(router.url).toBe('/login');
  });

  it('/cambiar-clave sin contraseña temporal lleva al inicio del rol', async () => {
    const { harness, router } = await setup(instructor);
    await harness.navigateByUrl('/cambiar-clave');
    expect(router.url).toBe('/instructor');
  });

  it('sin contraseña temporal los guards se comportan como antes', async () => {
    const { harness, router } = await setup(instructor);
    await harness.navigateByUrl('/panel');
    expect(router.url).toBe('/instructor');
    await harness.navigateByUrl('/login');
    expect(router.url).toBe('/instructor');
  });
});
