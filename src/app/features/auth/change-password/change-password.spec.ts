import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { APP_ENVIRONMENT } from '../../../core/config/app-environment';
import { authInterceptor } from '../../../core/http/auth.interceptor';
import { SessionStore } from '../../../core/auth/session-store';
import { DataRepository } from '../../../core/services/data-repository';
import { MockDataRepository } from '../../../core/services/mock-data-repository';
import { ChangePassword } from './change-password';

function setup() {
  localStorage.clear();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideHttpClient(withInterceptors([authInterceptor])),
      provideHttpClientTesting(),
      { provide: DataRepository, useClass: MockDataRepository },
      { provide: APP_ENVIRONMENT, useValue: { authMode: 'api', apiUrl: '/api/v1', sessionRestoreTimeoutMs: 5000 } },
    ],
  });
  TestBed.inject(SessionStore).set({
    id: 'a1', fullName: 'Instructora Nueva', firstNames: 'Instructora', lastNames: 'Nueva',
    email: 'nueva@empresa.pe', role: 'instructor', mustChangePassword: true,
  });
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  const fixture = TestBed.createComponent(ChangePassword);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const type = (id: string, value: string) => {
    const input = el.querySelector<HTMLInputElement>(`#${id}`)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('blur'));
  };
  const submit = () => {
    el.querySelector<HTMLButtonElement>('button[type=submit]')!.click();
    fixture.detectChanges();
  };
  return { fixture, el, type, submit, navigate, ctrl: TestBed.inject(HttpTestingController) };
}

const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

describe('Cambio obligatorio de contraseña (B1.3)', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('explica que la contraseña es temporal y valida la política del backend', () => {
    const { el, type, submit, fixture, ctrl } = setup();
    expect(text(el.querySelector('h1'))).toBe('Cambia tu contraseña');
    expect(text(el)).toContain('Instructora Nueva, tu contraseña es temporal');

    submit();
    expect(text(el)).toContain('Ingresa tu contraseña actual.');
    expect(text(el)).toContain('Ingresa la nueva contraseña.');

    type('current-password', 'Temporal2026abc');
    for (const [value, message] of [
      ['corta1', 'al menos 8 caracteres'],
      ['12345678', 'al menos una letra'],
      ['abcdefgh', 'al menos un número'],
    ] as const) {
      type('new-password', value);
      fixture.detectChanges();
      expect(text(el)).toContain(message);
    }
    type('new-password', 'Temporal2026abc');
    type('confirm-password', 'Otra2026xyz');
    fixture.detectChanges();
    expect(text(el)).toContain('La nueva contraseña debe ser distinta de la actual.');
    expect(text(el)).toContain('Las contraseñas no coinciden.');
    submit();
    ctrl.expectNone('/api/v1/auth/password'); // formulario inválido: no se envía
  });

  it('al cambiarla vuelve al login para ingresar con la nueva contraseña', async () => {
    const { type, submit, navigate, ctrl } = setup();
    type('current-password', 'Temporal2026abc');
    type('new-password', 'Definitiva2026');
    type('confirm-password', 'Definitiva2026');
    submit();
    const req = ctrl.expectOne('/api/v1/auth/password');
    expect(req.request.body).toEqual({ currentPassword: 'Temporal2026abc', newPassword: 'Definitiva2026' });
    req.flush(null, { status: 204, statusText: 'No Content' });
    expect(navigate).toHaveBeenCalledWith(['/login'], { queryParams: { aviso: 'clave-actualizada' } });
    expect(TestBed.inject(SessionStore).user()).toBeNull();
  });

  it('muestra el error del servidor y conserva la sesión', () => {
    const { el, type, submit, fixture, ctrl } = setup();
    type('current-password', 'incorrecta');
    type('new-password', 'Definitiva2026');
    type('confirm-password', 'Definitiva2026');
    submit();
    ctrl.expectOne('/api/v1/auth/password').flush({ message: 'La contraseña actual no es correcta.' }, { status: 400, statusText: 'Bad Request' });
    fixture.detectChanges();
    expect(text(el.querySelector('[role=alert]'))).toBe('La contraseña actual no es correcta.');
    expect(TestBed.inject(SessionStore).user()).not.toBeNull();
  });
});
