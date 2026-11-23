import { TestBed } from '@angular/core/testing';
import { Component, Type } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { firstValueFrom } from 'rxjs';
import { Exam } from './exam/exam';
import { ExamResult } from './result/result';
import { ExamInstructions } from './instructions/instructions';
import { AdminResults } from '../administration/admin-results';
import { AuthService } from '../../core/services/auth.service';
import { DataRepository } from '../../core/services/data-repository';
import { MockDataRepository } from '../../core/services/mock-data-repository';
import { ExamSession, ExamSessionService } from '../../core/services/exam-session.service';
import { DEMO_CONFIG } from '../../core/config/demo.config';
import { registerExamStart } from '../../core/services/testing/exam-starts';

/**
 * Etapa 1: aviso de 5 minutos en el examen y ocultar al estudiante el recuento de respuestas correctas.
 * Repositorio simulado real; sesiones solo en el sessionStorage aislado de la prueba. Datos ficticios.
 */
@Component({ template: 'Resultado' })
class ResultStub {}

const SESSION_KEY = 'imc-demo-exam-session';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const warning = (el: HTMLElement) => el.querySelector('app-exam-time-warning [role="alert"]');

async function until(harness: RouterTestingHarness, cond: () => boolean, timeout = 8000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    await harness.fixture.whenStable();
    if (cond()) return;
    await sleep(50);
  }
  throw new Error('La condición no se cumplió a tiempo');
}

/**
 * Abre el examen de c1 para Rosa (u5, lista para rendir) con una sesión preparada:
 * `durationSec` = duración total del intento y `remainingSec` = segundos que le quedan al abrir.
 */
async function openExam(durationSec: number, remainingSec: number, extra: Partial<ExamSession> = {}) {
  localStorage.clear();
  sessionStorage.clear();
  const now = Date.now();
  const session: ExamSession = {
    userId: 'u5', examId: 'c1-e1', startedAt: now - (durationSec - remainingSec) * 1000, endsAt: now + remainingSec * 1000,
    answers: {}, index: 0, ...extra,
  };
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session)); // se restaura al crear el servicio
  // Etapa 2B, Bloque 2 (R2): el horario lo decide el inicio registrado en el repositorio; se registra el mismo.
  registerExamStart('u5', 'c1-e1', session.startedAt, session.endsAt);
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
  const submitSpy = vi.spyOn(repo, 'submitExamAttempt');
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl('/cursos/c1/examen/rendir', Exam);
  const el = harness.routeNativeElement as HTMLElement;
  await until(harness, () => !!el.querySelector('.opts input'));
  return { harness, el, submitSpy, sessions: TestBed.inject(ExamSessionService) };
}

describe('Etapa 1: aviso de 5 minutos en el examen', () => {
  it('aparece una sola vez al cruzar los 5 minutos, sin mover el foco ni bloquear la pantalla', async () => {
    const { harness, el, sessions } = await openExam(1200, 302); // examen de 20 min; quedan 5:02
    expect(warning(el)).toBeNull();
    const focusBefore = document.activeElement;

    await until(harness, () => !!warning(el), 6000);
    expect(text(warning(el))).toContain('Quedan 5 minutos o menos');
    expect(text(warning(el))).toContain('se enviarán automáticamente');
    expect(document.activeElement).toBe(focusBefore); // no interrumpe lo que el estudiante está haciendo
    expect(el.querySelector('.overlay')).toBeNull(); // no es modal: no hay fondo que bloquee
    expect(sessions.session()?.timeWarningShown).toBe(true);

    // El examen continúa: se puede responder con el aviso visible.
    el.querySelector<HTMLInputElement>('.opts input')!.click();
    await harness.fixture.whenStable();
    expect(text(el.querySelector('.bar__info'))).toContain('1 respondidas');

    // Cerrar el aviso no detiene el temporizador y el aviso no vuelve a aparecer.
    const before = text(el.querySelector('.timer strong'));
    [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => text(b) === 'Entendido')!.click();
    await harness.fixture.whenStable();
    expect(warning(el)).toBeNull();
    await sleep(2300);
    await harness.fixture.whenStable();
    expect(warning(el)).toBeNull();
    expect(text(el.querySelector('.timer strong'))).not.toBe(before);
  }, 25_000);

  it('no se repite al volver a abrir el examen en el mismo intento', async () => {
    const { harness, el } = await openExam(1200, 250, { timeWarningShown: true });
    await sleep(2300);
    await harness.fixture.whenStable();
    expect(warning(el)).toBeNull();
  }, 20_000);

  it('si se retoma el intento ya pasado el umbral sin haberlo visto, se muestra una vez', async () => {
    const { harness, el } = await openExam(1200, 200);
    await until(harness, () => !!warning(el), 6000);
  }, 20_000);

  it('no aparece antes de los 5 minutos ni en intentos de 5 minutos o menos', async () => {
    const early = await openExam(1200, 420);
    await sleep(2300);
    await early.harness.fixture.whenStable();
    expect(warning(early.el)).toBeNull();
    TestBed.resetTestingModule();

    const short = await openExam(240, 230); // el umbral nunca se cruza
    await sleep(2300);
    await short.harness.fixture.whenStable();
    expect(warning(short.el)).toBeNull();
  }, 25_000);

  it('al agotarse el tiempo se oculta y el envío automático sigue funcionando', async () => {
    const { harness, el, submitSpy } = await openExam(1200, 3);
    await until(harness, () => !!warning(el), 4000);
    await until(harness, () => submitSpy.mock.calls.length > 0, 8000);
    expect(submitSpy).toHaveBeenCalledTimes(1);
    expect(warning(el)).toBeNull();
  }, 25_000);
});

async function openPage<T>(email: string, url: string, component: Type<T>, path: string) {
  localStorage.clear();
  sessionStorage.clear();
  TestBed.configureTestingModule({
    providers: [provideRouter([{ path, component }], withComponentInputBinding()), { provide: DataRepository, useClass: MockDataRepository }],
  });
  await firstValueFrom(TestBed.inject(AuthService).login(email, DEMO_CONFIG.demoPassword));
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url, component);
  const el = harness.routeNativeElement as HTMLElement;
  await until(harness, () => !text(el).includes('Cargando') && text(el).length > 0);
  return { harness, el };
}

describe('Etapa 1: el estudiante no ve el recuento de respuestas correctas', () => {
  it('el resultado muestra la nota y los demás datos, sin «Respuestas correctas»', async () => {
    const { el } = await openPage('carla@ejemplo.test', '/cursos/c1/examen/resultado', ExamResult, 'cursos/:courseId/examen/resultado');
    expect(text(el.querySelector('.n'))).toBe('50 / 100');
    expect(text(el)).toContain('Fecha del intento');
    expect(text(el)).toContain('Duración');
    expect(text(el)).not.toContain('Respuestas correctas');
    expect(text(el)).not.toContain('5 de 10');
  }, 20_000);

  // Etapa 2B (P3): la columna «Correctas» se reemplazó por «Puntos obtenidos». El intento de Carla (att2) es anterior
  // y no guarda el detalle por pregunta: no se recalcula y se indica que no está disponible; su nota no cambia.
  it('el Instructor ve los puntos obtenidos en Seguimiento y resultados', async () => {
    const { harness, el } = await openPage('admin@ejemplo.test', '/instructor/resultados', AdminResults, 'instructor/resultados');
    await until(harness, () => !!el.querySelector('[data-attempt="att2"]'));
    expect(text(el.querySelector('tr[data-attempt]')!.closest('table')!.querySelector('thead'))).toContain('Puntos obtenidos'); // encabezado de la columna
    expect(text(el.querySelector('tr[data-attempt]')!.closest('table')!.querySelector('thead'))).not.toContain('Correctas');
    const row = el.querySelector('[data-attempt="att2"]')!;
    expect(text(row.querySelector('[data-label="Nota"]'))).toBe('50 / 100');
    expect(text(row.querySelector('[data-label="Puntos obtenidos"]'))).toBe(
      'No disponible (intento anterior a la calificación proporcional)',
    );
  }, 20_000);
});
