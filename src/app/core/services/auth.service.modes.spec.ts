import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { APP_ENVIRONMENT } from '../config/app-environment';
import { authInterceptor } from '../http/auth.interceptor';
import { apiUser } from '../http/testing/auth-api.fixtures';
import { AuthService } from './auth.service';
import { DataRepository } from './data-repository';
import { MockDataRepository } from './mock-data-repository';
import { DEMO_CONFIG } from '../config/demo.config';

function setup(mode?: 'demo' | 'api') {
  localStorage.clear();
  sessionStorage.clear();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([authInterceptor])),
      provideHttpClientTesting(),
      { provide: DataRepository, useClass: MockDataRepository },
      ...(mode ? [{ provide: APP_ENVIRONMENT, useValue: { authMode: mode, apiUrl: '/api/v1', sessionRestoreTimeoutMs: 5000 } }] : []),
    ],
  });
  vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  return { auth: TestBed.inject(AuthService), ctrl: TestBed.inject(HttpTestingController) };
}

describe('AuthService: modo demostración y modo API (B1.3)', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('por defecto está en modo demostración y no hace NINGUNA solicitud HTTP', async () => {
    const { auth, ctrl } = setup();
    expect(auth.apiMode).toBe(false);
    await auth.initialize();
    const user = await firstValueFrom(auth.login('admin@ejemplo.test', DEMO_CONFIG.demoPassword));
    expect(user.role).toBe('instructor');
    expect(localStorage.getItem('imc-demo-session')).not.toBeNull(); // sesión simulada, como antes
    auth.logout();
    expect(auth.user()).toBeNull();
    expect(localStorage.getItem('imc-demo-session')).toBeNull();
    ctrl.verify(); // ninguna solicitud
  });

  it('en modo demostración el cambio de contraseña no está disponible y nunca hay contraseña temporal', async () => {
    const { auth } = setup('demo');
    await firstValueFrom(auth.login('ana@ejemplo.test', DEMO_CONFIG.demoPassword));
    expect(auth.mustChangePassword()).toBe(false);
    await expect(firstValueFrom(auth.changePassword('a', 'b'))).rejects.toThrow(/solo está disponible/);
  });

  it('en modo API restaura la sesión al iniciar y no usa localStorage para la sesión', async () => {
    const { auth, ctrl } = setup('api');
    expect(auth.apiMode).toBe(true);
    const init = auth.initialize();
    ctrl.expectOne('/api/v1/auth/refresh').flush({ accessToken: 't', tokenType: 'Bearer', expiresIn: 900, user: apiUser() });
    await init;
    expect(auth.user()?.id).toBe('u1');
    expect(localStorage.getItem('imc-demo-session')).toBeNull();
  });

  it('en modo API el inicio de sesión va al servidor (no a los datos de demostración)', async () => {
    const { auth, ctrl } = setup('api');
    const login = firstValueFrom(auth.login('admin@ejemplo.test', 'Temporal2026abc'));
    ctrl
      .expectOne('/api/v1/auth/login')
      .flush({ accessToken: 't', tokenType: 'Bearer', expiresIn: 900, user: apiUser({ id: 'a1', role: 'INSTRUCTOR', student: null, mustChangePassword: true }) });
    expect((await login).role).toBe('instructor');
    expect(auth.mustChangePassword()).toBe(true);
    auth.logout();
    ctrl.expectOne('/api/v1/auth/logout').flush(null, { status: 204, statusText: 'No Content' });
    expect(auth.user()).toBeNull();
  });
});
