import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { firstValueFrom } from 'rxjs';
import { routes } from '../../app.routes';
import { AuthService } from '../../core/services/auth.service';
import { DataRepository } from '../../core/services/data-repository';
import { MockDataRepository, STORAGE_KEY } from '../../core/services/mock-data-repository';
import { DemoState } from '../../core/data/demo-state';
import { SEED_QUESTIONS } from '../../core/data/seed';
import { DEMO_CONFIG } from '../../core/config/demo.config';
import { addQuestionKeepingScale } from '../../core/services/testing/exam-points';

/**
 * M6: tarjeta «Certificados obtenidos» de «Mi progreso». Se calcula de los datos del alumno autenticado:
 * solo certificados vigentes y propios. Los estados especiales se preparan en el almacenamiento aislado de la prueba.
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

/** Abre /progreso como `email`; `prepare` modifica antes los datos guardados (con otra instancia del repositorio). */
async function cardFor(
  email: string,
  prepare?: (repo: MockDataRepository, s: DemoState) => Promise<void> | void,
  keepStorage = false,
): Promise<string> {
  if (keepStorage) {
    // Mismo almacenamiento de la carga anterior (por ejemplo, para calificar después de rendir).
    await prepare?.(new MockDataRepository(), JSON.parse(localStorage.getItem(STORAGE_KEY)!));
  } else {
    localStorage.clear();
    sessionStorage.clear();
  }
  if (prepare && !keepStorage) {
    new MockDataRepository().resetDemo();
    const s: DemoState = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    await prepare(new MockDataRepository(), s);
  }
  TestBed.configureTestingModule({
    providers: [provideRouter(routes, withComponentInputBinding()), { provide: DataRepository, useClass: MockDataRepository }],
  });
  await firstValueFrom(TestBed.inject(AuthService).login(email, DEMO_CONFIG.demoPassword));
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl('/progreso');
  const root = harness.fixture.nativeElement as HTMLElement;
  await until(harness, () => !!root.querySelector('[data-summary="certificates"]'));
  const card = root.querySelector('[data-summary="certificates"]')!;
  expect(text(card.querySelector('dt'))).toBe('Certificados obtenidos');
  return text(card.querySelector('dd'));
}

/** Sin intentos en c1-e1 y con una pregunta abierta, para que Rosa (u5) rinda y quede en revisión. */
async function rosaInReview(repo: MockDataRepository, s: DemoState): Promise<{ attemptId: string; openId: string }> {
  s.attempts = [];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  const fresh = new MockDataRepository();
  // Etapa 2A: c1 está publicado; la abierta se agrega manteniendo la suma exacta de 100 (las 10 de selección pasan a 9).
  const list = await addQuestionKeepingScale(fresh, 'c1', 'c1-e1', {
    id: '', type: 'open', text: 'Explica un riesgo.', options: [], correct: [], points: 10,
  });
  const openId = list.find((q) => q.type === 'open')!.id;
  const all = { ...Object.fromEntries(SEED_QUESTIONS.map((q) => [q.id, [...q.correct]])), [openId]: ['Respuesta'] };
  const attempt = await firstValueFrom(fresh.submitExamAttempt('u5', 'c1-e1', all, 120));
  void repo;
  return { attemptId: attempt.id, openId };
}

describe('«Certificados obtenidos» en Mi progreso (M6)', () => {
  it('cuenta el certificado vigente de Ana', async () => {
    expect(await cardFor('ana@ejemplo.test')).toBe('1');
  });

  it('no cuenta aprobaciones sin certificado emitido ni desaprobaciones', async () => {
    expect(await cardFor('jorge@ejemplo.test')).toBe('0'); // aprobado, certificado pendiente de emisión
    TestBed.resetTestingModule();
    expect(await cardFor('carla@ejemplo.test')).toBe('0'); // desaprobada
  });

  it('no cuenta certificados revocados', async () => {
    const value = await cardFor('ana@ejemplo.test', (_repo, s) => {
      s.certificates = s.certificates.map((c) => ({ ...c, status: 'revocado' as const }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    });
    expect(value).toBe('0');
  });

  it('no cuenta certificados de otros alumnos', async () => {
    expect(await cardFor('luis@ejemplo.test')).toBe('0'); // el único certificado de la semilla es de Ana
  });

  it('una evaluación en revisión no cuenta; al aprobar en la calificación pasa a 1', async () => {
    let ids = { attemptId: '', openId: '' };
    expect(
      await cardFor('rosa@ejemplo.test', async (repo, s) => {
        ids = await rosaInReview(repo, s);
      }),
    ).toBe('0');
    // El administrador califica (en otro momento): al volver a abrir «Mi progreso», el certificado ya cuenta.
    TestBed.resetTestingModule();
    const value = await cardFor('rosa@ejemplo.test', async () => {
      const s: DemoState = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
      expect(s.attempts.some((a) => a.id === ids.attemptId)).toBe(true);
      await firstValueFrom(new MockDataRepository().gradeOpenAnswers(ids.attemptId, [{ questionId: ids.openId, score: 10 }]));
    }, true);
    expect(value).toBe('1');
  }, 20_000); // Etapa 2A: preparación con el flujo real de puntajes
});
