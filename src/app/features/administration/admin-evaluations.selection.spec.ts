import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { firstValueFrom } from 'rxjs';
import { AdminEvaluations } from './admin-evaluations';
import { DataRepository } from '../../core/services/data-repository';
import { MockDataRepository, STORAGE_KEY } from '../../core/services/mock-data-repository';
import { DemoState } from '../../core/data/demo-state';

/**
 * Etapa 2B, Bloque 1 (P1, P2): el instructor configura cuántas alternativas debe seleccionar el alumno en las
 * preguntas de selección múltiple. Repositorio simulado real, localStorage aislado. Datos ficticios.
 */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Ctx {
  harness: RouterTestingHarness;
  el: HTMLElement;
  repo: DataRepository;
}

async function until(harness: RouterTestingHarness, cond: () => boolean, timeout = 8000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    await harness.fixture.whenStable();
    if (cond()) return;
    await sleep(50);
  }
  throw new Error('La condición no se cumplió a tiempo');
}

const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const button = (scope: Element, label: string) =>
  [...scope.querySelectorAll<HTMLButtonElement>('button')].find((b) => text(b) === label || b.getAttribute('aria-label') === label)!;
const selectInput = (ctx: Ctx) => ctx.el.querySelector<HTMLInputElement>('#d-select');

async function setup(url: string, edit?: (s: DemoState) => void): Promise<Ctx> {
  localStorage.clear();
  sessionStorage.clear();
  if (edit) {
    new MockDataRepository().resetDemo();
    const s: DemoState = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    edit(s);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  }
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: 'admin/evaluaciones', component: AdminEvaluations }], withComponentInputBinding()),
      { provide: DataRepository, useClass: MockDataRepository },
    ],
  });
  const repo = TestBed.inject(DataRepository);
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url, AdminEvaluations);
  const el = harness.routeNativeElement as HTMLElement;
  await until(harness, () => !!el.querySelector('#exam-state-title'));
  return { harness, el, repo };
}

async function type(ctx: Ctx, selector: string, value: string): Promise<void> {
  const input = ctx.el.querySelector<HTMLInputElement>(selector)!;
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await ctx.harness.fixture.whenStable();
}

async function toggleCorrect(ctx: Ctx, n: number): Promise<void> {
  ctx.el.querySelector<HTMLInputElement>(`[aria-label="Marcar opción ${n} como correcta"]`)!.click();
  await ctx.harness.fixture.whenStable();
}

/** Borrador nuevo de selección múltiple con 4 opciones escritas. */
async function newMultiple(ctx: Ctx): Promise<void> {
  button(ctx.el, 'Agregar pregunta').click();
  await until(ctx.harness, () => !!ctx.el.querySelector('#draft-title'));
  const kind = ctx.el.querySelector<HTMLSelectElement>('#d-type')!;
  kind.value = 'multiple';
  kind.dispatchEvent(new Event('change'));
  await ctx.harness.fixture.whenStable();
  await type(ctx, '#d-text', 'Selecciona las correctas');
  for (let i = 1; i <= 4; i++) await type(ctx, `[aria-label="Texto de la opción ${i}"]`, `Opción ${i}`);
}

async function saveDraft(ctx: Ctx): Promise<void> {
  button(ctx.el, 'Guardar pregunta').click();
  await until(ctx.harness, () => !ctx.el.querySelector('#draft-title') || !!ctx.el.querySelector('#draft-title ~ .alert-danger'));
  await sleep(300);
  await ctx.harness.fixture.whenStable();
}

describe('AdminEvaluations: alternativas que debe seleccionar el alumno (Etapa 2B)', () => {
  it('la cantidad sigue a las correctas marcadas hasta que el instructor la cambia, y se guarda', async () => {
    const ctx = await setup('/admin/evaluaciones?curso=c-ia');
    await newMultiple(ctx);
    expect(selectInput(ctx)).not.toBeNull();
    await toggleCorrect(ctx, 1);
    await toggleCorrect(ctx, 2);
    expect(selectInput(ctx)!.value).toBe('2');
    expect(text(ctx.el.querySelector('#d-select-help'))).toContain('Cada respuesta correcta marcada vale 5 puntos');
    await toggleCorrect(ctx, 3);
    expect(selectInput(ctx)!.value).toBe('3');
    await toggleCorrect(ctx, 3);
    expect(selectInput(ctx)!.value).toBe('2');

    await type(ctx, '#d-select', '3'); // cambio manual: ya no sigue a las correctas
    await toggleCorrect(ctx, 2);
    await toggleCorrect(ctx, 2);
    expect(selectInput(ctx)!.value).toBe('3');
    expect(ctx.el.querySelector('.select-error')).toBeNull();

    await saveDraft(ctx);
    const saved = (await firstValueFrom(ctx.repo.getExamQuestions('c-ia-e1'))).at(-1)!;
    expect(saved).toMatchObject({ type: 'multiple', correct: ['a', 'b'], selectCount: 3 });
    expect(text(ctx.el.querySelector(`tr[data-question="${saved.id}"] [data-label="Tipo"]`))).toBe('Selección múltiple (elegir 3)');
  }, 40_000);

  it('indica y rechaza una cantidad fuera del rango, sin guardar', async () => {
    const ctx = await setup('/admin/evaluaciones?curso=c-ia');
    await newMultiple(ctx);
    await toggleCorrect(ctx, 1);
    await toggleCorrect(ctx, 2);
    await type(ctx, '#d-select', '4');
    const message = 'La cantidad de alternativas a seleccionar debe ser menor que el total de alternativas (4).';
    expect(text(ctx.el.querySelector('.select-error'))).toBe(message);
    expect(selectInput(ctx)!.getAttribute('aria-invalid')).toBe('true');
    await saveDraft(ctx);
    expect(text(ctx.el.querySelector('#draft-title ~ .alert-danger'))).toBe(message);

    await type(ctx, '#d-select', '1');
    expect(text(ctx.el.querySelector('.select-error'))).toContain('no puede ser menor que la cantidad de respuestas correctas (2)');
    expect(await firstValueFrom(ctx.repo.getExamQuestions('c-ia-e1'))).toEqual([]);
  }, 40_000);

  it('el campo solo aparece en selección múltiple', async () => {
    const ctx = await setup('/admin/evaluaciones?curso=c-ia');
    button(ctx.el, 'Agregar pregunta').click();
    await until(ctx.harness, () => !!ctx.el.querySelector('#draft-title'));
    expect(selectInput(ctx)).toBeNull(); // selección única por defecto
    await newMultiple(ctx);
    expect(selectInput(ctx)).not.toBeNull();
  }, 30_000);

  it('una pregunta anterior a la 2B (sin cantidad guardada) muestra tantas como correctas', async () => {
    const ctx = await setup('/admin/evaluaciones?curso=c1', (s) => {
      s.attempts = [];
      s.courses.find((c) => c.id === 'c1')!.status = 'borrador';
    });
    expect(text(ctx.el.querySelector('tr[data-question="q6"] [data-label="Tipo"]'))).toBe('Selección múltiple (elegir 3)');
    button(ctx.el, 'Editar pregunta 6').click();
    await until(ctx.harness, () => text(ctx.el.querySelector('#draft-title')) === 'Editar pregunta');
    expect(selectInput(ctx)!.value).toBe('3');
    await toggleCorrect(ctx, 2); // marca una cuarta correcta: sigue a las correctas
    expect(selectInput(ctx)!.value).toBe('4');
  }, 30_000);
});
