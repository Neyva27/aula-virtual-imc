import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { firstValueFrom } from 'rxjs';
import { routes } from './app.routes';
import { dataRepositoryFactory } from './app.config';
import { APP_ENVIRONMENT } from './core/config/app-environment';
import { DEMO_CONFIG } from './core/config/demo.config';
import { SessionStore } from './core/auth/session-store';
import { authInterceptor } from './core/http/auth.interceptor';
import { User } from './core/models/user.model';
import { AuthService } from './core/services/auth.service';
import { DataRepository } from './core/services/data-repository';

/** Navegación del modo API (solo módulos conectados) frente al modo demostración (todo, como antes). */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

const INSTRUCTOR: User = { id: 'a1', fullName: 'Instructor Real', firstNames: 'Instructor', lastNames: 'Real', email: 'i@empresa.pe', role: 'instructor' };
const STUDENT: User = { id: 'u1', fullName: 'Ana Torres', firstNames: 'Ana', lastNames: 'Torres', email: 'ana@empresa.pe', role: 'participant' };

/**
 * Espera una condición SIN `whenStable()`: sin zonas, whenStable espera las solicitudes HTTP pendientes, que aquí se
 * responden con HttpTestingController durante la espera (`onTick`).
 */
async function until(harness: RouterTestingHarness, cond: () => boolean, onTick?: () => void, timeout = 8000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    onTick?.();
    harness.fixture.detectChanges();
    if (cond()) return;
    await sleep(25);
  }
  throw new Error('La condición no se cumplió a tiempo');
}

async function setup(mode: 'demo' | 'api', url: string, user: User | null) {
  localStorage.clear();
  sessionStorage.clear();
  TestBed.configureTestingModule({
    providers: [
      provideRouter(routes, withComponentInputBinding()),
      provideHttpClient(withInterceptors([authInterceptor])),
      provideHttpClientTesting(),
      { provide: APP_ENVIRONMENT, useValue: { authMode: mode, apiUrl: '/api/v1', sessionRestoreTimeoutMs: 5000 } },
      { provide: DataRepository, useFactory: dataRepositoryFactory },
    ],
  });
  const auth = TestBed.inject(AuthService);
  if (mode === 'demo' && user) await firstValueFrom(auth.login(user.email, DEMO_CONFIG.demoPassword));
  const harness = await RouterTestingHarness.create();
  if (mode === 'api') TestBed.inject(SessionStore).set(user); // sesión ya iniciada (sin solicitudes)
  const router = TestBed.inject(Router);
  void router.navigateByUrl(url); // sin esperar la estabilidad (ver `until`)
  const root = harness.fixture.nativeElement as HTMLElement;
  return { harness, root, router, ctrl: TestBed.inject(HttpTestingController) };
}


const navLinks = (root: HTMLElement, selector: string) => [...root.querySelectorAll(selector)].map(text);

/**
 * Responde cualquier consulta pendiente con datos vacíos del servidor (listas vacías, páginas vacías, sin examen).
 * Comprueba de paso que en modo API las pantallas consultan la API y no datos de demostración.
 */
const EMPTY_DASHBOARD = {
  participants: { total: 0, active: 0, pendingActivation: 0, inactive: 0 },
  courses: { total: 0, published: 0, active: 0 },
  enrollments: { total: 0, byStatus: {} },
  evaluations: { total: 0, approved: 0, failed: 0, inReview: 0 },
  certificates: { issued: 0 },
  activity: [],
  recent: [],
};

function flushAll(ctrl: HttpTestingController, onRequest?: (url: string) => void): void {
  for (const r of ctrl.match(() => true)) {
    const url = r.request.url;
    onRequest?.(url);
    if (r.cancelled) continue;
    if (url === '/api/v1/students') r.flush({ items: [], total: 0, page: 1, pageSize: Number(r.request.params.get('pageSize') ?? 20) });
    else if (url === '/api/v1/students/companies') r.flush([{ id: 'emp-1', name: 'Empresa Uno', ruc: '20123456789', active: true }]);
    else if (url === '/api/v1/me/permissions') r.flush({ permissions: [] });
    else if (url === '/api/v1/dashboard') r.flush(EMPTY_DASHBOARD);
    else r.flush([]);
  }
}

describe('Modo API: paneles completos conectados al servidor', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('Instructor: Dashboard con el menú completo, datos de la API y sin avisos de demostración', async () => {
    const { harness, root, router, ctrl } = await setup('api', '/instructor', INSTRUCTOR);
    const requested = new Set<string>();
    await until(
      harness,
      () => !!root.querySelector('app-admin-dashboard') && requested.has('/api/v1/courses') && requested.has('/api/v1/dashboard'),
      () => flushAll(ctrl, (url) => requested.add(url)),
    );
    flushAll(ctrl);
    expect(root.querySelector('app-dashboard-charts')).not.toBeNull();
    expect(router.url).toBe('/instructor');
    expect(navLinks(root, '.side__nav a')).toEqual([
      'Dashboard', 'Participantes', 'Cursos', 'Videos', 'Evaluaciones', 'Evaluaciones rendidas', 'Certificados',
    ]);
    expect([...requested]).toEqual(expect.arrayContaining(['/api/v1/courses', '/api/v1/attempts', '/api/v1/certificates', '/api/v1/enrollments']));
    expect(root.querySelector('.demo-bar')).toBeNull();
    expect(root.querySelector('.side__demo')).toBeNull();
  });

  it.each([
    ['participantes', 'app-admin-students-api'],
    ['cursos', 'app-admin-courses'],
  ])('Instructor: /instructor/%s abre su pantalla conectada', async (path, selector) => {
    const { harness, root, router, ctrl } = await setup('api', `/instructor/${path}`, INSTRUCTOR);
    await until(harness, () => !!root.querySelector(selector), () => flushAll(ctrl));
    flushAll(ctrl);
    expect(router.url).toBe(`/instructor/${path}`);
  });

  it('Estudiante: panel real (GET /me/courses) con su menú de tres pestañas y sin avisos de demostración', async () => {
    const { harness, root, router, ctrl } = await setup('api', '/panel', STUDENT);
    const requested = new Set<string>();
    await until(harness, () => !!root.querySelector('app-panel') && requested.has('/api/v1/me/courses'), () =>
      ctrl.match(() => true).forEach((r) => {
        requested.add(r.request.url);
        r.flush([]);
      }),
    );
    expect(router.url).toBe('/panel');
    expect(navLinks(root, '.top__nav a')).toEqual(['Mis cursos', 'Mi progreso', 'Mis certificados']);
    expect(root.querySelector('.demo-bar')).toBeNull();
  });

  it('administración general: con el permiso, el menú agrega Empresas e Importar certificados, sin Instructores', async () => {
    const { harness, root, router, ctrl } = await setup('api', '/instructor/empresas', INSTRUCTOR);
    const respond = () =>
      ctrl.match(() => true).forEach((r) => {
        if (r.request.url === '/api/v1/me/permissions') r.flush({ permissions: ['IMC_GENERAL_ADMIN'] });
        else if (r.request.url === '/api/v1/students') r.flush({ items: [], total: 0, page: 1, pageSize: 100 });
        else r.flush([]);
      });
    await until(harness, () => !!root.querySelector('app-admin-companies') && navLinks(root, '.side__nav a').includes('Importar certificados'), respond);
    respond();
    expect(router.url).toBe('/instructor/empresas');
    expect(navLinks(root, '.side__nav a').slice(-2)).toEqual(['Empresas', 'Importar certificados']);
    expect(navLinks(root, '.side__nav a')).not.toContain('Instructores');
  });

  it.each(['/instructor/instructores', '/admin/instructores'])('la gestión de instructores se retiró: %s muestra «no encontrada»', async (url) => {
    const { harness, root, ctrl } = await setup('api', url, INSTRUCTOR);
    await until(harness, () => !!root.querySelector('app-not-found'), () => ctrl.match(() => true).forEach((r) => r.flush(r.request.url.endsWith('/me/permissions') ? { permissions: ['IMC_GENERAL_ADMIN'] } : [])));
    expect(root.querySelector('app-admin-layout')).toBeNull();
    expect(text(root)).not.toContain('Registrar instructor');
  });

  it('administración general: sin el permiso, el menú no cambia y /instructor/empresas vuelve al Dashboard', async () => {
    const { harness, root, router, ctrl } = await setup('api', '/instructor/empresas', INSTRUCTOR);
    const respond = () =>
      ctrl.match(() => true).forEach((r) => {
        if (r.cancelled) return; // forkJoin cancela al fallar /dashboard
        if (r.request.url === '/api/v1/me/permissions') r.flush({ permissions: [] });
        else if (r.request.url === '/api/v1/students') r.flush({ items: [], total: 0, page: 1, pageSize: 100 });
        else r.flush(r.request.url === '/api/v1/dashboard' ? { statusCode: 500, message: 'x' } : [], r.request.url === '/api/v1/dashboard' ? { status: 500, statusText: 'x' } : {});
      });
    await until(harness, () => !!root.querySelector('app-admin-dashboard') && router.url === '/instructor', respond);
    respond();
    expect(navLinks(root, '.side__nav a')).not.toContain('Empresas');
  });

  it('sin sesión: /verificar (verificación pública del servidor) está disponible, sin el aviso de demostración', async () => {
    const { harness, root, router } = await setup('api', '/verificar', null);
    await until(harness, () => !!root.querySelector('app-verify'));
    expect(router.url).toBe('/verificar');
    expect(root.querySelector('.auth__demo')).toBeNull();
    expect(text(root)).not.toMatch(/Versión de demostración|Usuarios de prueba|demo1234/);
  });
});

describe('Modo demostración: sin cambios', () => {
  it('Instructor: menú completo, aviso de demostración y módulos accesibles', async () => {
    const { harness, root, router } = await setup('demo', '/instructor/cursos', { ...INSTRUCTOR, email: 'admin@ejemplo.test' });
    await until(harness, () => !!root.querySelector('.side__nav a') && !!root.querySelector('app-admin-courses'));
    expect(router.url).toBe('/instructor/cursos');
    expect(navLinks(root, '.side__nav a')).toEqual([
      'Dashboard', 'Participantes', 'Cursos', 'Videos', 'Evaluaciones', 'Evaluaciones rendidas', 'Certificados',
    ]);
    expect(text(root.querySelector('.demo-bar'))).toBe('Versión de demostración · los datos mostrados son de prueba');
    expect(text(root.querySelector('.side__demo'))).toBe('Panel de demostración');
  });

  it('Estudiante: menú de tres pestañas y aviso de demostración', async () => {
    const { harness, root, router } = await setup('demo', '/progreso', { ...STUDENT, email: 'ana@ejemplo.test' });
    await until(harness, () => !!root.querySelector('.top__nav a'));
    expect(router.url).toBe('/progreso');
    expect(navLinks(root, '.top__nav a')).toEqual(['Mis cursos', 'Mi progreso', 'Mis certificados']);
    expect(root.querySelector('.demo-bar')).not.toBeNull();
  });

  it('sin sesión: /verificar sigue disponible y el login muestra el aviso y el panel de prueba', async () => {
    const { harness, root, router } = await setup('demo', '/verificar', null);
    await until(harness, () => !!root.querySelector('app-verify'));
    expect(router.url).toBe('/verificar');
    expect(text(root.querySelector('.auth__demo'))).toBe('Versión de demostración · datos de prueba');
    void router.navigateByUrl('/login');
    await until(harness, () => !!root.querySelector('section.demo'));
    expect(root.querySelectorAll('.demo__list li')).toHaveLength(7);
  });
});

describe('Activación de cuenta: ruta pública solo en modo API', () => {
  it('modo API: /activar-cuenta muestra la pantalla de activación sin sesión', async () => {
    const { harness, root, router } = await setup('api', '/activar-cuenta', null);
    await until(harness, () => !!root.querySelector('app-activate-account'));
    expect(router.url).toBe('/activar-cuenta');
    expect(root.querySelector('.auth__demo')).toBeNull();
  });

  it('modo demostración: la ruta no existe (página no encontrada)', async () => {
    const { harness, root } = await setup('demo', '/activar-cuenta', null);
    await until(harness, () => !!root.querySelector('app-not-found'));
    expect(root.querySelector('app-activate-account')).toBeNull();
  });
});

describe('Modo API: inicio de sesión', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('con sesión de Instructor, /login lleva a su Dashboard', async () => {
    const { harness, root, router, ctrl } = await setup('api', '/login', INSTRUCTOR);
    await until(harness, () => !!root.querySelector('app-admin-dashboard'), () => flushAll(ctrl));
    await until(harness, () => (flushAll(ctrl), true), () => flushAll(ctrl));
    flushAll(ctrl);
    expect(router.url).toBe('/instructor');
  });
});
