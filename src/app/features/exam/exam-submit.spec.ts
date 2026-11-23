import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Component } from '@angular/core';
import { firstValueFrom, throwError } from 'rxjs';
import { Exam } from './exam/exam';
import { ExamInstructions } from './instructions/instructions';
import { AuthService } from '../../core/services/auth.service';
import { DataRepository } from '../../core/services/data-repository';
import { MockDataRepository } from '../../core/services/mock-data-repository';
import { ExamSessionService } from '../../core/services/exam-session.service';
import { DEMO_CONFIG } from '../../core/config/demo.config';
import { SEED_QUESTIONS } from '../../core/data/seed';
import { registerExamStart } from '../../core/services/testing/exam-starts';

/**
 * F3.3: temporizador y entrega del examen con el repositorio simulado real.
 * Las sesiones se crean solo en el sessionStorage aislado de la prueba. Datos ficticios.
 */
@Component({ template: 'Resultado' })
class ResultStub {}

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

interface OpenOptions {
  /**
   * Etapa 2B: duración total de la sesión. Sin indicarla, la sesión dura `seconds`. Con ella, la sesión empezó hace
   * (limitSec − seconds) segundos y le quedan `seconds`: así el envío por tiempo agotado tiene la duración real del
   * examen (20 minutos en la demostración), que el repositorio exige para aceptarlo.
   */
  limitSec?: number;
  /** Respuestas ya registradas en la sesión. */
  answers?: Record<string, string[]>;
}

/** Todas las preguntas de c1 respondidas correctamente (entrega voluntaria completa). */
const complete = () => Object.fromEntries(SEED_QUESTIONS.map((q) => [q.id, [...q.correct]]));

/** Abre el examen de c1 con una sesión a la que le quedan `seconds` segundos para el usuario indicado. */
async function openExam(email: string, userId: string, seconds: number, options: OpenOptions = {}) {
  localStorage.clear();
  sessionStorage.clear();
  if (options.limitSec) {
    const now = Date.now();
    const startedAt = now - (options.limitSec - seconds) * 1000;
    const endsAt = now + seconds * 1000;
    sessionStorage.setItem(
      'imc-demo-exam-session',
      JSON.stringify({ userId, examId: 'c1-e1', startedAt, endsAt, answers: options.answers ?? {}, index: 0, timeWarningShown: true }),
    );
    // Etapa 2B, Bloque 2 (R2): el inicio registrado en el repositorio decide el horario; se registra el mismo.
    registerExamStart(userId, 'c1-e1', startedAt, endsAt);
  }
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
  const repo = TestBed.inject(DataRepository);
  await firstValueFrom(TestBed.inject(AuthService).login(email, DEMO_CONFIG.demoPassword));
  const sessions = TestBed.inject(ExamSessionService);
  if (!options.limitSec) {
    sessions.start(userId, seconds / 60, 'c1-e1');
    for (const [id, values] of Object.entries(options.answers ?? {})) sessions.setAnswer(id, values);
  }
  const submitSpy = vi.spyOn(repo, 'submitExamAttempt');
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl('/cursos/c1/examen/rendir', Exam);
  const el = harness.routeNativeElement as HTMLElement;
  await until(harness, () => !!el.querySelector('.opts input'));
  return { repo, harness, el, sessions, submitSpy, router: TestBed.inject(Router) };
}

const button = (el: HTMLElement, label: string) =>
  [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => text(b) === label);

describe('Entrega del examen (F3.3)', () => {
  it('si el tiempo se agota y el repositorio rechaza la entrega, no la reintenta cada segundo', async () => {
    // Carla ya consumió su único intento: cualquier entrega se rechaza de forma definitiva.
    const { repo, harness, el, sessions, submitSpy, router } = await openExam('carla@ejemplo.test', 'u3', 2);
    await until(harness, () => submitSpy.mock.calls.length > 0, 6000);
    await sleep(3500); // con el defecto, el temporizador reenviaba en cada tic
    await harness.fixture.whenStable();
    expect(submitSpy).toHaveBeenCalledTimes(1);
    expect(text(el.querySelector('.alert-danger'))).toBe('Alcanzaste el límite de intentos permitidos.');
    expect(text(el)).toContain('No se registró la entrega.');
    expect(button(el, 'Finalizar y enviar')).toBeUndefined(); // no invita a reenviar
    expect(el.querySelector('a[href="/cursos/c1/examen"]')).not.toBeNull();
    expect(router.url).toBe('/cursos/c1/examen/rendir'); // no se muestra un resultado no confirmado
    expect(sessions.session()).toBeNull(); // la sesión rechazada no queda como «Continuar examen»
    expect((await firstValueFrom(repo.listAttempts({ userId: 'u3' }))).map((a) => a.id)).toEqual(['att2']);
  }, 20_000);

  it('un error no definitivo al agotarse el tiempo no se reintenta solo, pero se puede reenviar a mano', async () => {
    // Etapa 2B: sesión de 20 minutos a la que le quedan 2 s y sin respuestas: el reenvío también es por tiempo agotado.
    const { repo, harness, el, submitSpy, router } = await openExam('rosa@ejemplo.test', 'u5', 2, { limitSec: 20 * 60 });
    submitSpy.mockReturnValueOnce(throwError(() => new Error('No se pudo conectar. Intenta nuevamente.')));
    await until(harness, () => submitSpy.mock.calls.length > 0, 6000);
    await sleep(2500);
    await harness.fixture.whenStable();
    expect(submitSpy).toHaveBeenCalledTimes(1);
    expect(text(el.querySelector('.alert-danger'))).toBe('No se pudo conectar. Intenta nuevamente.');
    expect(await firstValueFrom(repo.listAttempts({ userId: 'u5' }))).toEqual([]);

    button(el, 'Finalizar y enviar')!.click();
    await harness.fixture.whenStable();
    expect(text(el.querySelector('[role="dialog"]'))).toContain('El tiempo terminó: se enviarán las respuestas registradas.');
    button(el, 'Sí, enviar')!.click();
    await until(harness, () => router.url === '/cursos/c1/examen/resultado');
    expect(submitSpy).toHaveBeenCalledTimes(2);
    expect(submitSpy.mock.calls.map((c) => c[4])).toEqual(['tiempo', 'tiempo']);
    expect((await firstValueFrom(repo.listAttempts({ userId: 'u5' }))).length).toBe(1);
  }, 20_000);

  it('Etapa 2B (P4): al agotarse el tiempo envía solo lo registrado y califica las parciales en proporción', async () => {
    const answers = { q1: ['b'], q8: ['b'] }; // q1 correcta; q8: 1 de 2 correctas; el resto sin responder
    const { repo, harness, submitSpy, router } = await openExam('rosa@ejemplo.test', 'u5', 2, { limitSec: 20 * 60, answers });
    await until(harness, () => router.url === '/cursos/c1/examen/resultado', 8000);
    expect(submitSpy).toHaveBeenCalledTimes(1);
    expect(submitSpy.mock.calls[0][4]).toBe('tiempo');
    const [attempt] = await firstValueFrom(repo.listAttempts({ userId: 'u5' }));
    expect(attempt).toMatchObject({ score: 15, passed: false, durationSec: 1200, gradingRule: 'proporcional', answers });
    expect(attempt.questionScores).toMatchObject({ q1: 10, q8: 5, q2: 0, q6: 0 });
  }, 20_000);

  it('Etapa 2B (D3): con preguntas pendientes no se puede entregar voluntariamente', async () => {
    const { repo, harness, el, submitSpy } = await openExam('rosa@ejemplo.test', 'u5', 600, {
      answers: { ...complete(), q3: [], q6: ['a'] },
    });
    button(el, 'Finalizar y enviar')!.click();
    await harness.fixture.whenStable();
    const dialog = el.querySelector('[role="dialog"]')!;
    expect(text(dialog.querySelector('[data-pending]'))).toBe(
      'Para entregar debes completar todas las preguntas. Falta completar las preguntas 3, 6.',
    );
    expect(button(dialog as HTMLElement, 'Sí, enviar')).toBeUndefined();
    (harness.routeDebugElement!.componentInstance as Exam).submit(); // ni siquiera llamando al método directamente
    button(dialog as HTMLElement, 'Ir a la pregunta 3')!.click();
    await harness.fixture.whenStable();
    expect(el.querySelector('[role="dialog"]')).toBeNull();
    expect(text(el.querySelector('.bar__info p'))).toContain('Pregunta 3 de 10');
    expect(submitSpy).not.toHaveBeenCalled();
    expect(await firstValueFrom(repo.listAttempts({ userId: 'u5' }))).toEqual([]);
  }, 20_000);

  it('no envía dos veces aunque se pulse «Sí, enviar» repetidamente', async () => {
    const { repo, harness, el, submitSpy, router } = await openExam('rosa@ejemplo.test', 'u5', 600, { answers: complete() });
    button(el, 'Finalizar y enviar')!.click();
    await harness.fixture.whenStable();
    const confirm = button(el, 'Sí, enviar')!;
    const exam = harness.routeDebugElement!.componentInstance as Exam;
    confirm.click();
    exam.submit(); // segundo envío mientras el primero sigue en curso
    exam.submit();
    await until(harness, () => router.url === '/cursos/c1/examen/resultado');
    expect(submitSpy).toHaveBeenCalledTimes(1);
    expect((await firstValueFrom(repo.listAttempts({ userId: 'u5' }))).length).toBe(1);
  }, 20_000);
});
