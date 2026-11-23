import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { firstValueFrom } from 'rxjs';
import { AdminEvaluations } from './admin-evaluations';
import { DataRepository } from '../../core/services/data-repository';
import { MockDataRepository, STORAGE_KEY } from '../../core/services/mock-data-repository';
import { DemoState } from '../../core/data/demo-state';

/**
 * Etapa 2A (requisito 18) en la pantalla de evaluaciones: total acumulado frente a la nota máxima, mensajes de lo que
 * falta o sobra y rechazo de los cambios que descuadran la suma con el curso publicado. Repositorio simulado real,
 * localStorage aislado de la prueba. Datos ficticios.
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
const check = (ctx: Ctx) => text(ctx.el.querySelector('#score-check'));

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

function type(el: HTMLElement, selector: string, value: string): void {
  const input = el.querySelector<HTMLInputElement>(selector)!;
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Abre el borrador de una pregunta nueva de selección única con dos opciones y el puntaje indicado. */
async function newQuestion(ctx: Ctx, points: string): Promise<void> {
  button(ctx.el, 'Agregar pregunta').click();
  await until(ctx.harness, () => text(ctx.el.querySelector('#draft-title')) === 'Nueva pregunta');
  type(ctx.el, '#d-text', `Pregunta de ${points} puntos`);
  type(ctx.el, '#d-points', points);
  await ctx.harness.fixture.whenStable();
  while (ctx.el.querySelectorAll('.optrow').length > 2) {
    button(ctx.el.querySelectorAll('.optrow')[2], 'Quitar').click();
    await ctx.harness.fixture.whenStable();
  }
  type(ctx.el, '[aria-label="Texto de la opción 1"]', 'A');
  type(ctx.el, '[aria-label="Texto de la opción 2"]', 'B');
  ctx.el.querySelector<HTMLInputElement>('[aria-label="Marcar opción 1 como correcta"]')!.click();
  await ctx.harness.fixture.whenStable();
}

async function saveDraft(ctx: Ctx): Promise<void> {
  button(ctx.el, 'Guardar pregunta').click();
  await until(ctx.harness, () => !ctx.el.querySelector('#draft-title') || !!ctx.el.querySelector('#draft-title ~ .alert-danger'));
  await sleep(300);
  await ctx.harness.fixture.whenStable();
}

describe('AdminEvaluations: suma de puntajes = nota máxima (Etapa 2A)', () => {
  it('en borrador muestra el total frente a la nota máxima y lo actualiza al agregar, editar y eliminar', async () => {
    const ctx = await setup('/admin/evaluaciones?curso=c-ia');
    expect(check(ctx)).toContain('La suma de los puntajes es 0. Debe ser exactamente 100 (faltan 100 puntos).');

    await newQuestion(ctx, '60');
    expect(text(ctx.el.querySelector('#d-points-total'))).toBe('Con esta pregunta, el total será 60 de 100.');
    await saveDraft(ctx);
    expect(check(ctx)).toContain('La suma de los puntajes es 60. Debe ser exactamente 100 (faltan 40 puntos).');
    expect(check(ctx)).toContain('no podrá publicarse ni rendirse hasta que la suma sea exacta');
    expect(text(ctx.el)).toContain('Puntaje total: 60 de 100.');

    await newQuestion(ctx, '50');
    await saveDraft(ctx); // en borrador se acepta aunque sobre
    expect(check(ctx)).toContain('La suma de los puntajes es 110. Debe ser exactamente 100 (sobran 10 puntos).');

    button(ctx.el, 'Editar pregunta 2').click();
    await until(ctx.harness, () => text(ctx.el.querySelector('#draft-title')) === 'Editar pregunta');
    type(ctx.el, '#d-points', '40');
    await ctx.harness.fixture.whenStable();
    expect(text(ctx.el.querySelector('#d-points-total'))).toBe('Con esta pregunta, el total será 100 de 100.');
    await saveDraft(ctx);
    expect(check(ctx)).toBe('La distribución de puntajes es correcta. Puedes guardar la evaluación.');
    expect(ctx.el.querySelector('#score-check')!.classList).toContain('alert-success');

    button(ctx.el, 'Eliminar pregunta 1').click();
    await ctx.harness.fixture.whenStable();
    button(ctx.el, 'Confirmar').click();
    await until(ctx.harness, () => check(ctx).includes('La suma de los puntajes es 40.'));
    expect(check(ctx)).toContain('(faltan 60 puntos)');
    expect(ctx.el.querySelector('#score-check')!.classList).toContain('alert-warning');
  }, 60_000);

  it('la ayuda de la escala indica cuánto deben sumar los puntajes', async () => {
    const ctx = await setup('/admin/evaluaciones?curso=c1', (s) => (s.attempts = []));
    expect(text(ctx.el.querySelector('#e-scale-help'))).toContain('Con esta escala, los puntajes deben sumar 100 (hoy suman 100).');
    const scale = ctx.el.querySelector<HTMLSelectElement>('#e-scale')!;
    scale.value = scale.options[1].value; // Sobre 20
    scale.dispatchEvent(new Event('change'));
    await ctx.harness.fixture.whenStable();
    expect(text(ctx.el.querySelector('#e-scale-help'))).toContain('Con esta escala, los puntajes deben sumar 20 (hoy suman 100).');
  }, 30_000);

  it('con el curso publicado rechaza agregar una pregunta o cambiar la escala si la suma deja de coincidir', async () => {
    const ctx = await setup('/admin/evaluaciones?curso=c1', (s) => (s.attempts = []));
    const before = await firstValueFrom(ctx.repo.getExamQuestions('c1-e1'));
    expect(check(ctx)).toBe('La distribución de puntajes es correcta. Puedes guardar la evaluación.');

    await newQuestion(ctx, '10');
    expect(text(ctx.el.querySelector('#d-points-total'))).toBe('Con esta pregunta, el total será 110 de 100.');
    await saveDraft(ctx);
    expect(text(ctx.el.querySelector('#draft-title ~ .alert-danger'))).toContain(
      'La suma de los puntajes es 110. Debe ser exactamente 100 (sobran 10 puntos).',
    );
    expect(await firstValueFrom(ctx.repo.getExamQuestions('c1-e1'))).toEqual(before);
    button(ctx.el, 'Cancelar').click();
    await ctx.harness.fixture.whenStable();

    const scale = ctx.el.querySelector<HTMLSelectElement>('#e-scale')!;
    scale.value = scale.options[1].value; // Sobre 20
    scale.dispatchEvent(new Event('change'));
    type(ctx.el, '#e-pass', '11');
    await ctx.harness.fixture.whenStable();
    button(ctx.el, 'Guardar configuración').click();
    await until(ctx.harness, () => text(ctx.el).includes('No se pudo completar la operación'));
    expect(text(ctx.el)).toContain('No se pudo completar la operación: No se puede guardar este cambio con el curso publicado.');
    expect(text(ctx.el)).toContain('Debe ser exactamente 20 (sobran 80 puntos)');
    expect(await firstValueFrom(ctx.repo.getActiveExam('c1'))).toMatchObject({ scaleMax: 100, passScore: 60 });
  }, 60_000);

  it('una evaluación con intentos y la suma descuadrada solo informa: se conserva como está (RN-15)', async () => {
    const ctx = await setup('/admin/evaluaciones?curso=c1', (s) => (s.questions.find((q) => q.id === 'q1')!.points = 30));
    expect(check(ctx)).toContain('La suma de los puntajes es 120. Debe ser exactamente 100 (sobran 20 puntos).');
    expect(check(ctx)).toContain('RN-15');
    expect((await firstValueFrom(ctx.repo.listAttempts())).map((a) => a.score)).toEqual([80, 50, 90]);
  }, 30_000);
});
