import { TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { firstValueFrom, throwError } from 'rxjs';
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
 * Etapa 2B, Bloque 2 (R2) en pantalla: Instrucciones registra el inicio en el repositorio y el examen usa ese
 * horario; recargar u otra pestaña no reinicia el tiempo. Repositorio simulado real; datos ficticios.
 */
@Component({ template: 'Resultado' })
class ResultStub {}

const MIN = 60_000;
const SESSION_KEY = 'imc-demo-exam-session';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const stored = (): DemoState => JSON.parse(localStorage.getItem(STORAGE_KEY)!);

async function until(harness: RouterTestingHarness, cond: () => boolean, timeout = 8000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    await harness.fixture.whenStable();
    if (cond()) return;
    await sleep(50);
  }
  throw new Error('La condición no se cumplió a tiempo');
}

/** Rosa (u5, lista para rendir c1). `before` prepara el almacenamiento antes de crear los servicios. */
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
  const repo = TestBed.inject(DataRepository);
  const sessions = TestBed.inject(ExamSessionService);
  const harness = await RouterTestingHarness.create();
  const el = () => harness.routeNativeElement as HTMLElement;
  const button = (label: string) => [...el().querySelectorAll<HTMLButtonElement>('button')].find((b) => text(b).includes(label));
  const openInstructions = async () => {
    await harness.navigateByUrl('/cursos/c1/examen');
    await until(harness, () => !!button('examen'));
  };
  const openExam = async () => {
    await harness.navigateByUrl('/cursos/c1/examen/rendir');
    await until(harness, () => !!el().querySelector('.opts input'));
  };
  const minutesLeft = () => Number(text(el().querySelector('.timer strong')).split(':')[0]);
  return { repo, sessions, harness, el, button, openInstructions, openExam, minutesLeft, router: TestBed.inject(Router) };
}

describe('Inicio del examen registrado (Etapa 2B, Bloque 2, R2)', () => {
  it('«Comenzar examen» registra el inicio en el repositorio y el examen usa ese horario', async () => {
    const { repo, sessions, harness, button, openInstructions, el, minutesLeft, router } = await setup();
    const spy = vi.spyOn(repo, 'startExam');
    await openInstructions();
    expect(text(button('examen')!)).toBe('Comenzar examen');
    button('Comenzar examen')!.click();
    await until(harness, () => router.url === '/cursos/c1/examen/rendir' && !!el().querySelector('.opts input'));
    const [start] = stored().examStarts;
    expect(stored().examStarts).toHaveLength(1);
    expect(sessions.session()).toMatchObject({ userId: 'u5', examId: 'c1-e1', startedAt: Date.parse(start.startedAt), endsAt: Date.parse(start.endsAt) });
    expect(Date.parse(start.endsAt) - Date.parse(start.startedAt)).toBe(20 * MIN);
    expect(minutesLeft()).toBeGreaterThanOrEqual(19);
    expect(spy).toHaveBeenCalledTimes(2); // Instrucciones lo registra; el examen lo recupera (mismo inicio)
    expect(stored().attempts.some((a) => a.userId === 'u5')).toBe(false); // ningún intento por iniciar
  }, 20_000);

  it('volver a Instrucciones y «Continuar examen» recupera el mismo inicio, sin duplicarlo', async () => {
    const { sessions, harness, button, openInstructions, el, router } = await setup();
    await openInstructions();
    button('Comenzar examen')!.click();
    await until(harness, () => router.url === '/cursos/c1/examen/rendir' && !!el().querySelector('.opts input'));
    const first = sessions.session()!;
    await openInstructions();
    expect(text(button('examen')!)).toBe('Continuar examen');
    button('Continuar examen')!.click();
    await until(harness, () => router.url === '/cursos/c1/examen/rendir' && !!el().querySelector('.opts input'));
    expect(stored().examStarts).toHaveLength(1);
    expect(sessions.session()).toMatchObject({ startedAt: first.startedAt, endsAt: first.endsAt });
  }, 20_000);

  it('otra pestaña (sin sesión en el navegador) retoma el inicio registrado: el tiempo no se reinicia', async () => {
    const now = Date.now();
    const { sessions, harness, button, openInstructions, el, minutesLeft, router } = await setup(() =>
      registerExamStart('u5', 'c1-e1', now - 5 * MIN, now + 15 * MIN),
    );
    await openInstructions();
    button('examen')!.click();
    await until(harness, () => router.url === '/cursos/c1/examen/rendir' && !!el().querySelector('.opts input'));
    expect(minutesLeft()).toBeLessThanOrEqual(15); // quedan 15 min del inicio registrado, no 20
    expect(minutesLeft()).toBeGreaterThanOrEqual(14);
    expect(sessions.session()).toMatchObject({ startedAt: now - 5 * MIN, endsAt: now + 15 * MIN, answers: {} });
    expect(stored().examStarts).toHaveLength(1);
  }, 20_000);

  it('al recargar el examen, corrige el horario con el inicio registrado y conserva las respuestas', async () => {
    const now = Date.now();
    const { sessions, openExam, minutesLeft } = await setup(() => {
      registerExamStart('u5', 'c1-e1', now - 8 * MIN, now + 12 * MIN);
      // Sesión del navegador con otro horario (por ejemplo, de antes de R2) y una respuesta ya marcada.
      sessionStorage.setItem(
        SESSION_KEY,
        JSON.stringify({ userId: 'u5', examId: 'c1-e1', startedAt: now, endsAt: now + 20 * MIN, answers: { q1: ['b'] }, index: 0 }),
      );
    });
    await openExam();
    expect(minutesLeft()).toBeLessThanOrEqual(12); // el registrado (12 min), no el del navegador (20 min)
    expect(minutesLeft()).toBeGreaterThanOrEqual(11);
    expect(sessions.session()).toMatchObject({ startedAt: now - 8 * MIN, endsAt: now + 12 * MIN, answers: { q1: ['b'] } });
    expect(stored().examStarts).toHaveLength(1);
  }, 20_000);

  it('si el repositorio no registra el inicio, muestra el motivo junto al botón y no abre el examen', async () => {
    const { repo, harness, button, openInstructions, el, router } = await setup();
    await openInstructions();
    vi.spyOn(repo, 'startExam').mockReturnValue(throwError(() => new Error('El examen ya no está disponible.')));
    button('Comenzar examen')!.click();
    await until(harness, () => !!el().querySelector('.start')?.previousElementSibling?.matches('.alert-danger'));
    expect(text(el().querySelector('.alert-danger'))).toBe('El examen ya no está disponible.');
    expect(router.url).toBe('/cursos/c1/examen');
    expect(button('Comenzar examen')!.disabled).toBe(false);
    expect(text(el())).toContain('Comenzar examen'); // las instrucciones siguen visibles
  }, 20_000);

  it('un doble clic en «Comenzar examen» registra un solo inicio', async () => {
    const { repo, harness, button, openInstructions, router } = await setup();
    await openInstructions();
    const spy = vi.spyOn(repo, 'startExam');
    const start = button('Comenzar examen')!;
    start.click();
    start.click();
    await until(harness, () => router.url === '/cursos/c1/examen/rendir');
    expect(spy.mock.calls.length).toBeLessThanOrEqual(2); // 1 desde Instrucciones (+1 del examen al recuperarlo)
    expect(stored().examStarts).toHaveLength(1);
  }, 20_000);
});
