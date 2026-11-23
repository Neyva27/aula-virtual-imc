import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { firstValueFrom } from 'rxjs';
import { ExamInstructions } from './instructions/instructions';
import { Exam } from './exam/exam';
import { AuthService } from '../../core/services/auth.service';
import { DataRepository } from '../../core/services/data-repository';
import { MockDataRepository } from '../../core/services/mock-data-repository';
import { ExamSessionService } from '../../core/services/exam-session.service';
import { SEED_QUESTIONS } from '../../core/data/seed';
import { DEMO_CONFIG } from '../../core/config/demo.config';

/** Regla de un solo intento vista desde las pantallas del alumno (sin modificarlas). Datos ficticios. */
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

async function setup(email: string) {
  localStorage.clear();
  sessionStorage.clear();
  TestBed.configureTestingModule({
    providers: [
      provideRouter(
        [
          { path: 'cursos/:courseId/examen', component: ExamInstructions },
          { path: 'cursos/:courseId/examen/rendir', component: Exam },
        ],
        withComponentInputBinding(),
      ),
      { provide: DataRepository, useClass: MockDataRepository },
    ],
  });
  const repo = TestBed.inject(DataRepository);
  await firstValueFrom(TestBed.inject(AuthService).login(email, DEMO_CONFIG.demoPassword));
  const harness = await RouterTestingHarness.create();
  return { repo, harness };
}

const startButton = (el: HTMLElement) =>
  [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => /Comenzar examen|Continuar examen/.test(text(b)))!;

describe('Un solo intento en las pantallas del alumno', () => {
  it('quien no rindió ve 1 de 1 intentos y puede comenzar', async () => {
    const { harness } = await setup('rosa@ejemplo.test');
    await harness.navigateByUrl('/cursos/c1/examen', ExamInstructions);
    const el = harness.routeNativeElement as HTMLElement;
    await until(harness, () => !!startButton(el));
    expect(text(el)).toMatch(/Intentos disponibles\s*1 de 1/);
    expect(startButton(el).disabled).toBe(false);
  }, 20_000);

  it('quien ya consumió su intento no puede comenzar desde las instrucciones', async () => {
    const { harness } = await setup('carla@ejemplo.test');
    await harness.navigateByUrl('/cursos/c1/examen', ExamInstructions);
    const el = harness.routeNativeElement as HTMLElement;
    await until(harness, () => text(el).includes('Alcanzaste el límite de intentos permitidos.'));
    expect(text(el)).toMatch(/Intentos disponibles\s*0 de 1/);
    // F3.2: con el examen bloqueado no se ofrece el botón para comenzar (antes aparecía deshabilitado).
    expect(startButton(el)).toBeUndefined();
    // Invocar la acción directamente tampoco inicia una sesión de examen.
    harness.routeDebugElement!.componentInstance.start();
    expect(TestBed.inject(ExamSessionService).session()).toBeNull();
    expect(TestBed.inject(Router).url).toBe('/cursos/c1/examen');
  }, 20_000);

  it('sin sesión, la ruta directa del examen devuelve a las instrucciones', async () => {
    const { harness } = await setup('carla@ejemplo.test');
    await harness.navigateByUrl('/cursos/c1/examen/rendir');
    await until(harness, () => TestBed.inject(Router).url === '/cursos/c1/examen');
    expect(TestBed.inject(Router).url).toBe('/cursos/c1/examen');
  }, 20_000);

  it('con una sesión iniciada por otra vía, la entrega se rechaza y no registra otro intento', async () => {
    const { repo, harness } = await setup('carla@ejemplo.test');
    // Sesión «colada» (por ejemplo, iniciada antes de la regla o manipulando el navegador).
    const session = TestBed.inject(ExamSessionService);
    session.start('u3', 20, 'c1-e1');
    // Etapa 2B (D3): respuestas completas, para que la entrega voluntaria llegue al repositorio y este la rechace.
    for (const q of SEED_QUESTIONS) session.setAnswer(q.id, [...q.correct]);
    await harness.navigateByUrl('/cursos/c1/examen/rendir', Exam);
    const el = harness.routeNativeElement as HTMLElement;
    await until(harness, () => !!el.querySelector('.opts input'));
    [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => text(b) === 'Finalizar y enviar')!.click();
    await harness.fixture.whenStable();
    [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => text(b) === 'Sí, enviar')!.click();
    await until(harness, () => !!el.querySelector('.alert-danger'));
    expect(text(el.querySelector('.alert-danger'))).toBe('Alcanzaste el límite de intentos permitidos.');
    expect(TestBed.inject(Router).url).toBe('/cursos/c1/examen/rendir');
    expect((await firstValueFrom(repo.listAttempts({ userId: 'u3' }))).map((a) => a.id)).toEqual(['att2']);
  }, 20_000);
});
