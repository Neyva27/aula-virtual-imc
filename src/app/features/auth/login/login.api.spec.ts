import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { APP_ENVIRONMENT } from '../../../core/config/app-environment';
import { authInterceptor } from '../../../core/http/auth.interceptor';
import { apiUser } from '../../../core/http/testing/auth-api.fixtures';
import { DataRepository } from '../../../core/services/data-repository';
import { MockDataRepository } from '../../../core/services/mock-data-repository';
import { Login } from './login';

function setup(mode: 'demo' | 'api', aviso?: string) {
  localStorage.clear();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideHttpClient(withInterceptors([authInterceptor])),
      provideHttpClientTesting(),
      { provide: DataRepository, useClass: MockDataRepository },
      { provide: APP_ENVIRONMENT, useValue: { authMode: mode, apiUrl: '/api/v1', sessionRestoreTimeoutMs: 5000 } },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(aviso ? { aviso } : {}) } } },
    ],
  });
  const navigateByUrl = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  const fixture = TestBed.createComponent(Login);
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement, navigateByUrl, ctrl: TestBed.inject(HttpTestingController) };
}

const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

describe('Inicio de sesión en modo API (B1.3)', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('modo API: sin la sección «Usuarios de prueba» (ni correos de prueba, contraseña, «Usar» ni restablecer)', () => {
    const { el } = setup('api');
    expect(el.querySelector('section.demo')).toBeNull();
    expect(el.querySelector('.demo__list')).toBeNull();
    expect(text(el)).not.toContain('Usuarios de prueba');
    expect(text(el)).not.toContain('demo1234');
    expect(text(el)).not.toContain('@ejemplo.test');
    expect(text(el)).not.toMatch(/datos de demostración|Restablecer/);
    expect([...el.querySelectorAll('button')].map(text)).not.toContain('Usar');
    // El formulario real se conserva.
    expect(el.querySelector('#email')).not.toBeNull();
    expect(el.querySelector('#password')).not.toBeNull();
    expect([...el.querySelectorAll('button[type=submit]')].map(text)).toEqual(['Ingresar']);
  });

  it('en modo demostración el login se ve como antes (cuentas de prueba, contraseña y restablecer)', () => {
    const { el } = setup('demo');
    expect(el.querySelector('section.demo')).not.toBeNull();
    expect(el.querySelectorAll('.demo__list li')).toHaveLength(7);
    expect(text(el)).toContain('Solo para la demostración (no es autenticación real)');
    expect(text(el.querySelector('.demo__pw'))).toBe('demo1234');
    expect(text(el)).toContain('Restablecer datos de demostración');
  });

  it.each([
    ['sesion-expirada', 'Tu sesión expiró o se cerró. Inicia sesión nuevamente.'],
    ['clave-actualizada', 'Contraseña actualizada. Inicia sesión con tu nueva contraseña.'],
    ['cuenta-activada', 'Tu cuenta está activada. Inicia sesión con tu correo y la contraseña que creaste.'],
  ])('aviso «%s»', (aviso, message) => {
    const { el } = setup('api', aviso);
    expect(text(el.querySelector('[role=status]'))).toBe(message);
  });

  it('con contraseña temporal, después de iniciar sesión lleva a /cambiar-clave', () => {
    const { el, fixture, ctrl, navigateByUrl } = setup('api');
    const set = (id: string, v: string) => {
      const input = el.querySelector<HTMLInputElement>(`#${id}`)!;
      input.value = v;
      input.dispatchEvent(new Event('input'));
    };
    set('email', 'nueva@empresa.pe');
    set('password', 'Temporal2026abc');
    el.querySelector<HTMLButtonElement>('button[type=submit]')!.click();
    fixture.detectChanges();
    ctrl
      .expectOne('/api/v1/auth/login')
      .flush({ accessToken: 't', tokenType: 'Bearer', expiresIn: 900, user: apiUser({ role: 'INSTRUCTOR', student: null, mustChangePassword: true }) });
    expect(navigateByUrl).toHaveBeenCalledWith('/cambiar-clave');
  });

  it('un error de la API se muestra en el formulario', () => {
    const { el, fixture, ctrl } = setup('api');
    const set = (id: string, v: string) => {
      const input = el.querySelector<HTMLInputElement>(`#${id}`)!;
      input.value = v;
      input.dispatchEvent(new Event('input'));
    };
    set('email', 'ana@ejemplo.test');
    set('password', 'incorrecta');
    el.querySelector<HTMLButtonElement>('button[type=submit]')!.click();
    ctrl.expectOne('/api/v1/auth/login').flush({ message: 'Correo o contraseña incorrectos.' }, { status: 401, statusText: 'Unauthorized' });
    fixture.detectChanges();
    expect(text(el.querySelector('[role=alert]'))).toBe('Correo o contraseña incorrectos.');
  });
});
