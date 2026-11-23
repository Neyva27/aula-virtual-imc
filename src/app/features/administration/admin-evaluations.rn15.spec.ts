import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { firstValueFrom } from 'rxjs';
import { AdminEvaluations } from './admin-evaluations';
import { DataRepository } from '../../core/services/data-repository';
import { MockDataRepository, STORAGE_KEY } from '../../core/services/mock-data-repository';
import { DemoState } from '../../core/data/demo-state';
import { SEED_QUESTIONS } from '../../core/data/seed';
import { EXAM_LOCKED_MESSAGE } from '../../core/models/exam.model';

/**
 * RN-15 en la pantalla de Evaluaciones, con el repositorio simulado real y el router real (?curso=).
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

async function setup(url = '/admin/evaluaciones', edit?: (s: DemoState) => void) {
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
  await until(harness, () => !!el.querySelector('#exam-state-title') && !text(el).includes('Cargando'));
  const cmp = harness.routeDebugElement!.componentInstance as AdminEvaluations;
  return { harness, el, repo, cmp };
}

const button = (el: HTMLElement, label: string) =>
  [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => text(b) === label || b.getAttribute('aria-label') === label);
const allCorrect = () => Object.fromEntries(SEED_QUESTIONS.map((q) => [q.id, [...q.correct]]));

describe('Evaluaciones con intentos registrados (RN-15)', () => {
  it('informa el bloqueo de forma accesible y muestra la evaluación en solo lectura', async () => {
    const { el } = await setup('/admin/evaluaciones?curso=c1');
    const notice = el.querySelector('#exam-locked')!;
    expect(notice.getAttribute('role')).toBe('status');
    expect(text(notice)).toContain(`Edición bloqueada. ${EXAM_LOCKED_MESSAGE}`);
    expect(text(notice)).toContain('Hay 3 intentos registrados en esta evaluación.');
    expect(el.querySelector('form')!.getAttribute('aria-describedby')).toBe('exam-locked');
    // Configuración visible pero no editable, sin botón para guardar.
    for (const id of ['#e-time', '#e-scale', '#e-pass']) expect(el.querySelector<HTMLInputElement>(id)!.disabled).toBe(true);
    expect(el.querySelector<HTMLInputElement>('#e-time')!.value).toBe('20');
    expect(button(el, 'Guardar configuración')).toBeUndefined();
    expect(text(el)).toContain('Configuración de solo lectura: la evaluación tiene intentos registrados.');
    // Preguntas visibles, sin agregar, editar ni eliminar.
    expect(el.querySelectorAll('tr[data-question]').length).toBe(10);
    expect(button(el, 'Agregar pregunta')).toBeUndefined();
    expect(button(el, 'Editar pregunta 1')).toBeUndefined();
    expect(button(el, 'Eliminar pregunta 1')).toBeUndefined();
    expect(text(el.querySelector('tr[data-question="q1"] td.actions'))).toBe('Solo lectura');
  }, 20_000);

  it('una evaluación sin intentos sigue editable y sin aviso', async () => {
    const { harness, el, repo } = await setup('/admin/evaluaciones?curso=c-ia');
    expect(el.querySelector('#exam-locked')).toBeNull();
    expect(el.querySelector<HTMLInputElement>('#e-time')!.disabled).toBe(false);
    expect(button(el, 'Agregar pregunta')).toBeDefined();
    const time = el.querySelector<HTMLInputElement>('#e-time')!;
    time.value = '35';
    time.dispatchEvent(new Event('input', { bubbles: true }));
    button(el, 'Guardar configuración')!.click();
    await until(harness, () => text(el).includes('Configuración guardada (demostración).'));
    expect((await firstValueFrom(repo.getActiveExam('c-ia')))!.timeMinutes).toBe(35);
  }, 20_000);

  it('el repositorio rechaza los cambios aunque se invoquen sin la interfaz, y la pantalla lo explica', async () => {
    const { harness, el, repo, cmp } = await setup('/admin/evaluaciones?curso=c1');
    const before = {
      exam: await firstValueFrom(repo.getActiveExam('c1')),
      questions: await firstValueFrom(repo.getExamQuestions('c1-e1')),
      attempts: await firstValueFrom(repo.listAttempts()),
      certificates: await firstValueFrom(repo.listCertificates()),
    };
    cmp.saveConfig();
    await until(harness, () => !!el.querySelector('.alert-danger'));
    expect(text(el.querySelector('.alert-danger'))).toBe(`No se pudo completar la operación: ${EXAM_LOCKED_MESSAGE}`);
    cmp.remove({ ...SEED_QUESTIONS[0] });
    await sleep(400);
    await harness.fixture.whenStable();
    expect(text(el.querySelector('.alert-danger'))).toBe(`No se pudo completar la operación: ${EXAM_LOCKED_MESSAGE}`);
    expect({
      exam: await firstValueFrom(repo.getActiveExam('c1')),
      questions: await firstValueFrom(repo.getExamQuestions('c1-e1')),
      attempts: await firstValueFrom(repo.listAttempts()),
      certificates: await firstValueFrom(repo.listCertificates()),
    }).toEqual(before);
  }, 20_000);

  it('si alguien rinde mientras la pantalla está abierta, el cambio se rechaza y la evaluación pasa a solo lectura', async () => {
    // c1 sin intentos: al abrir la pantalla todavía es editable.
    const { harness, el, repo } = await setup('/admin/evaluaciones?curso=c1', (s) => (s.attempts = []));
    expect(el.querySelector('#exam-locked')).toBeNull();
    expect(button(el, 'Guardar configuración')).toBeDefined();
    // Rosa rinde el examen (otra pestaña, otro dispositivo…).
    await firstValueFrom(repo.submitExamAttempt('u5', 'c1-e1', allCorrect(), 90));
    button(el, 'Guardar configuración')!.click();
    await until(harness, () => !!el.querySelector('#exam-locked'));
    expect(text(el.querySelector('.alert-danger'))).toBe(`No se pudo completar la operación: ${EXAM_LOCKED_MESSAGE}`);
    expect(text(el.querySelector('#exam-locked'))).toContain('Hay 1 intento registrado en esta evaluación.');
    expect(button(el, 'Guardar configuración')).toBeUndefined();
    expect(button(el, 'Agregar pregunta')).toBeUndefined();
  }, 20_000);

  it('al cambiar de curso el bloqueo se recalcula para cada evaluación', async () => {
    const { harness, el } = await setup('/admin/evaluaciones?curso=c1');
    expect(el.querySelector('#exam-locked')).not.toBeNull();
    const select = el.querySelector<HTMLSelectElement>('#admin-course-select')!;
    select.value = 'c-mkt';
    select.dispatchEvent(new Event('change'));
    await until(harness, () => harness.routeDebugElement!.componentInstance.courseId() === 'c-mkt');
    await until(harness, () => !text(el).includes('Cargando') && !!el.querySelector('#exam-state-title'));
    expect(button(el, 'Agregar pregunta')).toBeDefined();
    expect(el.querySelector<HTMLInputElement>('#e-time')!.disabled).toBe(false);
  }, 20_000);
});
