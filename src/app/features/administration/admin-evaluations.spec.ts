import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { firstValueFrom } from 'rxjs';
import { AdminEvaluations } from './admin-evaluations';
import { DataRepository } from '../../core/services/data-repository';
import { MockDataRepository, STORAGE_KEY } from '../../core/services/mock-data-repository';
import { DemoState } from '../../core/data/demo-state';

/**
 * E5.4: evaluaciones por curso con el repositorio simulado real y el router real (?curso=).
 * Los estados especiales se preparan solo en el localStorage aislado de la prueba. Datos ficticios.
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
const rowIds = (el: HTMLElement) => [...el.querySelectorAll('tbody tr')].map((r) => r.getAttribute('data-question'));
const button = (scope: Element, label: string) =>
  [...scope.querySelectorAll<HTMLButtonElement>('button')].find((b) => text(b) === label || b.getAttribute('aria-label') === label)!;

/** Guarda la semilla en el localStorage de la prueba y aplica un cambio antes de crear el repositorio. */
function prepareStorage(edit: (s: DemoState) => void): void {
  new MockDataRepository().resetDemo();
  const s: DemoState = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
  edit(s);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

async function setup(url = '/admin/evaluaciones', edit?: (s: DemoState) => void): Promise<Ctx> {
  localStorage.clear();
  sessionStorage.clear();
  if (edit) prepareStorage(edit);
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
  await until(harness, () => !!el.querySelector('#exam-state-title') || text(el).includes('no tiene una evaluación activa'));
  return { harness, el, repo };
}

function type(el: HTMLElement, selector: string, value: string): void {
  const input = el.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!;
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

async function selectCourse(ctx: Ctx, courseId: string): Promise<void> {
  const select = ctx.el.querySelector<HTMLSelectElement>('#admin-course-select')!;
  select.value = courseId;
  select.dispatchEvent(new Event('change'));
  await until(ctx.harness, () => TestBed.inject(Router).url.endsWith(`curso=${courseId}`) && !text(ctx.el).includes('Cargando'));
  await sleep(300);
  await ctx.harness.fixture.whenStable();
}

/** Completa el borrador de una pregunta de selección única con dos opciones. */
async function fillDraft(ctx: Ctx, data: { text?: string; options?: [string, string]; correct?: 1 | 2 | null; points?: string }): Promise<void> {
  if (data.text !== undefined) type(ctx.el, '#d-text', data.text);
  if (data.points !== undefined) type(ctx.el, '#d-points', data.points);
  await ctx.harness.fixture.whenStable();
  if (data.options) {
    // Deja solo dos opciones para simplificar.
    while (ctx.el.querySelectorAll('.optrow').length > 2) {
      button(ctx.el.querySelectorAll('.optrow')[2], 'Quitar').click();
      await ctx.harness.fixture.whenStable();
    }
    type(ctx.el, '[aria-label="Texto de la opción 1"]', data.options[0]);
    type(ctx.el, '[aria-label="Texto de la opción 2"]', data.options[1]);
  }
  if (data.correct) ctx.el.querySelector<HTMLInputElement>(`[aria-label="Marcar opción ${data.correct} como correcta"]`)!.click();
  await ctx.harness.fixture.whenStable();
}

async function saveDraft(ctx: Ctx): Promise<void> {
  button(ctx.el, 'Guardar pregunta').click();
  await until(ctx.harness, () => !ctx.el.querySelector('#draft-title') || !!ctx.el.querySelector('#draft-title ~ .alert-danger'));
  await sleep(300); // recarga de requisitos tras guardar
  await ctx.harness.fixture.whenStable();
}

async function questionsOf(repo: DataRepository, examId: string) {
  return firstValueFrom(repo.getExamQuestions(examId));
}

/** Intentos, certificados y exámenes de los cursos indicados, para comprobar que no cambian. */
async function snapshot(repo: DataRepository, examIds: string[]) {
  const out: Record<string, unknown> = {
    attempts: await firstValueFrom(repo.listAttempts()),
    certificates: await firstValueFrom(repo.listCertificates()),
    enrollments: await firstValueFrom(repo.listEnrollments()),
  };
  for (const id of examIds) out[id] = await questionsOf(repo, id);
  for (const c of ['c1', 'c-ia', 'c-mkt']) out[`exam-${c}`] = await firstValueFrom(repo.getActiveExam(c));
  return out;
}

describe('AdminEvaluations (E5.4)', () => {
  it('muestra el selector y, por defecto, la evaluación de c1 con sus preguntas y su configuración', async () => {
    const { el } = await setup();
    expect([...el.querySelectorAll('#admin-course-select option')].map(text)).toEqual([
      'Curso de demostración (nombre provisional) · Publicado',
      'Introducción a la Inteligencia Artificial · Borrador',
      'Fundamentos del Marketing Digital · Borrador',
    ]);
    expect(rowIds(el).length).toBe(10);
    expect(text(el.querySelector('[role=status].alert'))).toContain('Evaluación habilitada');
    expect(el.querySelector<HTMLInputElement>('#e-time')!.value).toBe('20');
    expect(el.querySelector<HTMLInputElement>('#e-pass')!.value).toBe('60');
    // Intentos: valor fijo, sin campo editable.
    expect(text(el.querySelector('#e-att'))).toBe('1');
    expect(el.querySelector('input#e-att')).toBeNull();
    expect(text(el)).toContain('un solo intento por alumno en cada examen. No es configurable.');
  }, 20_000);

  it('cambia de curso: carga la evaluación del curso elegido y la refleja en ?curso=', async () => {
    const ctx = await setup();
    await selectCourse(ctx, 'c-ia');
    expect(rowIds(ctx.el)).toEqual([]);
    expect(text(ctx.el)).toContain('Esta evaluación aún no tiene preguntas.');
    expect(text(ctx.el)).toContain('Sin preguntas: los participantes no pueden rendir esta evaluación.');
    expect(TestBed.inject(Router).url).toBe('/admin/evaluaciones?curso=c-ia');
    await selectCourse(ctx, 'c1');
    expect(rowIds(ctx.el).length).toBe(10);
  }, 30_000);

  it('abre directamente el curso indicado en ?curso=', async () => {
    const { el } = await setup('/admin/evaluaciones?curso=c-mkt');
    expect(el.querySelector<HTMLSelectElement>('#admin-course-select')!.value).toBe('c-mkt');
    expect(rowIds(el)).toEqual([]);
  }, 20_000);

  it('con un ?curso= inexistente avisa y muestra el curso principal', async () => {
    const { el } = await setup('/admin/evaluaciones?curso=no-existe');
    expect(text(el)).toContain('No se encontró el curso indicado');
    expect(rowIds(el).length).toBe(10);
  }, 20_000);

  it('crea, edita y elimina una pregunta solo en el curso seleccionado', async () => {
    const ctx = await setup('/admin/evaluaciones?curso=c-ia');
    const before = await snapshot(ctx.repo, ['c1-e1', 'c-mkt-e1']);

    button(ctx.el, 'Agregar pregunta').click();
    await until(ctx.harness, () => text(ctx.el.querySelector('#draft-title')) === 'Nueva pregunta');
    await fillDraft(ctx, { text: 'Pregunta de prueba 1', options: ['Opción A', 'Opción B'], correct: 2, points: '5' });
    await saveDraft(ctx);
    let list = await questionsOf(ctx.repo, 'c-ia-e1');
    expect(list.map((q) => [q.text, q.correct, q.points, q.options.length])).toEqual([['Pregunta de prueba 1', ['b'], 5, 2]]);
    expect(rowIds(ctx.el)).toEqual([list[0].id]);
    expect(text(ctx.el)).toContain('El curso está en borrador');

    button(ctx.el, 'Editar pregunta 1').click();
    await until(ctx.harness, () => text(ctx.el.querySelector('#draft-title')) === 'Editar pregunta');
    await fillDraft(ctx, { text: 'Pregunta de prueba editada' });
    await saveDraft(ctx);
    list = await questionsOf(ctx.repo, 'c-ia-e1');
    expect(list.map((q) => q.text)).toEqual(['Pregunta de prueba editada']);

    button(ctx.el, 'Eliminar pregunta 1').click();
    await ctx.harness.fixture.whenStable();
    button(ctx.el, 'Confirmar').click();
    await until(ctx.harness, () => rowIds(ctx.el).length === 0);
    expect(await questionsOf(ctx.repo, 'c-ia-e1')).toEqual([]);

    expect(await snapshot(ctx.repo, ['c1-e1', 'c-mkt-e1'])).toEqual(before);
  }, 40_000);

  it('valida la pregunta y muestra el motivo sin guardar', async () => {
    const ctx = await setup('/admin/evaluaciones?curso=c-ia');
    button(ctx.el, 'Agregar pregunta').click();
    await until(ctx.harness, () => !!ctx.el.querySelector('#draft-title'));
    const cases: [Parameters<typeof fillDraft>[1], string][] = [
      [{ text: ' ', options: ['A', 'B'], correct: 1 }, 'Escribe el enunciado de la pregunta.'],
      [{ text: 'Enunciado', options: ['A', ' '], correct: 1 }, 'Completa el texto de todas las opciones (mínimo 2).'],
      [{ text: 'Enunciado', options: ['A', 'B'], correct: 1, points: '0' }, 'El puntaje debe ser mayor que 0.'],
    ];
    for (const [data, msg] of cases) {
      await fillDraft(ctx, data);
      await saveDraft(ctx);
      expect(text(ctx.el.querySelector('#draft-title ~ .alert-danger'))).toBe(msg);
    }
    expect(await questionsOf(ctx.repo, 'c-ia-e1')).toEqual([]);
  }, 30_000);

  it('exige marcar la respuesta correcta', async () => {
    const ctx = await setup('/admin/evaluaciones?curso=c-mkt');
    button(ctx.el, 'Agregar pregunta').click();
    await until(ctx.harness, () => !!ctx.el.querySelector('#draft-title'));
    await fillDraft(ctx, { text: 'Sin respuesta correcta', options: ['A', 'B'], correct: null, points: '5' });
    await saveDraft(ctx);
    expect(text(ctx.el.querySelector('#draft-title ~ .alert-danger'))).toBe('Marca la respuesta correcta.');
    expect(await questionsOf(ctx.repo, 'c-mkt-e1')).toEqual([]);
  }, 30_000);

  it('editar una pregunta de c1 no cambia las demás ni los intentos y certificados', async () => {
    // RN-15: c1 tiene intentos en la semilla y no se puede editar; aquí se prueba sin intentos (certificados intactos).
    const ctx = await setup('/admin/evaluaciones', (s) => (s.attempts = []));
    const before = await snapshot(ctx.repo, ['c-ia-e1', 'c-mkt-e1']);
    const c1Before = await questionsOf(ctx.repo, 'c1-e1');
    button(ctx.el, 'Editar pregunta 1').click();
    await until(ctx.harness, () => text(ctx.el.querySelector('#draft-title')) === 'Editar pregunta');
    await fillDraft(ctx, { text: '¿Cuál es la capital del Perú? (editada)' });
    await saveDraft(ctx);
    const c1After = await questionsOf(ctx.repo, 'c1-e1');
    expect(c1After[0]).toEqual({ ...c1Before[0], text: '¿Cuál es la capital del Perú? (editada)' });
    expect(c1After.slice(1)).toEqual(c1Before.slice(1));
    expect(await snapshot(ctx.repo, ['c-ia-e1', 'c-mkt-e1'])).toEqual(before);
  }, 30_000);

  it('la configuración se guarda en el examen del curso; las reglas de aprobación de c1 no cambian', async () => {
    const ctx = await setup('/admin/evaluaciones?curso=c-ia');
    const c1Exam = await firstValueFrom(ctx.repo.getExamConfig());
    const before = await snapshot(ctx.repo, ['c1-e1']);

    // El repositorio rechaza una nota mínima mayor que la escala.
    const scale = ctx.el.querySelector<HTMLSelectElement>('#e-scale')!;
    scale.value = scale.options[1].value; // Sobre 20
    scale.dispatchEvent(new Event('change'));
    type(ctx.el, '#e-pass', '30');
    await ctx.harness.fixture.whenStable();
    button(ctx.el, 'Guardar configuración').click();
    await until(ctx.harness, () => !!ctx.el.querySelector('.alert-danger'));
    expect(text(ctx.el.querySelector('.alert-danger'))).toBe('No se pudo completar la operación: La nota mínima debe estar entre 0 y 20.');

    type(ctx.el, '#e-pass', '11');
    await ctx.harness.fixture.whenStable();
    button(ctx.el, 'Guardar configuración').click();
    await until(ctx.harness, () => text(ctx.el).includes('Configuración guardada'));
    expect(await firstValueFrom(ctx.repo.getActiveExam('c-ia'))).toMatchObject({ scaleMax: 20, passScore: 11, maxAttempts: 1, timeMinutes: 20 });
    expect(await firstValueFrom(ctx.repo.getExamConfig())).toEqual(c1Exam);
    const after = await snapshot(ctx.repo, ['c1-e1']);
    expect({ ...after, 'exam-c-ia': null }).toEqual({ ...before, 'exam-c-ia': null });
  }, 30_000);

  it('muestra el rechazo del repositorio al eliminar la última pregunta de un curso publicado', async () => {
    const ctx = await setup('/admin/evaluaciones', (s) => {
      s.questions = s.questions.filter((q) => q.examId !== 'c1-e1' || q.id === 'q1');
      s.attempts = []; // RN-15: sin intentos, para que el motivo del rechazo sea la pregunta mínima
    });
    expect(rowIds(ctx.el)).toEqual(['q1']);
    button(ctx.el, 'Eliminar pregunta 1').click();
    await ctx.harness.fixture.whenStable();
    button(ctx.el, 'Confirmar').click();
    await until(ctx.harness, () => !!ctx.el.querySelector('.alert-danger'));
    expect(text(ctx.el.querySelector('.alert-danger'))).toBe('No se pudo completar la operación: El examen necesita al menos una pregunta.');
    expect((await questionsOf(ctx.repo, 'c1-e1')).map((q) => q.id)).toEqual(['q1']);
  }, 30_000);

  it('un curso sin evaluación activa lo informa, no ofrece editarla y ofrece crearla', async () => {
    const ctx = await setup('/admin/evaluaciones?curso=c-mkt', (s) => {
      s.exams = s.exams.filter((e) => e.courseId !== 'c-mkt');
    });
    expect(text(ctx.el)).toContain('Este curso no tiene una evaluación activa.');
    expect(text(ctx.el)).toContain('20 minutos, sobre 100, nota mínima 60, 1 intento por alumno');
    expect(ctx.el.querySelector('#e-time')).toBeNull();
    expect(button(ctx.el, 'Agregar pregunta')).toBeUndefined();
    expect(button(ctx.el, 'Crear evaluación')).toBeDefined();
    // Los demás cursos siguen con su evaluación, sin botón de crear.
    await selectCourse(ctx, 'c1');
    expect(rowIds(ctx.el).length).toBe(10);
    expect(button(ctx.el, 'Crear evaluación')).toBeUndefined();
  }, 30_000);

  it('crea la evaluación del curso seleccionado y permite agregarle preguntas', async () => {
    const ctx = await setup('/admin/evaluaciones?curso=c-mkt', (s) => {
      s.exams = s.exams.filter((e) => e.courseId !== 'c-mkt');
    });
    const before = await snapshot(ctx.repo, ['c1-e1', 'c-ia-e1']);
    button(ctx.el, 'Crear evaluación').click();
    await until(ctx.harness, () => !!ctx.el.querySelector('#exam-state-title'));
    expect(text(ctx.el)).toContain('Evaluación creada');
    expect(text(ctx.el)).toContain('Sin preguntas: los participantes no pueden rendir esta evaluación.');
    expect(ctx.el.querySelector<HTMLInputElement>('#e-time')!.value).toBe('20');
    expect(await firstValueFrom(ctx.repo.getActiveExam('c-mkt'))).toMatchObject({ id: 'c-mkt-e1', active: true });

    button(ctx.el, 'Agregar pregunta').click();
    await until(ctx.harness, () => !!ctx.el.querySelector('#draft-title'));
    await fillDraft(ctx, { text: 'Primera pregunta de Marketing', options: ['A', 'B'], correct: 1, points: '10' });
    await saveDraft(ctx);
    expect((await questionsOf(ctx.repo, 'c-mkt-e1')).map((q) => q.text)).toEqual(['Primera pregunta de Marketing']);

    const after = await snapshot(ctx.repo, ['c1-e1', 'c-ia-e1']);
    expect({ ...after, 'exam-c-mkt': null }).toEqual({ ...before, 'exam-c-mkt': null });
  }, 30_000);

  it('si la evaluación ya fue creada por otra vía, muestra el rechazo y no la duplica', async () => {
    const ctx = await setup('/admin/evaluaciones?curso=c-mkt', (s) => {
      s.exams = s.exams.filter((e) => e.courseId !== 'c-mkt');
    });
    await firstValueFrom(ctx.repo.createCourseExam('c-mkt')); // otra pestaña, por ejemplo
    button(ctx.el, 'Crear evaluación').click();
    await until(ctx.harness, () => !!ctx.el.querySelector('.alert-danger'));
    expect(text(ctx.el.querySelector('.alert-danger'))).toBe('No se pudo completar la operación: El curso ya tiene una evaluación activa.');
    await until(ctx.harness, () => !!ctx.el.querySelector('#exam-state-title'));
    expect((await firstValueFrom(ctx.repo.getExams('c-mkt'))).length).toBe(1);
  }, 30_000);
});
