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

/**
 * Etapa 2B, Bloque 1 (pantalla del alumno): cantidad exigida en selección múltiple, contador, límite de marcas y
 * estado de cada pregunta en la paleta. Sesión aislada en la prueba. Datos ficticios (q6: 3 correctas de 5, 3 exigidas).
 */
@Component({ template: 'Otra pantalla' })
class Stub {}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

async function setup() {
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
  await firstValueFrom(TestBed.inject(AuthService).login('rosa@ejemplo.test', DEMO_CONFIG.demoPassword));
  const session = TestBed.inject(ExamSessionService);
  session.start('u5', 20, 'c1-e1');
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl('/cursos/c1/examen/rendir', Exam);
  const el = harness.routeNativeElement as HTMLElement;
  for (let i = 0; i < 80 && !el.querySelector('.opts input'); i++) {
    await harness.fixture.whenStable();
    await sleep(25);
  }
  const chip = (n: number) => el.querySelectorAll<HTMLButtonElement>('.chip')[n - 1];
  const go = async (n: number) => {
    chip(n).click();
    await harness.fixture.whenStable();
  };
  const boxes = () => [...el.querySelectorAll<HTMLInputElement>('.opts input')];
  const click = async (i: number) => {
    boxes()[i].click();
    await harness.fixture.whenStable();
  };
  return { harness, el, session, chip, go, boxes, click };
}

describe('Examen: selección múltiple con cantidad exigida (Etapa 2B)', () => {
  it('indica cuántas debe marcar y cuántas lleva; al llegar al límite desactiva las demás', async () => {
    const { el, session, go, boxes, click } = await setup();
    await go(6); // q6
    const help = () => text(el.querySelector('#sel-help-q6'));
    expect(help()).toBe('Selecciona exactamente 3 alternativas. Llevas 0 de 3.');
    expect(boxes().every((b) => b.type === 'checkbox' && !b.disabled)).toBe(true);
    expect(boxes()[0].getAttribute('aria-describedby')).toBe('sel-help-q6');

    await click(0);
    await click(1);
    expect(help()).toBe('Selecciona exactamente 3 alternativas. Llevas 2 de 3.');
    await click(2);
    expect(help()).toBe('Selecciona exactamente 3 alternativas. Llevas 3 de 3. Para cambiar tu elección, desmarca una alternativa.');
    expect(boxes().map((b) => b.disabled)).toEqual([false, false, false, true, true]);
    expect(el.querySelectorAll('.opt.is-disabled').length).toBe(2);

    // Una cuarta marca no se registra (también si se llama al método directamente).
    boxes()[3].disabled = false;
    await click(3);
    expect(session.session()!.answers['q6']).toEqual(['a', 'b', 'c']);

    await click(1); // desmarcar reactiva las demás
    expect(help()).toBe('Selecciona exactamente 3 alternativas. Llevas 2 de 3.');
    expect(boxes().some((b) => b.disabled)).toBe(false);
  }, 20_000);

  it('la paleta distingue respondidas, incompletas y sin responder', async () => {
    const { harness, el, chip, go, click } = await setup();
    await click(0); // q1, selección única: completa
    await go(6);
    await click(0); // q6 con 1 de 3: incompleta
    expect(chip(1).classList).toContain('is-answered');
    expect(chip(1).getAttribute('aria-label')).toBe('Ir a la pregunta 1, respondida');
    expect(chip(6).classList).toContain('is-partial');
    expect(chip(6).classList).not.toContain('is-answered');
    expect(chip(6).getAttribute('aria-label')).toBe('Ir a la pregunta 6, incompleta');
    expect(chip(2).getAttribute('aria-label')).toBe('Ir a la pregunta 2, sin responder');
    expect(text(el.querySelector('.bar__info p'))).toContain('1 respondidas');
    expect(text(el.querySelector('.legend'))).toContain('Ámbar: incompleta');

    await click(2);
    await click(4); // q6 con 3 de 3: completa
    await harness.fixture.whenStable();
    expect(chip(6).classList).toContain('is-answered');
    expect(text(el.querySelector('.bar__info p'))).toContain('2 respondidas');
  }, 20_000);

  it('una sesión anterior con más marcas que las exigidas pide desmarcar y no la cuenta como respondida', async () => {
    const { harness, el, session, chip, go, boxes } = await setup();
    session.setAnswer('q8', ['a', 'b', 'c']); // q8 exige 2
    await harness.fixture.whenStable();
    await go(8);
    expect(text(el.querySelector('#sel-help-q8'))).toBe('Selecciona exactamente 2 alternativas. Llevas 3 de 2. Desmarca 1 para continuar.');
    expect(chip(8).getAttribute('aria-label')).toBe('Ir a la pregunta 8, incompleta');
    expect(boxes().map((b) => b.disabled)).toEqual([false, false, false, true]);
  }, 20_000);

  it('selección única y verdadero/falso no muestran contador', async () => {
    const { el, go } = await setup();
    expect(el.querySelector('[id^="sel-help-"]')).toBeNull(); // q1
    await go(9);
    expect(el.querySelector('[id^="sel-help-"]')).toBeNull(); // q9, V/F
  }, 20_000);
});
