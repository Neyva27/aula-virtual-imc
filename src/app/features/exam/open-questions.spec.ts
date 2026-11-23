import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { firstValueFrom } from 'rxjs';
import { routes } from '../../app.routes';
import { AuthService } from '../../core/services/auth.service';
import { DataRepository } from '../../core/services/data-repository';
import { MockDataRepository, STORAGE_KEY } from '../../core/services/mock-data-repository';
import { ExamSessionService } from '../../core/services/exam-session.service';
import { DemoState } from '../../core/data/demo-state';
import { SEED_QUESTIONS } from '../../core/data/seed';
import { DEMO_CONFIG } from '../../core/config/demo.config';
import { addQuestionKeepingScale } from '../../core/services/testing/exam-points';

/**
 * M5: preguntas abiertas en las pantallas reales (rutas y guards de la aplicación): creación en Evaluaciones,
 * respuesta del alumno, «En revisión» y calificación en Seguimiento y resultados. Datos ficticios en el almacenamiento
 * aislado de la prueba; c1-e1 se prepara sin intentos para poder agregarle la pregunta abierta.
 */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const button = (scope: Element, label: string) =>
  [...scope.querySelectorAll<HTMLButtonElement>('button')].find((b) => text(b) === label || b.getAttribute('aria-label') === label);

async function until(harness: RouterTestingHarness, cond: () => boolean, timeout = 8000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    await harness.fixture.whenStable();
    if (cond()) return;
    await sleep(50);
  }
  throw new Error('La condición no se cumplió a tiempo');
}

type Stage = 'sin-intentos' | 'con-abierta' | 'en-revision';

/** Prepara c1-e1: sin intentos, con una pregunta abierta y, opcionalmente, el intento de Rosa en revisión. */
async function prepare(stage: Stage): Promise<{ openId: string; attemptId: string }> {
  new MockDataRepository().resetDemo();
  const s: DemoState = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
  s.attempts = [];
  // Etapa 2A: para agregar preguntas desde la pantalla sin exigir la suma exacta, c1 se prepara en borrador.
  if (stage === 'sin-intentos') s.courses.find((c) => c.id === 'c1')!.status = 'borrador';
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  const repo = new MockDataRepository();
  if (stage === 'sin-intentos') return { openId: '', attemptId: '' };
  // Etapa 2A: c1 publicado; la abierta se agrega manteniendo la suma exacta de 100 (las 10 de selección pasan a 8).
  const list = await addQuestionKeepingScale(repo, 'c1', 'c1-e1', {
      id: '',
      type: 'open',
      text: 'Explica qué es un riesgo laboral.',
      options: [],
      correct: [],
      points: 20,
      rubric: 'Menciona peligro y consecuencia.',
  });
  const openId = list.find((q) => q.type === 'open')!.id;
  if (stage === 'con-abierta') return { openId, attemptId: '' };
  const all = { ...Object.fromEntries(SEED_QUESTIONS.map((q) => [q.id, [...q.correct]])), [openId]: ['Es la posibilidad de un daño.'] };
  const attempt = await firstValueFrom(repo.submitExamAttempt('u5', 'c1-e1', all, 300));
  return { openId, attemptId: attempt.id };
}

async function open(email: string, url: string, stage: Stage, ready: (root: HTMLElement) => boolean, beforeNavigate?: () => void) {
  localStorage.clear();
  sessionStorage.clear();
  const ids = await prepare(stage);
  TestBed.configureTestingModule({
    providers: [provideRouter(routes, withComponentInputBinding()), { provide: DataRepository, useClass: MockDataRepository }],
  });
  await firstValueFrom(TestBed.inject(AuthService).login(email, DEMO_CONFIG.demoPassword));
  beforeNavigate?.();
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url);
  const root = harness.fixture.nativeElement as HTMLElement;
  await until(harness, () => ready(root));
  return { harness, root, repo: TestBed.inject(DataRepository), ...ids };
}

const input = (el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string, event = 'input') => {
  el.value = value;
  el.dispatchEvent(new Event(event, { bubbles: true }));
};

describe('Preguntas de respuesta abierta en pantalla (M5)', () => {
  it('Evaluaciones: el tipo «Respuesta abierta» pide puntaje máximo y criterio, sin opciones', async () => {
    const { root, harness, repo } = await open('admin@ejemplo.test', '/admin/evaluaciones?curso=c1', 'sin-intentos', (r) =>
      !!button(r, 'Agregar pregunta'),
    );
    button(root, 'Agregar pregunta')!.click();
    await until(harness, () => !!root.querySelector('#d-type'));
    input(root.querySelector<HTMLSelectElement>('#d-type')!, 'open', 'change');
    await until(harness, () => !!root.querySelector('#d-rubric'));
    expect(text(root.querySelector('label[for="d-points"]'))).toBe('Puntaje máximo');
    expect(root.querySelector('fieldset.opts')).toBeNull();
    expect(text(root.querySelector('#d-rubric-help'))).toContain('no se califica automáticamente');
    input(root.querySelector<HTMLTextAreaElement>('#d-text')!, 'Describe un procedimiento seguro.');
    input(root.querySelector<HTMLInputElement>('#d-points')!, '15');
    input(root.querySelector<HTMLTextAreaElement>('#d-rubric')!, 'Pasos en orden y equipo de protección.');
    button(root, 'Guardar pregunta')!.click();
    await until(harness, () => text(root).includes('Pregunta guardada'));
    const saved = (await firstValueFrom(repo.getExamQuestions('c1-e1'))).at(-1)!;
    expect(saved).toMatchObject({ type: 'open', points: 15, options: [], correct: [], rubric: 'Pasos en orden y equipo de protección.' });
    expect(text(root.querySelector(`tr[data-question="${saved.id}"]`))).toContain('Respuesta abierta');
  });

  it('el alumno responde con texto libre y, al enviar, el resultado queda «En revisión»', async () => {
    const { root, harness, openId } = await open(
      'rosa@ejemplo.test',
      '/cursos/c1/examen/rendir',
      'con-abierta',
      (r) => !!r.querySelector('app-exam .chips'),
      () => {
        // Etapa 2B (D3): las de selección ya respondidas; la abierta se responde en pantalla.
        const session = TestBed.inject(ExamSessionService);
        session.start('u5', 20, 'c1-e1');
        for (const q of SEED_QUESTIONS) session.setAnswer(q.id, [...q.correct]);
      },
    );
    const chips = [...root.querySelectorAll<HTMLButtonElement>('app-exam .chip')];
    chips.at(-1)!.click();
    await until(harness, () => !!root.querySelector(`#open-${openId}`));
    expect(text(root.querySelector('legend .badge'))).toBe('Respuesta abierta');
    const answered = text(root.querySelector('app-exam .bar__info p'));
    input(root.querySelector<HTMLTextAreaElement>(`#open-${openId}`)!, 'Es la posibilidad de que un peligro cause daño.');
    await harness.fixture.whenStable();
    expect(text(root.querySelector('app-exam .bar__info p'))).not.toBe(answered);
    expect(chips.at(-1)!.getAttribute('aria-label')).toContain('respondida');
    expect(TestBed.inject(ExamSessionService).session()!.answers[openId]).toEqual(['Es la posibilidad de que un peligro cause daño.']);

    button(root, 'Finalizar y enviar')!.click();
    await until(harness, () => !!root.querySelector('[role=dialog]'));
    expect(text(root.querySelector('[role=dialog]'))).toContain('quedará «Pendiente de calificación»');
    button(root, 'Sí, enviar')!.click();
    await until(harness, () => !!root.querySelector('[data-review]'), 10000);
    const result = text(root.querySelector('[data-review]'));
    expect(result).toContain('Pendiente de calificación'); // R6: texto para el estudiante
    expect(result).not.toContain('Aprobado');
    expect(result).not.toContain('Desaprobado');
    expect(result).not.toContain('Nota obtenida');
  }, 20_000); // Etapa 2A: la preparación reparte los puntajes con el flujo real (más esperas simuladas)

  it('«Mi progreso» y el aula muestran la evaluación en revisión, sin aprobado ni certificado', async () => {
    const { root } = await open('rosa@ejemplo.test', '/progreso', 'en-revision', (r) => !!r.querySelector('li[data-course="c1"] .exam-state'));
    const c1 = root.querySelector('li[data-course="c1"]')!;
    expect(text(c1.querySelector('.exam-state'))).toBe('Pendiente de calificación'); // R6
    expect(text(c1)).toContain('el resultado se mostrará cuando el instructor termine de calificarla');
    expect(text(c1.querySelector('dl.attempt'))).toContain('Pendiente');
    expect(text(c1.querySelector('dl.attempt'))).toContain('Pendiente de calificación'); // R6
    expect(text(c1)).not.toContain('Certificado emitido');
  }, 20_000);

  it('Seguimiento y resultados: calificar completa la nota, aprueba y emite el certificado', async () => {
    const { root, harness, repo, attemptId, openId } = await open(
      'admin@ejemplo.test',
      '/admin/resultados?curso=c1',
      'en-revision',
      (r) => !!r.querySelector('tr[data-attempt]'),
    );
    const row = () => root.querySelector(`tr[data-attempt="${attemptId}"]`)!;
    expect(text(row().querySelector('[data-label="Resultado"]'))).toBe('En revisión');
    expect(text(row().querySelector('[data-label="Nota"]'))).toBe('Pendiente');
    button(row(), 'Calificar el intento de Rosa Cruz Huamán')!.click(); // nombre accesible del botón
    await until(harness, () => !!root.querySelector(`#score-${openId}`));
    const panel = root.querySelector('[data-grading]')!;
    expect(text(panel)).toContain('Explica qué es un riesgo laboral.');
    expect(text(panel)).toContain('Criterio: Menciona peligro y consecuencia.');
    expect(text(panel)).toContain('Es la posibilidad de un daño.');

    button(panel, 'Completar calificación')!.click();
    await until(harness, () => text(root.querySelector('[data-grading] .alert-danger')).includes('Asigna un puntaje'));
    const spy = vi.spyOn(repo, 'gradeOpenAnswers');
    input(root.querySelector<HTMLInputElement>(`#score-${openId}`)!, '15');
    button(root.querySelector('[data-grading]')!, 'Completar calificación')!.click();
    await until(harness, () => !!root.querySelector('[data-grading] [role=alertdialog]'));
    expect(text(root.querySelector('[role=alertdialog]'))).toContain('no se podrá modificar');
    // «Revisar puntajes» vuelve atrás sin guardar.
    button(root.querySelector('[role=alertdialog]')!, 'Revisar puntajes')!.click();
    await until(harness, () => !root.querySelector('[role=alertdialog]'));
    expect(spy).not.toHaveBeenCalled();

    button(root.querySelector('[data-grading]')!, 'Completar calificación')!.click();
    await until(harness, () => !!root.querySelector('[role=alertdialog]'));
    button(root.querySelector('[role=alertdialog]')!, 'Sí, completar calificación')!.click();
    await until(harness, () => text(root).includes('Calificación completada'));
    expect(spy).toHaveBeenCalledWith(attemptId, [{ questionId: openId, score: 15 }]);
    // Etapa 2A (suma exacta): 10 de selección × 8 = 80 + 15 de 20 = 95 / 100 (antes, 115 / 120 → 96).
    expect(text(root.querySelector('.alert-success'))).toContain('obtuvo 95 / 100, aprobado');
    await until(harness, () => text(row().querySelector('[data-label="Resultado"]')) === 'Aprobado');
    // R7: cada fila tiene «Ver detalle»; lo que deja de ofrecerse tras calificar es «Calificar».
    expect([...row().querySelectorAll('button')].map((b) => text(b))).toEqual(['Ver detalle']);
    const certs = await firstValueFrom(repo.listCertificates({ userId: 'u5', courseId: 'c1' }));
    expect(certs.map((c) => [c.attemptId, c.score, c.status])).toEqual([[attemptId, 95, 'vigente']]);
  }, 20_000);
});
