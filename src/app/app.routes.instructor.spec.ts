import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { firstValueFrom } from 'rxjs';
import { routes } from './app.routes';
import { AuthService } from './core/services/auth.service';
import { DataRepository } from './core/services/data-repository';
import { MockDataRepository } from './core/services/mock-data-repository';
import { DEMO_CONFIG } from './core/config/demo.config';

/** B1.2: rutas /instructor y redirecciones compatibles desde /admin, con las rutas y guards reales. Datos ficticios. */
async function setup(options: { email?: string; legacySession?: boolean } = {}) {
  localStorage.clear();
  sessionStorage.clear();
  if (options.legacySession) {
    localStorage.setItem(
      'imc-demo-session',
      JSON.stringify({ id: 'a1', fullName: 'Administrador de Prueba', email: 'admin@ejemplo.test', role: 'admin' }),
    );
  }
  TestBed.configureTestingModule({
    providers: [provideRouter(routes), { provide: DataRepository, useClass: MockDataRepository }],
  });
  if (options.email) await firstValueFrom(TestBed.inject(AuthService).login(options.email, DEMO_CONFIG.demoPassword));
  const harness = await RouterTestingHarness.create();
  return { harness, router: TestBed.inject(Router) };
}

const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

describe('Rutas del Instructor (B1.2)', () => {
  it('el Instructor entra a /instructor con «Panel del instructor» y sin textos de «Administración»', async () => {
    const { harness, router } = await setup({ email: 'admin@ejemplo.test' });
    await harness.navigateByUrl('/instructor');
    expect(router.url).toBe('/instructor');
    const root = harness.fixture.nativeElement as HTMLElement;
    expect(text(root.querySelector('.bar__area'))).toBe('Panel del instructor');
    expect(root.querySelector('aside')!.getAttribute('aria-label')).toBe('Menú del instructor');
    expect([...root.querySelectorAll<HTMLAnchorElement>('.side__nav a')].every((a) => a.getAttribute('href')!.startsWith('/instructor'))).toBe(true);
    expect(text(root)).not.toMatch(/Administraci[oó]n|Administrador/);
  }, 20_000);

  it('/admin redirige a /instructor', async () => {
    const { harness, router } = await setup({ email: 'admin@ejemplo.test' });
    await harness.navigateByUrl('/admin');
    expect(router.url).toBe('/instructor');
  }, 20_000);

  it('/admin/<sección> conserva la sección, los parámetros y el fragmento', async () => {
    const { harness, router } = await setup({ email: 'admin@ejemplo.test' });
    await harness.navigateByUrl('/admin/videos?curso=c-ia&modulo=c-ia-m1#lista');
    expect(router.url).toBe('/instructor/videos?curso=c-ia&modulo=c-ia-m1#lista');
    await harness.navigateByUrl('/admin/evaluaciones?curso=c-mkt');
    expect(router.url).toBe('/instructor/evaluaciones?curso=c-mkt');
  }, 20_000);

  it('una ruta /admin inexistente lleva a la página 404 bajo /instructor, sin bucles', async () => {
    const { harness, router } = await setup({ email: 'admin@ejemplo.test' });
    await harness.navigateByUrl('/admin/no-existe');
    expect(router.url).toBe('/instructor/no-existe');
    expect((harness.fixture.nativeElement as HTMLElement).querySelector('app-not-found')).not.toBeNull();
  }, 20_000);

  it('una sesión anterior (rol «admin») sigue funcionando y sus enlaces /admin llegan a /instructor', async () => {
    const { harness, router } = await setup({ legacySession: true });
    await harness.navigateByUrl('/admin/cursos');
    expect(router.url).toBe('/instructor/cursos');
    await harness.navigateByUrl('/login');
    expect(router.url).toBe('/instructor'); // con sesión, /login lleva al inicio del rol
  }, 20_000);

  it('un participante no entra por /admin ni por /instructor', async () => {
    const { harness, router } = await setup({ email: 'ana@ejemplo.test' });
    await harness.navigateByUrl('/admin/participantes');
    expect(router.url).toBe('/panel');
    await harness.navigateByUrl('/instructor/participantes');
    expect(router.url).toBe('/panel');
  }, 20_000);

  it('sin sesión, /admin y /instructor llevan al inicio de sesión', async () => {
    const { harness, router } = await setup();
    await harness.navigateByUrl('/admin/resultados');
    expect(router.url).toBe('/login');
    await harness.navigateByUrl('/instructor');
    expect(router.url).toBe('/login');
  }, 20_000);
});
