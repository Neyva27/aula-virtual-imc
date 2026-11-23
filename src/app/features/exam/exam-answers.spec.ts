import { TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { firstValueFrom } from 'rxjs';
import { Exam } from './exam/exam';
import { ExamInstructions } from './instructions/instructions';
import { AuthService } from '../../core/services/auth.service';
import { DataRepository } from '../../core/services/data-repository';
import { MockDataRepository, STORAGE_KEY } from '../../core/services/mock-data-repository';
import { ExamSessionService } from '../../core/services/exam-session.service';
import { DEMO_CONFIG } from '../../core/config/demo.config';
import { DemoState } from '../../core/data/demo-state';
import { registerExamStart } from '../../core/services/testing/exam-starts';

/**
 * Corrección de R3 en pantalla: las respuestas se guardan en el repositorio mientras se responde y se recuperan al
 * recargar o desde otra pestaña, sin reiniciar el tiempo. Repositorio simulado real; datos ficticios (Rosa, u5).
 */
@Component({ template: 'Resultado' })
class ResultStub {}

const MIN = 60_000;
const SESSION_KEY = 'imc-demo-exam-session';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const stored = (): DemoState => JSON.parse(localStorage.getItem(STORAGE_KEY)!);
const savedAnswers = () => stored().examStarts.find((s) => s.userId === 'u5')?.answers ?? {};

async function until(harness: RouterTestingHarness, cond: () => boolean, timeout = 8000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    await harness.fixture.whenStable();
    if (cond()) return;
    await sleep(50);
  }
  throw new Error('La condición no se cumplió a tiempo');
}

async function setup(before: () => void = () => undefined) {
  localStorage.clear();
  sessionStorage.clear();
  before();
  TestBed.configureTestingModule({
    providers: [
      provideRouter(
        [
          { path: 'cursos/:courseId/examen', component: ExamInstructions },
          { path: 'cursos/:courseId/examen/rendir', component: Exam },
          { path: 'cursos/:courseId/examen/resultado', component: ResultStub },
        ],
        withComponentInputBinding(),
      ),
      { provide: DataRepository, useClass: MockDataRepository },
    ],
  });
  await firstValueFrom(TestBed.inject(AuthService).login('rosa@ejemplo.test', DEMO_CONFIG.demoPassword));
  const harness = await RouterTestingHarness.create();
  const el = () => harness.routeNativeElement as HTMLElement;
  const button = (label: string) => [...el().querySelectorAll<HTMLButtonElement>('button')].find((b) => text(b).includes(label));
  const startFromInstructions = async () => {
    await harness.navigateByUrl('/cursos/c1/examen');
    await until(harness, () => !!button('examen'));
    button('examen')!.click();
    await until(harness, () => TestBed.inject(Router).url === '/cursos/c1/examen/rendir' && !!el().querySelector('.opts input'));
  };
  return { harness, el, startFromInstructions, sessions: TestBed.inject(ExamSessionService) };
}

describe('Respuestas guardadas en el repositorio (corrección de R3)', () => {
  it('al marcar una alternativa, la respuesta queda guardada en el repositorio', async () => {
    const { harness, el, startFromInstructions } = await setup();
    await startFromInstructions();
    el().querySelectorAll<HTMLInputElement>('.opts input')[1].click(); // q1, opción b
    await until(harness, () => savedAnswers()['q1']?.[0] === 'b');
    expect(savedAnswers()).toEqual({ q1: ['b'] });
  }, 20_000);

  it('otra pestaña (sin sesión en el navegador) recupera las respuestas y el tiempo registrados', async () => {
    const now = Date.now();
    const { el, startFromInstructions, sessions } = await setup(() =>
      registerExamStart('u5', 'c1-e1', now - 5 * MIN, now + 15 * MIN, { q1: ['b'], q8: ['b', 'd'] }),
    );
    await startFromInstructions();
    expect(sessions.session()).toMatchObject({ startedAt: now - 5 * MIN, answers: { q1: ['b'], q8: ['b', 'd'] } });
    expect(el().querySelectorAll<HTMLInputElement>('.opts input')[1].checked).toBe(true); // q1 = b
    expect(text(el().querySelector('.bar__info p'))).toContain('2 respondidas');
  }, 20_000);

  it('al recargar, toma las guardadas y sube las que solo estaban en este navegador', async () => {
    const now = Date.now();
    const { harness } = await setup(() => {
      registerExamStart('u5', 'c1-e1', now - 2 * MIN, now + 18 * MIN, { q1: ['b'] });
      sessionStorage.setItem(
        SESSION_KEY,
        JSON.stringify({ userId: 'u5', examId: 'c1-e1', startedAt: now - 2 * MIN, endsAt: now + 18 * MIN, answers: { q1: ['a'], q3: ['b'] }, index: 0 }),
      );
    });
    await harness.navigateByUrl('/cursos/c1/examen/rendir');
    await until(harness, () => savedAnswers()['q3']?.[0] === 'b');
    expect(savedAnswers()).toEqual({ q1: ['b'], q3: ['b'] }); // q1: manda lo guardado; q3: se subió
    expect(TestBed.inject(ExamSessionService).session()!.answers).toEqual({ q1: ['b'], q3: ['b'] });
  }, 20_000);

  it('una respuesta abierta se guarda al dejar de escribir', async () => {
    const { harness, el, startFromInstructions } = await setup(() => {
      new MockDataRepository().resetDemo();
      const s = stored();
      s.attempts = s.attempts.filter((a) => a.userId !== 'u5');
      s.questions.filter((q) => q.examId === 'c1-e1').forEach((q) => (q.points = 8));
      s.questions.push({ id: 'qo', examId: 'c1-e1', type: 'open', text: 'Explica', options: [], correct: [], points: 20 });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    });
    await startFromInstructions();
    el().querySelectorAll<HTMLButtonElement>('.chip')[10].click(); // pregunta 11 (abierta)
    await until(harness, () => !!el().querySelector('#open-qo'));
    const area = el().querySelector<HTMLTextAreaElement>('#open-qo')!;
    area.value = 'Mi respuesta';
    area.dispatchEvent(new Event('input'));
    await harness.fixture.whenStable();
    expect(savedAnswers()['qo']).toBeUndefined(); // todavía no: espera a que deje de escribir
    await until(harness, () => savedAnswers()['qo']?.[0] === 'Mi respuesta', 4000);
  }, 20_000);
});
