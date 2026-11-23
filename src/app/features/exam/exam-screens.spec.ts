import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Type } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ExamInstructions } from './instructions/instructions';
import { ExamResult } from './result/result';
import { AuthService } from '../../core/services/auth.service';
import { DataRepository } from '../../core/services/data-repository';
import { MockDataRepository, STORAGE_KEY } from '../../core/services/mock-data-repository';
import { DemoState } from '../../core/data/demo-state';
import { DEMO_CONFIG } from '../../core/config/demo.config';

/**
 * F3.2 y F3.4: instrucciones y resultado del examen con el repositorio simulado real.
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

async function open<T>(email: string, url: string, component: Type<T>, edit?: (s: DemoState) => void) {
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
      provideRouter(
        [
          { path: 'cursos/:courseId/examen', component: ExamInstructions },
          { path: 'cursos/:courseId/examen/resultado', component: ExamResult },
        ],
        withComponentInputBinding(),
      ),
      { provide: DataRepository, useClass: MockDataRepository },
    ],
  });
  await firstValueFrom(TestBed.inject(AuthService).login(email, DEMO_CONFIG.demoPassword));
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url, component);
  const el = harness.routeNativeElement as HTMLElement;
  await until(harness, () => !text(el).includes('Cargando'));
  return { harness, el };
}

const startButton = (el: HTMLElement) =>
  [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => /Comenzar examen|Continuar examen/.test(text(b)));

describe('Instrucciones del examen (F3.2)', () => {
  it('describe los intentos como una regla fija de un intento', async () => {
    const { el } = await open('rosa@ejemplo.test', '/cursos/c1/examen', ExamInstructions);
    expect(text(el)).toMatch(/Intentos disponibles\s*1 de 1/);
    expect(text(el)).toContain('Tienes un solo intento para este examen: una vez enviado, apruebes o no, no podrás volver a rendirlo.');
    // El aviso de valores provisionales ya no presenta los intentos como configurables.
    const note = text(el.querySelector('.alert-info'));
    expect(note).toContain('Valores de demostración (tiempo, nota mínima y preguntas)');
    expect(note).not.toContain('intentos');
    expect(startButton(el)!.disabled).toBe(false);
  }, 20_000);

  it('muestra 1 intento aunque el examen guardado traiga maxAttempts 2 (datos antiguos)', async () => {
    const { el } = await open('rosa@ejemplo.test', '/cursos/c1/examen', ExamInstructions, (s) => {
      s.exams.forEach((e) => (e.maxAttempts = 2));
    });
    expect(text(el)).toMatch(/Intentos disponibles\s*1 de 1/);
  }, 20_000);

  it('un curso en borrador muestra primero el estado y el motivo, sin invitar a comenzar', async () => {
    const { el } = await open('pedro@ejemplo.test', '/cursos/c-ia/examen', ExamInstructions);
    const blocked = el.querySelector('section.blocked')!;
    expect(text(blocked.querySelector('h2'))).toBe('El examen no está disponible');
    expect(text(blocked.querySelector('.alert-warning'))).toBe(
      'El curso está en borrador: el examen se habilitará cuando el curso se publique.',
    );
    expect(startButton(el)).toBeUndefined();
    expect(text(el)).not.toContain('Antes de comenzar');
    expect(text(el)).not.toContain('Comenzar examen');
    expect(el.querySelector('a[href="/cursos/c-ia"]')).not.toBeNull();
  }, 20_000);

  it('con videos pendientes explica el motivo sin mostrar las instrucciones para comenzar', async () => {
    const { el } = await open('luis@ejemplo.test', '/cursos/c1/examen', ExamInstructions);
    expect(text(el.querySelector('section.blocked .alert-warning'))).toBe(
      'Debes completar todos los videos antes de rendir el examen.',
    );
    expect(startButton(el)).toBeUndefined();
    expect(text(el)).not.toContain('Antes de comenzar');
    expect(text(el)).toMatch(/Intentos disponibles\s*1 de 1/);
  }, 20_000);
});

describe('Resultado del examen (F3.4)', () => {
  it('identifica el curso y no invita a volver a rendir tras el único intento', async () => {
    const { el } = await open('carla@ejemplo.test', '/cursos/c1/examen/resultado', ExamResult);
    expect(text(el.querySelector('.course-name'))).toBe('Curso: Curso de demostración (nombre provisional)');
    expect(text(el.querySelector('.n'))).toBe('50 / 100');
    expect(text(el)).toContain('Desaprobado');
    expect(text(el)).toMatch(/Intentos disponibles\s*0 de 1/);
    expect(text(el)).toContain('No alcanzaste la nota mínima y ya no tienes intentos disponibles.');
    expect(text(el)).not.toContain('Volver a intentarlo');
    expect(text(el)).not.toContain('Puedes volver a intentarlo');
    expect(text(el)).toMatch(/Nota mínima configurada\s*60 \/ 100/);
  }, 20_000);

  it('mantiene el mensaje de aprobación y el acceso al certificado', async () => {
    const { el } = await open('ana@ejemplo.test', '/cursos/c1/examen/resultado', ExamResult);
    expect(text(el.querySelector('.course-name'))).toBe('Curso: Curso de demostración (nombre provisional)');
    expect(text(el)).toContain('¡Felicitaciones! Aprobaste el examen. Tu certificado ya está disponible.');
    expect(text(el.querySelector('.n'))).toBe('80 / 100');
    expect(el.querySelector('a[href="/certificados/cert1"]')).not.toBeNull();
  }, 20_000);

  it('identifica el curso también cuando aún no hay intentos', async () => {
    const { el } = await open('pedro@ejemplo.test', '/cursos/c-mkt/examen/resultado', ExamResult);
    expect(text(el.querySelector('.course-name'))).toBe('Curso: Fundamentos del Marketing Digital');
    expect(text(el)).toContain('Todavía no registras intentos del examen.');
  }, 20_000);

  it('si el intento es de un examen anterior y hay una evaluación nueva, la ofrece sin mostrar la nota mínima ajena', async () => {
    const { el } = await open('carla@ejemplo.test', '/cursos/c1/examen/resultado', ExamResult, (s) => {
      const old = s.exams.find((e) => e.id === 'c1-e1')!;
      old.active = false;
      s.exams.push({ ...old, id: 'c1-e2', active: true, passScore: 70 });
      const copies = s.questions.filter((q) => q.examId === 'c1-e1').map((q) => ({ ...q, id: `${q.id}-v2`, examId: 'c1-e2' }));
      s.questions.push(...copies);
    });
    expect(text(el.querySelector('.n'))).toBe('50 / 100'); // nota histórica intacta
    expect(text(el)).toContain('El curso tiene ahora una nueva evaluación disponible.');
    expect(el.querySelector('a[href="/cursos/c1/examen"]')).not.toBeNull();
    expect(text(el)).not.toContain('Nota mínima configurada');
  }, 20_000);
});
