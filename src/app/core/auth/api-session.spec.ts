import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, TestRequest } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { APP_ENVIRONMENT, AppEnvironment } from '../config/app-environment';
import { authInterceptor } from '../http/auth.interceptor';
import { ApiAuthResponse } from '../http/auth-api.mapper';
import { apiUser } from '../http/testing/auth-api.fixtures';
import { NETWORK_ERROR_MESSAGE } from '../http/api-errors';
import { ApiSession, REFRESH_TIMEOUT_MS } from './api-session';
import { SessionStore } from './session-store';

const API = '/api/v1';
const auth = (token = 'token-1', overrides: Parameters<typeof apiUser>[0] = {}): ApiAuthResponse => ({
  accessToken: token,
  tokenType: 'Bearer',
  expiresIn: 900,
  user: apiUser(overrides),
});

function setup(env: Partial<AppEnvironment> = {}) {
  localStorage.clear();
  sessionStorage.clear();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([authInterceptor])),
      provideHttpClientTesting(),
      { provide: APP_ENVIRONMENT, useValue: { authMode: 'api', apiUrl: API, sessionRestoreTimeoutMs: 5000, ...env } },
    ],
  });
  const router = TestBed.inject(Router);
  const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
  const navigateByUrl = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
  return {
    session: TestBed.inject(ApiSession),
    store: TestBed.inject(SessionStore),
    http: TestBed.inject(HttpClient),
    ctrl: TestBed.inject(HttpTestingController),
    navigate,
    navigateByUrl,
  };
}

const flushError = (req: TestRequest, status: number, body: object = { message: 'x' }) => req.flush(body, { status, statusText: 'Error' });
const nextTick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('ApiSession e interceptor (modo API, B1.3)', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  describe('inicio de sesión', () => {
    it('envía las credenciales con la cabecera y la cookie; guarda el token SOLO en memoria', async () => {
      const { session, store, ctrl } = setup();
      const result = firstValueFrom(session.login('ana@ejemplo.test', 'demo1234'));
      const req = ctrl.expectOne(`${API}/auth/login`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ email: 'ana@ejemplo.test', password: 'demo1234' });
      expect(req.request.headers.get('X-Requested-With')).toBe('XMLHttpRequest');
      expect(req.request.withCredentials).toBe(true);
      expect(req.request.headers.has('Authorization')).toBe(false);
      req.flush(auth('token-ana'));

      expect((await result).role).toBe('participant');
      expect(store.user()?.id).toBe('u1');
      expect(session.token()).toBe('token-ana');
      expect(localStorage.length).toBe(0);
      expect(sessionStorage.length).toBe(0);
      expect(JSON.stringify({ ...localStorage, ...sessionStorage })).not.toContain('token-ana');
    });

    it('el Instructor queda con rol «instructor»', async () => {
      const { session, ctrl } = setup();
      const result = firstValueFrom(session.login('admin@ejemplo.test', 'demo1234'));
      ctrl.expectOne(`${API}/auth/login`).flush(auth('t', { id: 'a1', role: 'INSTRUCTOR', student: null }));
      expect((await result).role).toBe('instructor');
    });

    it.each([
      [401, { message: 'Correo o contraseña incorrectos.' }, 'Correo o contraseña incorrectos.'],
      [401, { message: 'Tu cuenta está bloqueada temporalmente por varios intentos fallidos.' }, 'bloqueada temporalmente'],
      [429, { message: 'Demasiadas solicitudes. Espera un momento e inténtalo nuevamente.' }, 'Demasiadas solicitudes'],
      [400, { message: ['Ingresa un correo electrónico válido.'] }, 'Ingresa un correo electrónico válido.'],
      [503, { statusCode: 503, message: 'El servicio no está disponible en este momento.' }, 'no está disponible'],
      [500, { statusCode: 500, message: 'detalle interno' }, 'Ocurrió un error inesperado'],
      [502, { proxy: 'backend detenido' }, 'No se pudo conectar con el servidor'],
    ])('error %i: mensaje claro y sin sesión', async (status, body, expected) => {
      const { session, store, ctrl } = setup();
      const result = firstValueFrom(session.login('ana@ejemplo.test', 'x'));
      flushError(ctrl.expectOne(`${API}/auth/login`), status, body);
      await expect(result).rejects.toThrow(expected);
      expect(store.user()).toBeNull();
      expect(session.token()).toBeNull();
    });

    it('sin conexión con el servidor: mensaje de conexión (nunca pasa al modo demostración)', async () => {
      const { session, store, ctrl } = setup();
      const result = firstValueFrom(session.login('ana@ejemplo.test', 'demo1234'));
      ctrl.expectOne(`${API}/auth/login`).error(new ProgressEvent('error'), { status: 0 });
      await expect(result).rejects.toThrow(NETWORK_ERROR_MESSAGE);
      expect(store.user()).toBeNull();
    });

    it('un rol desconocido rechaza el inicio de sesión', async () => {
      const { session, store, ctrl } = setup();
      const result = firstValueFrom(session.login('x@ejemplo.test', 'demo1234'));
      ctrl.expectOne(`${API}/auth/login`).flush({ ...auth(), user: { ...apiUser(), role: 'ADMIN' } });
      await expect(result).rejects.toThrow(/perfil no reconocido/);
      expect(store.user()).toBeNull();
      expect(session.token()).toBeNull();
    });
  });

  describe('restauración al abrir la aplicación', () => {
    it('con cookie válida restaura la sesión (refresh con cabecera y cookie)', async () => {
      const { session, store, ctrl } = setup();
      const done = session.restore();
      const req = ctrl.expectOne(`${API}/auth/refresh`);
      expect(req.request.method).toBe('POST');
      expect(req.request.headers.get('X-Requested-With')).toBe('XMLHttpRequest');
      expect(req.request.withCredentials).toBe(true);
      req.flush(auth('token-restaurado'));
      await done;
      expect(store.user()?.id).toBe('u1');
      expect(session.token()).toBe('token-restaurado');
      expect(store.notice()).toBe('');
    });

    it('sin cookie (401) queda sin sesión y sin aviso', async () => {
      const { session, store, ctrl } = setup();
      const done = session.restore();
      flushError(ctrl.expectOne(`${API}/auth/refresh`), 401);
      await done;
      expect(store.user()).toBeNull();
      expect(store.notice()).toBe('');
    });

    it('si la API no responde, no bloquea el arranque: tiempo máximo y aviso de conexión', async () => {
      const { session, store, ctrl } = setup({ sessionRestoreTimeoutMs: 30 });
      const done = session.restore();
      const req = ctrl.expectOne(`${API}/auth/refresh`); // nunca se responde
      await done;
      expect(store.user()).toBeNull();
      expect(store.notice()).toBe(NETWORK_ERROR_MESSAGE);
      expect(req.cancelled).toBe(true);
    });
  });

  describe('cierre de sesión', () => {
    it('borra la sesión local de inmediato y avisa al servidor con la cabecera y la cookie', async () => {
      const { session, store, ctrl } = setup();
      const login = firstValueFrom(session.login('ana@ejemplo.test', 'demo1234'));
      ctrl.expectOne(`${API}/auth/login`).flush(auth());
      await login;
      session.logout();
      expect(store.user()).toBeNull();
      expect(session.token()).toBeNull();
      const req = ctrl.expectOne(`${API}/auth/logout`);
      expect(req.request.headers.get('X-Requested-With')).toBe('XMLHttpRequest');
      expect(req.request.withCredentials).toBe(true);
      expect(req.request.headers.has('Authorization')).toBe(false);
      req.flush(null, { status: 204, statusText: 'No Content' });
    });

    it('si el servidor no responde, la sesión local queda cerrada igual', () => {
      const { session, store, ctrl } = setup();
      session.logout();
      ctrl.expectOne(`${API}/auth/logout`).error(new ProgressEvent('error'), { status: 0 });
      expect(store.user()).toBeNull();
    });
  });

  describe('interceptor: token, renovación y reintento', () => {
    async function loggedIn(token = 'token-1') {
      const ctx = setup();
      const login = firstValueFrom(ctx.session.login('ana@ejemplo.test', 'demo1234'));
      ctx.ctrl.expectOne(`${API}/auth/login`).flush(auth(token));
      await login;
      return ctx;
    }

    it('añade el token y la cabecera a la API; no envía la cookie fuera de /auth', async () => {
      const { http, ctrl } = await loggedIn('token-1');
      void firstValueFrom(http.get(`${API}/users/u2`));
      const req = ctrl.expectOne(`${API}/users/u2`);
      expect(req.request.headers.get('Authorization')).toBe('Bearer token-1');
      expect(req.request.headers.get('X-Requested-With')).toBe('XMLHttpRequest');
      expect(req.request.withCredentials).toBe(false);
      req.flush({});
    });

    it('no toca solicitudes que no son de la API', async () => {
      const { http, ctrl } = await loggedIn();
      void firstValueFrom(http.get('/demo/covers/x.svg', { responseType: 'text' }));
      const req = ctrl.expectOne('/demo/covers/x.svg');
      expect(req.request.headers.has('Authorization')).toBe(false);
      expect(req.request.headers.has('X-Requested-With')).toBe(false);
      req.flush('');
    });

    it('ante un 401 renueva una vez y reintenta la solicitud una vez con el token nuevo', async () => {
      const { http, ctrl, session } = await loggedIn('token-viejo');
      const result = firstValueFrom(http.get<{ ok: boolean }>(`${API}/users/u2`));
      flushError(ctrl.expectOne(`${API}/users/u2`), 401);
      await nextTick();
      ctrl.expectOne(`${API}/auth/refresh`).flush(auth('token-nuevo'));
      await nextTick();
      const retry = ctrl.expectOne(`${API}/users/u2`);
      expect(retry.request.headers.get('Authorization')).toBe('Bearer token-nuevo');
      retry.flush({ ok: true });
      expect(await result).toEqual({ ok: true });
      expect(session.token()).toBe('token-nuevo');
    });

    it('tres solicitudes con 401 a la vez producen UNA sola renovación', async () => {
      const { http, ctrl } = await loggedIn();
      const results = ['a', 'b', 'c'].map((id) => firstValueFrom(http.get(`${API}/items/${id}`)));
      for (const id of ['a', 'b', 'c']) flushError(ctrl.expectOne(`${API}/items/${id}`), 401);
      await nextTick();
      const refreshes = ctrl.match(`${API}/auth/refresh`);
      expect(refreshes).toHaveLength(1);
      refreshes[0].flush(auth('token-2'));
      await nextTick();
      for (const id of ['a', 'b', 'c']) ctrl.expectOne(`${API}/items/${id}`).flush({ id });
      expect(await Promise.all(results)).toEqual([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    });

    it('si la renovación es rechazada (sesión expirada): cierra la sesión y vuelve al login con aviso', async () => {
      const { http, ctrl, store, session, navigate } = await loggedIn();
      const result = firstValueFrom(http.get(`${API}/users/u2`));
      flushError(ctrl.expectOne(`${API}/users/u2`), 401);
      await nextTick();
      flushError(ctrl.expectOne(`${API}/auth/refresh`), 401);
      await expect(result).rejects.toBeTruthy();
      expect(store.user()).toBeNull();
      expect(session.token()).toBeNull();
      expect(navigate).toHaveBeenCalledWith(['/login'], { queryParams: { aviso: 'sesion-expirada' } });
    });

    it('si el reintento vuelve a dar 401 cierra la sesión (sin bucles: no hay una segunda renovación)', async () => {
      const { http, ctrl, store, navigate } = await loggedIn();
      const result = firstValueFrom(http.get(`${API}/users/u2`));
      flushError(ctrl.expectOne(`${API}/users/u2`), 401);
      await nextTick();
      ctrl.expectOne(`${API}/auth/refresh`).flush(auth('token-2'));
      await nextTick();
      flushError(ctrl.expectOne(`${API}/users/u2`), 401);
      await expect(result).rejects.toBeTruthy();
      ctrl.expectNone(`${API}/auth/refresh`);
      expect(store.user()).toBeNull();
      expect(navigate).toHaveBeenCalledWith(['/login'], { queryParams: { aviso: 'sesion-expirada' } });
    });

    it('si la renovación falla por conexión, conserva la sesión (no la da por expirada)', async () => {
      const { http, ctrl, store, navigate } = await loggedIn();
      const result = firstValueFrom(http.get(`${API}/users/u2`));
      flushError(ctrl.expectOne(`${API}/users/u2`), 401);
      await nextTick();
      ctrl.expectOne(`${API}/auth/refresh`).error(new ProgressEvent('error'), { status: 0 });
      await expect(result).rejects.toBeTruthy();
      expect(store.user()).not.toBeNull();
      expect(navigate).not.toHaveBeenCalled();
    });

    it('un 401 en login, refresh o logout no dispara una renovación', async () => {
      const { session, ctrl } = setup();
      const result = firstValueFrom(session.login('ana@ejemplo.test', 'mala'));
      flushError(ctrl.expectOne(`${API}/auth/login`), 401);
      await expect(result).rejects.toBeTruthy();
      ctrl.expectNone(`${API}/auth/refresh`);
    });

    it('403 «PasswordChangeRequired»: marca la sesión y lleva al cambio de contraseña', async () => {
      const { http, ctrl, store, navigateByUrl } = await loggedIn();
      const result = firstValueFrom(http.get(`${API}/users/u2`));
      flushError(ctrl.expectOne(`${API}/users/u2`), 403, { statusCode: 403, error: 'PasswordChangeRequired', message: 'Debes cambiar tu contraseña temporal antes de continuar.' });
      await expect(result).rejects.toBeTruthy();
      expect(store.user()?.mustChangePassword).toBe(true);
      expect(navigateByUrl).toHaveBeenCalledWith('/cambiar-clave');
      ctrl.expectNone(`${API}/auth/refresh`);
    });
  });

  describe('cambio de contraseña', () => {
    it('envía la solicitud con el token; al terminar no queda sesión', async () => {
      const { session, store, ctrl } = setup();
      const login = firstValueFrom(session.login('admin@ejemplo.test', 'Temporal2026abc'));
      ctrl.expectOne(`${API}/auth/login`).flush(auth('token-t', { id: 'a1', role: 'INSTRUCTOR', student: null, mustChangePassword: true }));
      await login;
      const change = firstValueFrom(session.changePassword('Temporal2026abc', 'Definitiva2026'));
      const req = ctrl.expectOne(`${API}/auth/password`);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({ currentPassword: 'Temporal2026abc', newPassword: 'Definitiva2026' });
      expect(req.request.headers.get('Authorization')).toBe('Bearer token-t');
      req.flush(null, { status: 204, statusText: 'No Content' });
      await change;
      expect(store.user()).toBeNull();
      expect(session.token()).toBeNull();
    });

    it('con la contraseña actual incorrecta muestra el mensaje del servidor y conserva la sesión', async () => {
      const { session, store, ctrl } = setup();
      const login = firstValueFrom(session.login('admin@ejemplo.test', 'x'));
      ctrl.expectOne(`${API}/auth/login`).flush(auth('t', { mustChangePassword: true }));
      await login;
      const change = firstValueFrom(session.changePassword('mala', 'Definitiva2026'));
      flushError(ctrl.expectOne(`${API}/auth/password`), 400, { message: 'La contraseña actual no es correcta.' });
      await expect(change).rejects.toThrow('La contraseña actual no es correcta.');
      expect(store.user()).not.toBeNull();
    });
  });

  describe('coordinación entre pestañas', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('la renovación se ejecuta dentro del cerrojo de Web Locks cuando el navegador lo ofrece', async () => {
      const requested: string[] = [];
      vi.stubGlobal('navigator', {
        ...navigator,
        locks: { request: (name: string, _o: unknown, task: () => Promise<unknown>) => (requested.push(name), task()) },
      });
      const { session, ctrl } = setup();
      const done = session.refresh();
      await nextTick();
      ctrl.expectOne(`${API}/auth/refresh`).flush(auth('t2'));
      await done;
      expect(requested).toEqual(['imc-auth-refresh']);
    });

    it('si otra pestaña retiene el cerrojo, la restauración desiste al vencer su tiempo máximo (no bloquea el arranque)', async () => {
      // Cerrojo ocupado por otra pestaña: nunca se concede; solo se rechaza cuando la señal se cancela.
      vi.stubGlobal('navigator', {
        ...navigator,
        locks: {
          request: (_n: string, options: { signal?: AbortSignal }) =>
            new Promise((_resolve, reject) => options.signal?.addEventListener('abort', () => reject(options.signal!.reason))),
        },
      });
      const { session, store, ctrl } = setup({ sessionRestoreTimeoutMs: 50 });
      const started = Date.now();
      await session.restore();
      expect(Date.now() - started).toBeLessThan(2000);
      expect(store.user()).toBeNull();
      expect(store.notice()).toBe(NETWORK_ERROR_MESSAGE);
      ctrl.expectNone(`${API}/auth/refresh`); // nunca llegó a pedir la renovación
    });
  });

  describe('límite de la renovación', () => {
    afterEach(() => vi.useRealTimers());

    it('una renovación sin respuesta se cancela a los 15 s (no retiene el cerrojo indefinidamente)', async () => {
      vi.useFakeTimers();
      const { session, ctrl } = setup();
      const done = session.refresh().catch((error: unknown) => error);
      const req = ctrl.expectOne(`${API}/auth/refresh`);
      await vi.advanceTimersByTimeAsync(REFRESH_TIMEOUT_MS + 10);
      expect(req.cancelled).toBe(true);
      expect(await done).toBeInstanceOf(Error);
    });
  });
});
