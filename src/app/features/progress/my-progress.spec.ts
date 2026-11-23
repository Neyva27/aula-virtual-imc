import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { firstValueFrom } from 'rxjs';
import { MyProgress, examState } from './my-progress';
import { routes } from '../../app.routes';
import { AuthService } from '../../core/services/auth.service';
import { DataRepository } from '../../core/services/data-repository';
import { MockDataRepository, STORAGE_KEY } from '../../core/services/mock-data-repository';
import { ExamSessionService } from '../../core/services/exam-session.service';
import { DemoState } from '../../core/data/demo-state';
import { DEMO_CONFIG } from '../../core/config/demo.config';
import { Attempt, ExamAvailability } from '../../core/models/exam.model';

/**
 * F4: «Mi progreso» con el repositorio simulado real y las rutas reales de la aplicación (guards incluidos).
 * Los estados especiales se preparan solo en el localStorage aislado de la prueba. Datos ficticios.
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

async function setup(email: string | null, edit?: (s: DemoState) => void) {
  localStorage.clear();
  sessionStorage.clear();
  if (edit) {
    new MockDataRepository().resetDemo();
    const s: DemoState = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    edit(s);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  }
  TestBed.configureTestingModule({
    providers: [provideRouter(routes, withComponentInputBinding()), { provide: DataRepository, useClass: MockDataRepository }],
  });
  if (email) await firstValueFrom(TestBed.inject(AuthService).login(email, DEMO_CONFIG.demoPassword));
  const harness = await RouterTestingHarness.create();
  return { harness, router: TestBed.inject(Router) };
}

/** Abre /progreso y espera a que termine de cargar. Devuelve el elemento de la página (con el menú). */
async function openProgress(email: string, edit?: (s: DemoState) => void) {
  const ctx = await setup(email, edit);
  await ctx.harness.navigateByUrl('/progreso');
  const root = ctx.harness.fixture.nativeElement as HTMLElement;
  await until(ctx.harness, () => !!root.querySelector('app-my-progress') && !text(root).includes('Cargando'));
  return { ...ctx, root, page: root.querySelector('app-my-progress') as HTMLElement };
}

const course = (el: HTMLElement, id: string) => el.querySelector<HTMLElement>(`li[data-course="${id}"]`)!;
const examBadge = (el: HTMLElement, id: string) => text(course(el, id).querySelector('.exam-state'));
const summary = (el: HTMLElement) =>
  Object.fromEntries([...el.querySelectorAll('.summary div')].map((d) => [text(d.querySelector('dt')), text(d.querySelector('dd'))]));

const availability = (over: Partial<ExamAvailability> = {}): ExamAvailability =>
  ({ examId: 'e1', available: false, reason: 'Motivo', maxAttempts: 1, remainingAttempts: 1, ...over }) as ExamAvailability;
const attempt = (over: Partial<Attempt>): Attempt =>
  ({ id: 'a', userId: 'u', courseId: 'c', examId: 'e1', date: '2026-10-10T10:00:00Z', durationSec: 60, score: 50,
    scaleMax: 100, correctCount: 5, totalQuestions: 10, passed: false, ...over }) as Attempt;

describe('examState (F4)', () => {
  it('deduce cada estado solo de los datos existentes', () => {
    expect(examState(availability({ reason: 'El curso está en borrador.' }), [], 'e1', false)).toEqual({
      state: 'pendiente',
      reason: 'El curso está en borrador.',
    });
    expect(examState(availability({ available: true, reason: '' }), [], 'e1', false).state).toBe('disponible');
    expect(examState(availability({ available: true }), [], 'e1', true).state).toBe('en_curso');
    expect(examState(availability(), [attempt({ passed: true })], 'e1', false).state).toBe('aprobada');
    expect(examState(availability(), [attempt({ passed: false })], 'e1', false).state).toBe('desaprobada');
    // Intento de un examen anterior y una evaluación nueva disponible: se ofrece la nueva.
    expect(examState(availability({ available: true }), [attempt({ examId: 'viejo' })], 'e1', false).state).toBe('disponible');
    // Intento de un examen anterior sin evaluación disponible: se informa su resultado histórico.
    expect(examState(availability(), [attempt({ examId: 'viejo', passed: true })], null, false).state).toBe('aprobada');
  });
});

describe('Mi progreso (F4)', () => {
  it('alumno con varios cursos asignados, sin avance: lista todos y muestra el estado vacío de progreso', async () => {
    const { page } = await openProgress('pedro@ejemplo.test');
    expect([...page.querySelectorAll('li[data-course]')].map((l) => l.getAttribute('data-course'))).toEqual(['c1', 'c-ia', 'c-mkt']);
    expect(summary(page)).toEqual({
      'Cursos asignados': '3',
      'Cursos con todos los videos vistos': '0',
      'Evaluaciones aprobadas': '0',
      'Certificados obtenidos': '0', // M6
    });
    expect(text(page)).toContain('Todavía no registras avance. Empieza por ver los videos de tus cursos.');
    const c1 = text(course(page, 'c1'));
    expect(c1).toContain('0 de 6 videos completados');
    expect(c1).toContain('0%');
    expect(c1).toContain('Comenzar curso');
    expect(examBadge(page, 'c1')).toBe('Pendiente');
    expect(c1).toContain('Debes completar todos los videos antes de rendir el examen.');
    expect(examBadge(page, 'c-ia')).toBe('Pendiente');
    expect(text(course(page, 'c-ia'))).toContain('El curso está en borrador');
    expect(course(page, 'c1').querySelector('a[href="/cursos/c1"]')).not.toBeNull();
    expect(page.querySelector('[data-attempt]')).toBeNull();
  }, 20_000);

  it('curso con progreso parcial y curso completado sin evaluación disponible', async () => {
    const { page } = await openProgress('luis@ejemplo.test');
    const c1 = text(course(page, 'c1'));
    expect(c1).toContain('3 de 6 videos completados');
    expect(c1).toContain('50%');
    expect(c1).toContain('Continuar curso');
    expect(c1).toContain('En progreso');
    const mkt = text(course(page, 'c-mkt'));
    expect(mkt).toContain('1 de 1 video completado');
    expect(mkt).toContain('100%');
    expect(examBadge(page, 'c-mkt')).toBe('Pendiente');
    expect(summary(page)['Cursos con todos los videos vistos']).toBe('1');
    expect(text(page)).not.toContain('Todavía no registras avance');
  }, 20_000);

  it('curso completado con evaluación disponible y en curso', async () => {
    const ready = await openProgress('rosa@ejemplo.test');
    expect(examBadge(ready.page, 'c1')).toBe('Disponible');
    expect(text(course(ready.page, 'c1'))).toContain('Ya puedes rendir la evaluación. Tienes un solo intento.');
    expect(course(ready.page, 'c1').querySelector('a[href="/cursos/c1/examen"]')).not.toBeNull();
    TestBed.resetTestingModule();

    const ctx = await setup('rosa@ejemplo.test');
    TestBed.inject(ExamSessionService).start('u5', 20, 'c1-e1');
    await ctx.harness.navigateByUrl('/progreso');
    const root = ctx.harness.fixture.nativeElement as HTMLElement;
    await until(ctx.harness, () => !!root.querySelector('li[data-course="c1"] .exam-state'));
    expect(examBadge(root, 'c1')).toBe('En curso');
    expect(text(course(root, 'c1'))).toContain('Continuar evaluación');
  }, 30_000);

  it('evaluación rendida y desaprobada: muestra el resultado histórico sin alterarlo', async () => {
    const { page } = await openProgress('carla@ejemplo.test');
    expect(examBadge(page, 'c1')).toBe('Desaprobada');
    const att = text(page.querySelector('[data-attempt="att2"]'));
    expect(att).toContain('50 / 100');
    // Etapa 1: el estudiante ya no ve cuántas respuestas acertó (el dato se conserva para el Instructor).
    expect(att).not.toContain('5 de 10');
    expect(att).not.toContain('Correctas');
    expect(att).toContain('20 min 0 s');
    expect(att).toContain('Desaprobado');
    expect(course(page, 'c1').querySelector('a[href="/cursos/c1/examen/resultado"]')).not.toBeNull();
    expect(course(page, 'c1').querySelector('a[href="/cursos/c1/examen"]')).toBeNull(); // no invita a volver a rendir
  }, 20_000);

  it('usa la escala guardada en el intento, no la configuración actual', async () => {
    const { page } = await openProgress('carla@ejemplo.test', (s) => {
      const a = s.attempts.find((x) => x.id === 'att2')!;
      a.score = 9;
      a.scaleMax = 20;
    });
    expect(text(page.querySelector('[data-attempt="att2"]'))).toContain('9 / 20');
  }, 20_000);

  it('evaluación aprobada: enlaza al certificado emitido o indica que está pendiente', async () => {
    const ana = await openProgress('ana@ejemplo.test');
    expect(examBadge(ana.page, 'c1')).toBe('Aprobada');
    expect(text(ana.page.querySelector('[data-attempt="att1"]'))).toContain('80 / 100');
    expect(ana.page.querySelector('li[data-course="c1"] a[href="/certificados/cert1"]')).not.toBeNull();
    expect(summary(ana.page)['Evaluaciones aprobadas']).toBe('1');
    TestBed.resetTestingModule();

    const jorge = await openProgress('jorge@ejemplo.test');
    expect(examBadge(jorge.page, 'c1')).toBe('Aprobada');
    expect(text(course(jorge.page, 'c1'))).toContain('Certificado pendiente de emisión.');
  }, 30_000);

  it('alumno sin cursos asignados: estado vacío claro', async () => {
    const { page } = await openProgress('pedro@ejemplo.test', (s) => {
      s.enrollments = s.enrollments.filter((e) => e.userId !== 'u4');
    });
    expect(text(page)).toContain('Aún no tienes cursos asignados, por lo que no hay progreso que mostrar.');
    expect(page.querySelector('li[data-course]')).toBeNull();
    expect(page.querySelector('.summary')).toBeNull();
  }, 20_000);

  it('solo muestra los datos del alumno autenticado', async () => {
    const { page } = await openProgress('rosa@ejemplo.test');
    expect([...page.querySelectorAll('li[data-course]')].map((l) => l.getAttribute('data-course'))).toEqual(['c1']);
    expect(page.querySelector('[data-attempt]')).toBeNull(); // los intentos de Ana, Carla y Jorge no aparecen
    expect(text(page)).not.toContain('IMC-DEMO-0001');
  }, 20_000);
});

describe('Navegación y separación de «Mis certificados» (F4)', () => {
  it('el menú del alumno incluye «Mi progreso» y lo marca como página actual', async () => {
    const { root } = await openProgress('ana@ejemplo.test');
    const links = [...root.querySelectorAll<HTMLAnchorElement>('.top__nav a')];
    expect(links.map((a) => [text(a), a.getAttribute('href')])).toEqual([
      ['Mis cursos', '/panel'],
      ['Mi progreso', '/progreso'],
      ['Mis certificados', '/certificados'],
    ]);
    expect(links.map((a) => a.getAttribute('aria-current'))).toEqual([null, 'page', null]);
  }, 20_000);

  it('«Mi progreso» no lista ni descarga certificados y «Mis certificados» sigue siendo independiente', async () => {
    const { harness, page, router, root } = await openProgress('ana@ejemplo.test');
    expect(text(page)).not.toContain('Descargar');
    expect(page.querySelectorAll('a[href^="/certificados"]').length).toBe(1); // solo el enlace del curso aprobado

    await harness.navigateByUrl('/certificados');
    await until(harness, () => !!root.querySelector('app-my-certificates') && text(root).includes('IMC-DEMO-0001'));
    expect(router.url).toBe('/certificados');
    expect(root.querySelector('app-my-progress')).toBeNull();
    expect(text(root.querySelector('app-my-certificates'))).not.toContain('Avance');
  }, 20_000);

  it('sin sesión, /progreso lleva al inicio de sesión', async () => {
    const { harness, router } = await setup(null);
    await harness.navigateByUrl('/progreso');
    await until(harness, () => router.url === '/login');
    expect(router.url).toBe('/login');
  }, 20_000);

  it('un instructor no accede a «Mi progreso»', async () => {
    const { harness, router } = await setup('admin@ejemplo.test');
    await harness.navigateByUrl('/progreso');
    await until(harness, () => router.url === '/instructor');
    expect(harness.fixture.nativeElement.querySelector('app-my-progress')).toBeNull();
  }, 20_000);

  it('el enlace al curso respeta el guard de acceso del curso', async () => {
    const { harness, router, root } = await openProgress('rosa@ejemplo.test');
    root.querySelector<HTMLAnchorElement>('li[data-course="c1"] a[href="/cursos/c1"]')!.click();
    await until(harness, () => router.url === '/cursos/c1');
    // Un curso no asignado sigue bloqueado aunque se escriba la dirección.
    await harness.navigateByUrl('/cursos/c-ia');
    await until(harness, () => router.url.startsWith('/panel'));
    expect(router.url).toContain('aviso=sin-acceso');
  }, 20_000);
});
