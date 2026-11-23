import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { firstValueFrom } from 'rxjs';
import { Exam } from './exam/exam';
import { ExamInstructions } from './instructions/instructions';
import { ExamResult } from './result/result';
import { MyProgress } from '../progress/my-progress';
import { CourseRoom } from '../courses/course-room';
import { Panel } from '../dashboard/panel';
import { AdminResults } from '../administration/admin-results';
import { AuthService } from '../../core/services/auth.service';
import { DataRepository } from '../../core/services/data-repository';
import { MockDataRepository, STORAGE_KEY } from '../../core/services/mock-data-repository';
import { DEMO_CONFIG } from '../../core/config/demo.config';
import { DemoState } from '../../core/data/demo-state';
import { Attempt } from '../../core/models/exam.model';
import { Recovery } from '../../core/models/recovery.model';

/**
 * R6: las seis vistas del estudiante (Instrucciones, Examen, Resultado, Mi progreso, Aula y Panel) reflejan la
 * recuperación y muestran una sola nota final vigente. Carla (u3) desaprobó el regular con 50/100; Ana (u1) aprobó
 * sin recuperación con 80/100. Repositorio simulado real; datos ficticios.
 */
const MIN = 60_000;
const H = 60 * MIN;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const stored = (): DemoState => JSON.parse(localStorage.getItem(STORAGE_KEY)!);
/** Fecha y hora de Lima como la muestran las pantallas («12/11/2026 09:00»). */
const lima = (ms: number) => {
  const d = new Date(ms - 5 * H);
  const two = (n: number) => String(n).padStart(2, '0');
  return `${two(d.getUTCDate())}/${two(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${two(d.getUTCHours())}:${two(d.getUTCMinutes())}`;
};

async function until(harness: RouterTestingHarness, cond: () => boolean, timeout = 8000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    await harness.fixture.whenStable();
    if (cond()) return;
    await sleep(50);
  }
  throw new Error('La condición no se cumplió a tiempo');
}

const recovery = (over: Partial<Recovery> = {}): Recovery => ({
  id: 'rec-1',
  userId: 'u3',
  courseId: 'c1',
  regularExamId: 'c1-e1',
  examId: 'c1-e1',
  reason: 'desaprobado',
  mode: 'original',
  opensAt: new Date(Date.now() - H).toISOString(),
  closesAt: new Date(Date.now() + 2 * H).toISOString(),
  authorizedBy: 'a1',
  authorizedAt: new Date(Date.now() - 2 * H).toISOString(),
  ...over,
});

/** Estado con la recuperación de Carla (y, si se indica, su intento ya entregado, como lo deja el repositorio). */
function prepare(rec?: Partial<Recovery>, attempt?: Partial<Attempt>, status?: 'aprobado' | 'desaprobado' | 'en_revision'): void {
  localStorage.clear();
  sessionStorage.clear();
  new MockDataRepository().resetDemo();
  const s = stored();
  if (rec) s.recoveries.push(recovery(rec));
  if (attempt) {
    const regular = s.attempts.find((a) => a.id === 'att2')!;
    s.attempts.push({ ...regular, id: 'att-rec', kind: 'recuperacion', recoveryId: 'rec-1', date: new Date().toISOString(), gradingRule: 'proporcional', ...attempt });
    s.recoveries[0].attemptId = 'att-rec';
    s.recoveries[0].startedAt = new Date(Date.now() - 30 * MIN).toISOString();
  }
  if (status) s.enrollments.find((e) => e.userId === 'u3' && e.courseId === 'c1')!.status = status;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

async function setup(email = 'carla@ejemplo.test') {
  TestBed.configureTestingModule({
    providers: [
      provideRouter(
        [
          { path: 'panel', component: Panel },
          { path: 'progreso', component: MyProgress },
          { path: 'cursos/:courseId', component: CourseRoom },
          { path: 'cursos/:courseId/examen', component: ExamInstructions },
          { path: 'cursos/:courseId/examen/rendir', component: Exam },
          { path: 'cursos/:courseId/examen/resultado', component: ExamResult },
          { path: 'admin/resultados', component: AdminResults },
        ],
        withComponentInputBinding(),
      ),
      { provide: DataRepository, useClass: MockDataRepository },
    ],
  });
  await firstValueFrom(TestBed.inject(AuthService).login(email, DEMO_CONFIG.demoPassword));
  const harness = await RouterTestingHarness.create();
  const el = () => harness.fixture.nativeElement as HTMLElement;
  const go = async (url: string, ready: (root: HTMLElement) => boolean) => {
    await harness.navigateByUrl(url);
    await until(harness, () => ready(el()));
    return el();
  };
  const button = (label: string) => [...el().querySelectorAll<HTMLButtonElement>('button')].find((b) => text(b).includes(label));
  return { harness, el, go, button, router: TestBed.inject(Router) };
}

/** Lo que el estudiante ve de su resultado en Resultado, Mi progreso, Aula y Panel. */
async function studentViews(ctx: Awaited<ReturnType<typeof setup>>) {
  const result = await ctx.go('/cursos/c1/examen/resultado', (r) => !!r.querySelector('.n'));
  const resultText = text(result.querySelector('app-exam-result') ?? result);
  const progress = await ctx.go('/progreso', (r) => !!r.querySelector('[data-course="c1"] .exam-state'));
  const course = progress.querySelector('[data-course="c1"]')!;
  const progressText = { state: text(course.querySelector('.exam-state')), attempts: course.querySelectorAll('[data-attempt]').length, all: text(course) };
  const room = await ctx.go('/cursos/c1', (r) => !!r.querySelector('#exam-card-title'));
  const roomFinal = text(room.querySelector('[data-final]'));
  const panel = await ctx.go('/panel', (r) => !!r.querySelector('.course'));
  const panelBadge = text([...panel.querySelectorAll('.course')].find((c) => text(c).includes('Curso de demostración'))!.querySelector('app-status-badge'));
  return { resultText, progressText, roomFinal, panelBadge };
}

describe('R6: vistas del estudiante con recuperación', () => {
  it('sin recuperación: la nota del intento regular es la nota final en todas las vistas', async () => {
    prepare();
    const v = await studentViews(await setup('ana@ejemplo.test'));
    expect(v.resultText).toContain('80 / 100');
    expect(v.progressText).toMatchObject({ state: 'Aprobada', attempts: 1 });
    expect(v.progressText.all).toContain('Nota final80 / 100');
    expect(v.roomFinal).toBe('Nota final: 80 / 100 · Aprobado');
    expect(v.panelBadge).toBe('Aprobado');
  }, 40_000);

  it.each([
    ['aprobada', { score: 70, passed: true }, 'aprobado', 'Aprobada', 'Aprobado'],
    ['desaprobada (menor que la regular)', { score: 30, passed: false }, 'desaprobado', 'Desaprobada', 'Desaprobado'],
  ] as const)('recuperación %s: solo su nota como final, en todas las vistas', async (_l, attempt, status, progressState, badge) => {
    prepare({}, attempt, status);
    const v = await studentViews(await setup());
    const note = `${attempt.score} / 100`;
    expect(v.resultText).toContain('Nota final');
    expect(v.resultText).toContain(note);
    expect(v.progressText).toMatchObject({ state: progressState, attempts: 1 });
    expect(v.progressText.all).toContain(`Nota final${note}`);
    expect(v.roomFinal).toBe(`Nota final: ${note} · ${badge}`);
    expect(v.panelBadge).toBe(badge);
    for (const t of [v.resultText, v.progressText.all, v.roomFinal]) {
      expect(t).not.toContain('50 / 100'); // la nota regular reemplazada no se muestra
      expect(t).not.toMatch(/reemplaz/i);
    }
  }, 40_000);

  it('recuperación pendiente de calificación: sin nota definitiva en ninguna vista', async () => {
    prepare({}, { score: 0, passed: false, review: { status: 'en_revision', manualScores: {} } }, 'en_revision');
    const ctx = await setup();
    const result = await ctx.go('/cursos/c1/examen/resultado', (r) => !!r.querySelector('[data-review]'));
    expect(text(result.querySelector('[data-review] .n'))).toBe('Pendiente de calificación');
    const progress = await ctx.go('/progreso', (r) => !!r.querySelector('[data-course="c1"] .exam-state'));
    const course = progress.querySelector('[data-course="c1"]')!;
    expect(text(course.querySelector('.exam-state'))).toBe('Pendiente de calificación');
    expect(text(course.querySelector('app-status-badge'))).toBe('Pendiente de calificación');
    const room = await ctx.go('/cursos/c1', (r) => !!r.querySelector('[data-final]'));
    expect(text(room.querySelector('[data-final]'))).toBe('Nota final: Pendiente de calificación');
    const panel = await ctx.go('/panel', (r) => !!r.querySelector('.course'));
    expect(text(panel)).toContain('Pendiente de calificación');
    for (const t of [text(result), text(course), text(room.querySelector('[data-final]'))]) {
      expect(t).not.toContain('50 / 100');
      expect(t).not.toMatch(/Aprobado/);
    }
  }, 40_000);

  describe('Instrucciones y Examen de la recuperación', () => {
    it('antes de la apertura: muestra la ventana y no permite iniciar', async () => {
      const opens = Date.now() + 1 * H;
      const closes = Date.now() + 3 * H;
      prepare({ opensAt: new Date(opens).toISOString(), closesAt: new Date(closes).toISOString() });
      const ctx = await setup();
      const page = await ctx.go('/cursos/c1/examen', (r) => !!r.querySelector('[data-recovery]'));
      expect(text(page.querySelector('#recovery-title'))).toBe('Examen de recuperación');
      expect(text(page.querySelector('[data-window]'))).toContain(`desde el ${lima(opens)} hasta el ${lima(closes)} (hora de Lima)`);
      expect(text(page.querySelector('#blocked-title'))).toBe('La recuperación no está disponible');
      expect(text(page.querySelector('.blocked'))).toContain(`Tu recuperación estará disponible desde el ${lima(opens)}`);
      expect(ctx.button('Comenzar')).toBeUndefined();
      const room = await ctx.go('/cursos/c1', (r) => !!r.querySelector('[data-recovery-card]'));
      // 20/11/2026: tarjeta de la recuperación en el aula, con el botón deshabilitado hasta la apertura.
      const card = room.querySelector('[data-recovery-card]')!;
      expect(text(card)).toContain('Recuperación autorizada');
      expect(text(card)).toContain(`Apertura${lima(opens)}`);
      expect(text(card)).toContain(`Cierre${lima(closes)}`);
      expect(text(card)).toContain('Aún no abre');
      expect(card.querySelector<HTMLButtonElement>('button[data-test="take-recovery"]')!.disabled).toBe(true);
    }, 30_000);

    it('durante la ventana: inicia la recuperación; el examen la identifica, guarda respuestas y cuenta el tiempo', async () => {
      prepare({});
      const ctx = await setup();
      const room = await ctx.go('/cursos/c1', (r) => !!r.querySelector('[data-recovery-card]'));
      // 20/11/2026: «Recuperación disponible» con el curso, el examen original, la ventana y el botón habilitado.
      const card = room.querySelector('[data-recovery-card]')!;
      expect(text(card)).toContain('Recuperación disponible');
      expect(text(card)).toContain('Curso de demostración');
      expect(text(card)).toContain('(examen original)');
      expect(text(card.querySelector('a[data-test="take-recovery"]'))).toBe('Rendir examen de recuperación');
      expect(text(room.querySelector('[data-final]'))).toBe('Nota final: 50 / 100 · Desaprobado'); // aún vale la regular
      const page = await ctx.go('/cursos/c1/examen', (r) => !!r.querySelector('[data-recovery]') && !!r.querySelector('.start button'));
      expect(text(page.querySelector('.start button'))).toBe('Comenzar recuperación');
      ctx.button('Comenzar recuperación')!.click();
      await until(ctx.harness, () => ctx.router.url === '/cursos/c1/examen/rendir' && !!ctx.el().querySelector('.opts input'));
      await until(ctx.harness, () => text(ctx.el().querySelector('.bar__info h1')) === 'Examen de recuperación');
      expect(Number(text(ctx.el().querySelector('.timer strong')).split(':')[0])).toBeGreaterThanOrEqual(19);
      const start = stored().examStarts.find((s) => s.recoveryId === 'rec-1')!;
      expect(start).toMatchObject({ userId: 'u3', examId: 'c1-e1' });
      ctx.el().querySelectorAll<HTMLInputElement>('.opts input')[1].click();
      await until(ctx.harness, () => stored().examStarts.find((s) => s.recoveryId === 'rec-1')?.answers?.['q1']?.[0] === 'b');
      expect(stored().attempts.filter((a) => a.userId === 'u3').map((a) => a.id)).toEqual(['att2']); // sin intento nuevo aún
    }, 40_000);

    it('ya iniciada en otra pestaña: «Continuar recuperación» con el mismo tiempo y las respuestas guardadas', async () => {
      const startedAt = Date.now() - 6 * MIN;
      prepare({ startedAt: new Date(startedAt).toISOString() });
      const s = stored();
      s.examStarts.push({
        userId: 'u3', examId: 'c1-e1', recoveryId: 'rec-1', startedAt: new Date(startedAt).toISOString(),
        endsAt: new Date(startedAt + 20 * MIN).toISOString(), answers: { q1: ['b'] },
      });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
      const ctx = await setup();
      const page = await ctx.go('/cursos/c1/examen', (r) => !!r.querySelector('.start button'));
      expect(text(page.querySelector('.start button'))).toBe('Continuar recuperación');
      expect(text(page.querySelector('[data-recovery]'))).toContain('Ya iniciaste tu recuperación');
      ctx.button('Continuar recuperación')!.click();
      await until(ctx.harness, () => !!ctx.el().querySelector('.opts input'));
      expect(Number(text(ctx.el().querySelector('.timer strong')).split(':')[0])).toBeLessThanOrEqual(14); // no se reinicia
      expect(ctx.el().querySelectorAll<HTMLInputElement>('.opts input')[1].checked).toBe(true);
      expect(stored().examStarts.filter((x) => x.recoveryId === 'rec-1')).toHaveLength(1);
    }, 30_000);

    it('vencida sin iniciar: «No rindió», no se puede iniciar y la nota regular sigue siendo la final', async () => {
      prepare({ opensAt: new Date(Date.now() - 5 * H).toISOString(), closesAt: new Date(Date.now() - 1 * H).toISOString() });
      const ctx = await setup();
      const page = await ctx.go('/cursos/c1/examen', (r) => !!r.querySelector('[data-recovery]'));
      expect(text(page.querySelector('[data-recovery]'))).toContain('No iniciaste la recuperación dentro del plazo.');
      expect(text(page.querySelector('.blocked'))).toContain('El plazo de tu recuperación terminó sin que la iniciaras.');
      expect(ctx.button('Comenzar')).toBeUndefined();
      expect(stored().recoveries[0].noShowAt).toBeTruthy();
      const room = await ctx.go('/cursos/c1', (r) => !!r.querySelector('[data-final]'));
      expect(text(room.querySelector('[data-final]'))).toBe('Nota final: 50 / 100 · Desaprobado');
    }, 30_000);
  });

  it('el historial interno y la vista del Instructor conservan las tres referencias', async () => {
    prepare({}, { score: 30, passed: false }, 'desaprobado');
    const before = stored().attempts;
    const ctx = await setup();
    await studentViews(ctx);
    expect(stored().attempts).toEqual(before); // las vistas del estudiante no tocan el historial
    const admin = await ctx.go('/admin/resultados?curso=c1', (r) => !!r.querySelector('tr[data-row="u3|c1"]'));
    const row = admin.querySelector('tr[data-row="u3|c1"]')!;
    expect(text(row.querySelector('[data-label="Nota regular"]'))).toBe('50 / 100');
    expect(text(row.querySelector('[data-label="Recuperación"]'))).toBe('30 / 100');
    expect(text(row.querySelector('[data-label="Nota final"]'))).toBe('30 / 100');
  }, 40_000);
});
