import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Location } from '@angular/common';
import { provideLocationMocks } from '@angular/common/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { APP_ENVIRONMENT } from '../../../core/config/app-environment';
import { authInterceptor } from '../../../core/http/auth.interceptor';
import { DataRepository } from '../../../core/services/data-repository';
import { dataRepositoryFactory } from '../../../app.config';
import { ActivateAccount, tokenFromFragment } from './activate-account';

/** Activación de la cuenta (modo API). Solo HttpTestingController: no se escribe en ninguna base. */
const TOKEN = 'A'.repeat(20) + '_b-c' + '9'.repeat(19); // 43 caracteres base64url
const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

function setup(fragment: string | null) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideLocationMocks(),
      provideHttpClient(withInterceptors([authInterceptor])),
      provideHttpClientTesting(),
      { provide: APP_ENVIRONMENT, useValue: { authMode: 'api', apiUrl: '/api/v1', sessionRestoreTimeoutMs: 5000 } },
      { provide: ActivatedRoute, useValue: { snapshot: { fragment } } },
      { provide: DataRepository, useFactory: dataRepositoryFactory },
    ],
  });
  const location = TestBed.inject(Location);
  location.go(`/activar-cuenta${fragment ? `#${fragment}` : ''}`);
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  const fixture = TestBed.createComponent(ActivateAccount);
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement, ctrl: TestBed.inject(HttpTestingController), navigate, location };
}

function type(el: HTMLElement, selector: string, value: string): void {
  const input = el.querySelector<HTMLInputElement>(selector)!;
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function submit(ctx: ReturnType<typeof setup>): void {
  ctx.el.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
  ctx.fixture.detectChanges();
}

describe('tokenFromFragment', () => {
  it('lee el token del fragmento #token= y solo acepta el formato del servidor', () => {
    expect(tokenFromFragment(`token=${TOKEN}`)).toBe(TOKEN);
    expect(tokenFromFragment(null)).toBeNull();
    expect(tokenFromFragment('token=corto')).toBeNull();
    expect(tokenFromFragment(`otro=${TOKEN}`)).toBeNull();
  });
});

describe('Activación de cuenta (modo API)', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('con un enlace válido muestra el formulario y quita el token de la barra de direcciones', () => {
    const { el, location } = setup(`token=${TOKEN}`);
    expect(el.querySelector('form')).not.toBeNull();
    expect(location.path(true)).toBe('/activar-cuenta');
    expect(location.path(true)).not.toContain(TOKEN);
  });

  it.each([null, 'token=', 'token=no-valido'])('enlace ausente o mal formado (%s): aviso y sin formulario ni solicitudes', (fragment) => {
    const { el } = setup(fragment);
    expect(text(el.querySelector('[data-test="invalid-link"]'))).toContain('no es válido o está incompleto');
    expect(el.querySelector('form')).toBeNull();
  });

  it('valida la contraseña como el servidor antes de enviar', () => {
    const ctx = setup(`token=${TOKEN}`);
    for (const [password, confirm, message] of [
      ['corta1', 'corta1', 'al menos 8 caracteres'],
      ['sololetras', 'sololetras', 'al menos un número'],
      ['12345678', '12345678', 'al menos una letra'],
      ['ClaveNueva2026', 'OtraClave2026', 'Las contraseñas no coinciden.'],
    ]) {
      type(ctx.el, '#new-password', password);
      type(ctx.el, '#confirm-password', confirm);
      submit(ctx);
      expect(text(ctx.el)).toContain(message);
    }
    ctx.ctrl.expectNone('/api/v1/auth/activate');
  });

  it('envía token y contraseña (sin token de sesión) y, al activarse, lleva al inicio de sesión con aviso', () => {
    const ctx = setup(`token=${TOKEN}`);
    type(ctx.el, '#new-password', 'ClaveNueva2026');
    type(ctx.el, '#confirm-password', 'ClaveNueva2026');
    submit(ctx);
    const req = ctx.ctrl.expectOne('/api/v1/auth/activate');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ token: TOKEN, newPassword: 'ClaveNueva2026' });
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush(null, { status: 204, statusText: 'No Content' });
    expect(ctx.navigate).toHaveBeenCalledWith(['/login'], { queryParams: { aviso: 'cuenta-activada' } });
  });

  it('enlace vencido, usado o inválido: muestra el mensaje del servidor y no navega', () => {
    const ctx = setup(`token=${TOKEN}`);
    type(ctx.el, '#new-password', 'ClaveNueva2026');
    type(ctx.el, '#confirm-password', 'ClaveNueva2026');
    submit(ctx);
    const message = 'El enlace de activación no es válido o ya venció. Pide a tu instructor que te envíe uno nuevo.';
    ctx.ctrl.expectOne('/api/v1/auth/activate').flush({ statusCode: 400, message }, { status: 400, statusText: 'Bad Request' });
    ctx.fixture.detectChanges();
    expect(text(ctx.el.querySelector('[data-test="error"]'))).toBe(message);
    expect(ctx.navigate).not.toHaveBeenCalled();
  });
});
