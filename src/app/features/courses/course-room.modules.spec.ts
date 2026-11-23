import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { firstValueFrom } from 'rxjs';
import { routes } from '../../app.routes';
import { AuthService } from '../../core/services/auth.service';
import { DataRepository } from '../../core/services/data-repository';
import { MockDataRepository } from '../../core/services/mock-data-repository';
import { DEMO_CONFIG } from '../../core/config/demo.config';

/**
 * M3: aula del alumno con módulos en acordeón. Rutas y guards reales; los módulos se preparan solo en el
 * localStorage aislado de la prueba. Luis (u2) tiene vistos v1 a v3 de c1. Datos ficticios.
 */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

async function until(harness: RouterTestingHarness, cond: () => boolean, timeout = 8000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    await harness.fixture.whenStable();
    if (cond()) return;
    await sleep(50);
  }
  throw new Error('La condición no se cumplió a tiempo');
}

/** c1 en tres módulos: Introducción (v1, v2), Fundamentos (v3, v4) y Aplicaciones (v5, v6). */
async function withModules(): Promise<void> {
  const prep = new MockDataRepository();
  await firstValueFrom(prep.saveCourseModule('c1', { id: 'c1-m1', title: 'Introducción' }));
  const m2 = (await firstValueFrom(prep.saveCourseModule('c1', { title: 'Fundamentos', description: 'Conceptos base' }))).modules[1].id;
  const m3 = (await firstValueFrom(prep.saveCourseModule('c1', { title: 'Aplicaciones' }))).modules[2].id;
  for (const v of ['v3', 'v4']) await firstValueFrom(prep.assignCourseVideoToModule('c1', v, m2));
  for (const v of ['v5', 'v6']) await firstValueFrom(prep.assignCourseVideoToModule('c1', v, m3));
}

async function open(url: string, email = 'luis@ejemplo.test', modules = true) {
  localStorage.clear();
  sessionStorage.clear();
  if (modules) await withModules();
  TestBed.configureTestingModule({
    providers: [provideRouter(routes, withComponentInputBinding()), { provide: DataRepository, useClass: MockDataRepository }],
  });
  await firstValueFrom(TestBed.inject(AuthService).login(email, DEMO_CONFIG.demoPassword));
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url);
  const root = harness.fixture.nativeElement as HTMLElement;
  await until(harness, () => !!root.querySelector('app-course-room nav .item'));
  return { harness, root };
}

const toggles = (root: HTMLElement) => [...root.querySelectorAll<HTMLButtonElement>('nav .module__toggle')];
const visibleVideos = (root: HTMLElement) => [...root.querySelectorAll('nav .item .t')].map((e) => text(e));

describe('Aula del alumno con módulos (M3)', () => {
  it('con un solo módulo el aula no cambia: sin acordeón ni indicador de módulo', async () => {
    const { root } = await open('/cursos/c1', 'luis@ejemplo.test', false);
    expect(toggles(root).length).toBe(0);
    expect(root.querySelector('.lesson__module')).toBeNull();
    expect(visibleVideos(root).length).toBe(6);
  });

  it('muestra los módulos en acordeón con el del video actual desplegado', async () => {
    const { root } = await open('/cursos/c1');
    // El video actual es el primero pendiente (v4, módulo 2).
    expect(text(root.querySelector('.lesson__module'))).toBe('Módulo 2 · Fundamentos');
    expect(text(root.querySelector('.lesson__num'))).toBe('Video 4 de 6');
    expect(toggles(root).map((b) => [text(b.querySelector('.module__title')), b.getAttribute('aria-expanded')])).toEqual([
      ['Módulo 1 · Introducción', 'false'],
      ['Módulo 2 · Fundamentos', 'true'],
      ['Módulo 3 · Aplicaciones', 'false'],
    ]);
    expect(toggles(root).map((b) => text(b.querySelector('.module__count')))).toEqual([
      '2/2 videos completados',
      '1/2 videos completados',
      '0/2 videos completados',
    ]);
    expect(visibleVideos(root)).toEqual(['Video 3 · Contenido de demostración', 'Video 4 · Contenido de demostración']);
    expect(text(root.querySelector('nav .module__desc'))).toBe('Conceptos base');
    expect(root.querySelector('nav .item.is-current')!.getAttribute('aria-current')).toBe('true');
  });

  it('desplegar y plegar módulos con el botón', async () => {
    const { root, harness } = await open('/cursos/c1');
    toggles(root)[0].click();
    await until(harness, () => toggles(root)[0].getAttribute('aria-expanded') === 'true');
    expect(visibleVideos(root).length).toBe(4);
    toggles(root)[1].click();
    await until(harness, () => toggles(root)[1].getAttribute('aria-expanded') === 'false');
    expect(visibleVideos(root)).toEqual(['Video 1 · Contenido de demostración', 'Video 2 · Contenido de demostración']);
  });

  it('«Siguiente» pasa al primer video del módulo siguiente y lo despliega', async () => {
    const { root, harness } = await open('/cursos/c1/videos/v4');
    const next = [...root.querySelectorAll<HTMLAnchorElement>('a.btn')].find((a) => text(a) === 'Siguiente')!;
    expect(next.getAttribute('href')).toBe('/cursos/c1/videos/v5');
    next.click();
    await until(harness, () => text(root.querySelector('.lesson__module')) === 'Módulo 3 · Aplicaciones');
    expect(text(root.querySelector('.lesson__num'))).toBe('Video 5 de 6');
    expect(toggles(root)[2].getAttribute('aria-expanded')).toBe('true');
    const prev = [...root.querySelectorAll<HTMLAnchorElement>('a.btn')].find((a) => text(a) === 'Anterior')!;
    expect(prev.getAttribute('href')).toBe('/cursos/c1/videos/v4');
  });

  it('«Marcar como visto y continuar» conserva el progreso y pasa al módulo siguiente', async () => {
    const { root, harness } = await open('/cursos/c1/videos/v4');
    const mark = [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => text(b) === 'Marcar como visto y continuar')!;
    mark.click();
    await until(harness, () => text(root.querySelector('.lesson__num')) === 'Video 5 de 6');
    expect(text(toggles(root)[1].querySelector('.module__count'))).toBe('2/2 videos completados');
    expect(text(root.querySelector('.lesson__module'))).toBe('Módulo 3 · Aplicaciones');
    const enrollment = await firstValueFrom(TestBed.inject(DataRepository).listEnrollments({ userId: 'u2', courseId: 'c1' }));
    expect(enrollment[0].completedVideoIds).toEqual(['v1', 'v2', 'v3', 'v4']);
    expect(text(root)).toContain('4 de 6 videos');
  });
});
