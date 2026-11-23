import { TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { firstValueFrom } from 'rxjs';
import { Exam } from './exam/exam';
import { AuthService } from '../../core/services/auth.service';
import { DataRepository } from '../../core/services/data-repository';
import { MockDataRepository } from '../../core/services/mock-data-repository';
import { ExamSessionService } from '../../core/services/exam-session.service';
import { DEMO_CONFIG } from '../../core/config/demo.config';
import { SEED_QUESTIONS } from '../../core/data/seed';

/** V5: confirmación de entrega del examen (foco, Escape y tabulación). La sesión vive solo en la prueba. */
@Component({ template: 'Instrucciones' })
class Stub {}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

const attached: HTMLElement[] = [];
afterEach(() => attached.splice(0).forEach((e) => e.remove()));

/** Etapa 2B (D3): la entrega voluntaria exige todo completo; por defecto se responden todas las preguntas. */
async function setup(complete = true) {
  localStorage.clear();
  sessionStorage.clear();
  TestBed.configureTestingModule({
    providers: [
      provideRouter(
        [
          { path: 'cursos/:courseId/examen', component: Stub },
          { path: 'cursos/:courseId/examen/rendir', component: Exam },
          { path: 'cursos/:courseId/examen/resultado', component: Stub },
        ],
        withComponentInputBinding(),
      ),
      { provide: DataRepository, useClass: MockDataRepository },
    ],
  });
  const repo = TestBed.inject(DataRepository);
  await firstValueFrom(TestBed.inject(AuthService).login('rosa@ejemplo.test', DEMO_CONFIG.demoPassword));
  const session = TestBed.inject(ExamSessionService);
  session.start('u5', 20, 'c1-e1');
  if (complete) for (const q of SEED_QUESTIONS) session.setAnswer(q.id, [...q.correct]);
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl('/cursos/c1/examen/rendir', Exam);
  const el = harness.routeNativeElement as HTMLElement;
  for (let i = 0; i < 80 && !el.querySelector('.opts input'); i++) {
    await harness.fixture.whenStable();
    await sleep(25);
  }
  document.body.appendChild(harness.fixture.nativeElement); // focus() solo funciona en elementos del documento
  attached.push(harness.fixture.nativeElement);
  return { harness, el, repo };
}

const button = (el: Element, label: string) => [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => text(b) === label)!;

describe('Confirmación de entrega del examen: foco (V5)', () => {
  it('al abrir, el foco va a «Seguir revisando»; Escape cierra sin enviar y devuelve el foco', async () => {
    const { harness, el, repo } = await setup();
    const submit = vi.spyOn(repo, 'submitExamAttempt');
    const finish = button(el, 'Finalizar y enviar');
    finish.click();
    await harness.fixture.whenStable();
    await sleep(10);
    const dialog = el.querySelector('[role="dialog"]')!;
    expect(document.activeElement).toBe(button(dialog, 'Seguir revisando'));
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await harness.fixture.whenStable();
    await sleep(10);
    expect(el.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(button(el, 'Finalizar y enviar'));
    expect(submit).not.toHaveBeenCalled();
    expect(await firstValueFrom(repo.listAttempts({ userId: 'u5' }))).toEqual([]);
  }, 20_000);

  it('el tabulador recorre solo los botones del diálogo', async () => {
    const { harness, el } = await setup();
    button(el, 'Finalizar y enviar').click();
    await harness.fixture.whenStable();
    await sleep(10);
    const dialog = el.querySelector<HTMLElement>('[role="dialog"]')!;
    const send = button(dialog, 'Sí, enviar');
    const keep = button(dialog, 'Seguir revisando');
    keep.focus();
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    keep.dispatchEvent(tab); // último → primero
    expect(tab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(send);
    const back = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
    send.dispatchEvent(back); // primero → último
    expect(back.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(keep);
  }, 20_000);

  it('Etapa 2B: con preguntas pendientes, el diálogo no ofrece enviar y mantiene el foco y la tabulación', async () => {
    const { harness, el, repo } = await setup(false);
    const submit = vi.spyOn(repo, 'submitExamAttempt');
    button(el, 'Finalizar y enviar').click();
    await harness.fixture.whenStable();
    await sleep(10);
    const dialog = el.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(text(dialog.querySelector('#confirm-title'))).toBe('Todavía no puedes enviar el examen');
    expect(button(dialog, 'Sí, enviar')).toBeUndefined();
    const go = button(dialog, 'Ir a la pregunta 1');
    const keep = button(dialog, 'Seguir revisando');
    expect(document.activeElement).toBe(keep);
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    keep.dispatchEvent(tab); // último → primero
    expect(tab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(go);
    expect(submit).not.toHaveBeenCalled();
  }, 20_000);
});
