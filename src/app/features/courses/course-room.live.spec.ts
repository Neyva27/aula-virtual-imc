import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { firstValueFrom } from 'rxjs';
import { routes } from '../../app.routes';
import { AuthService } from '../../core/services/auth.service';
import { DataRepository } from '../../core/services/data-repository';
import { MockDataRepository, STORAGE_KEY } from '../../core/services/mock-data-repository';
import { DEMO_CONFIG } from '../../core/config/demo.config';
import { LiveSession } from '../../core/models/course.model';

/**
 * Sesiones en vivo en el aula del alumno (20/11/2026). Las sesiones se preparan en el localStorage aislado de la
 * prueba con el repositorio de demostración (mismas reglas que el backend). Datos ficticios.
 */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

async function until(harness: RouterTestingHarness, cond: () => boolean, timeout = 8000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    await harness.fixture.whenStable();
    if (cond()) return;
    await sleep(50);
  }
  throw new Error('La condición no se cumplió a tiempo');
}

async function prepare(): Promise<LiveSession[]> {
  const prep = new MockDataRepository();
  // Una clase ya realizada, con su grabación (se crea en el futuro y se mueve al pasado en el estado guardado).
  const done = await firstValueFrom(prep.createCourseLiveSession('c1', { moduleId: null, title: 'Clase de apertura', startsAt: inDays(1), meetUrl: 'https://meet.google.com/zzz-yyyy-xxx' }));
  const state = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
  state.liveSessions[0].startsAt = new Date(Date.now() - 2 * 86_400_000).toISOString();
  state.liveSessions[0].recordingUrl = 'https://drive.google.com/file/d/1A2b3C4d5E6f7G8h9I0jKlMnOpQrStUvW/view';
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  expect(done).toHaveLength(1);
  const prep2 = new MockDataRepository();
  await firstValueFrom(prep2.createCourseLiveSession('c1', { moduleId: 'c1-m1', title: 'Bienvenida en vivo', startsAt: inDays(1), meetUrl: 'https://meet.google.com/abc-defg-hij' }));
  const list = await firstValueFrom(
    prep2.createCourseLiveSession('c1', { moduleId: 'c1-m1', title: 'Taller práctico', description: 'Trae tus dudas.', startsAt: inDays(2), meetUrl: 'https://meet.google.com/qwe-rtyu-iop' }),
  );
  return firstValueFrom(prep2.setCourseLiveSessionStatus('c1', list.find((s) => s.title === 'Taller práctico')!.id, 'cancelada'));
}

async function open(email: string, withSessions = true) {
  localStorage.clear();
  sessionStorage.clear();
  if (withSessions) await prepare();
  TestBed.configureTestingModule({
    providers: [provideRouter(routes, withComponentInputBinding()), { provide: DataRepository, useClass: MockDataRepository }],
  });
  await firstValueFrom(TestBed.inject(AuthService).login(email, DEMO_CONFIG.demoPassword));
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl('/cursos/c1');
  const root = harness.fixture.nativeElement as HTMLElement;
  await until(harness, () => !!root.querySelector('app-course-room nav .item'));
  return { harness, root };
}

describe('Aula del alumno: sesiones en vivo con Google Meet', () => {
  it('el aula tiene las cuatro secciones del curso', async () => {
    const { root } = await open('luis@ejemplo.test', false);
    expect([...root.querySelectorAll('[data-test="course-sections"] button')].map((b) => text(b))).toEqual([
      'Contenido del curso',
      'Clases en vivo',
      'Evaluaciones',
      'Progreso y certificados',
    ]);
    for (const id of ['seccion-contenido', 'seccion-clases', 'seccion-evaluaciones', 'seccion-progreso']) expect(root.querySelector(`#${id}`)).not.toBeNull();
  }, 20_000);

  it('muestra título, módulo, fecha y el botón «Unirse a la clase» que abre Meet directamente; la grabación si existe', async () => {
    const { harness, root } = await open('luis@ejemplo.test');
    await until(harness, () => root.querySelectorAll('[data-test="live-sessions"] [data-live-session]').length === 3);
    expect([...root.querySelectorAll('.live-group')].map((h) => text(h))).toEqual(['Próximas clases', 'Clases anteriores']);
    const items = [...root.querySelectorAll<HTMLElement>('[data-test="live-sessions"] [data-live-session]')];
    const [first, cancelled, past] = items;
    expect(text(first)).toContain('Bienvenida en vivo');
    expect(text(first)).toContain('Módulo 1: Contenido del curso');
    expect(text(first)).toContain('(hora de Lima)');
    const join = first.querySelector<HTMLAnchorElement>('a.btn')!;
    expect(text(join)).toBe('Unirse a la clase');
    expect(first.querySelector('[data-test="recording"]')).toBeNull(); // sin grabación, no hay enlace
    expect(join.getAttribute('href')).toBe('https://meet.google.com/abc-defg-hij');
    expect(join.getAttribute('target')).toBe('_blank');
    expect(join.getAttribute('rel')).toBe('noopener noreferrer');
    // La cancelada sigue visible, con su estado y sin botón para unirse.
    expect(text(cancelled)).toContain('Taller práctico');
    expect(text(cancelled)).toContain('Cancelada');
    expect(text(cancelled)).toContain('Trae tus dudas.');
    expect(cancelled.querySelector('a')).toBeNull();
    // Finalizada: sin botón para unirse y con su grabación.
    expect(text(past)).toContain('Clase de apertura');
    expect(text(past)).toContain('Clase de todo el curso');
    expect(text(past)).toContain('Finalizada');
    expect(text(past)).not.toContain('Unirse a la clase');
    expect(past.querySelector('[data-test="recording"]')!.getAttribute('href')).toBe('https://drive.google.com/file/d/1A2b3C4d5E6f7G8h9I0jKlMnOpQrStUvW/view');
  }, 20_000);

  it('sin clases programadas la sección lo indica', async () => {
    const { harness, root } = await open('luis@ejemplo.test', false);
    await until(harness, () => !!root.querySelector('[data-test="live-empty"]'));
    expect(text(root.querySelector('[data-test="live-empty"]'))).toBe('No hay clases en vivo programadas para este curso.');
  }, 20_000);
});
