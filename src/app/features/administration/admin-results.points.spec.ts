import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { AdminResults } from './admin-results';
import { DataRepository } from '../../core/services/data-repository';
import { MockDataRepository, STORAGE_KEY } from '../../core/services/mock-data-repository';
import { DemoState } from '../../core/data/demo-state';
import { Attempt } from '../../core/models/exam.model';

/**
 * Etapa 2B, Bloque 1 (P3): la columna «Correctas» se reemplaza por «Puntos obtenidos» (obtenido de máximo).
 * Los intentos anteriores no guardan el detalle por pregunta y no se recalculan. Datos ficticios.
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

const base: Omit<Attempt, 'id' | 'userId'> = {
  courseId: 'c1',
  examId: 'c1-e1',
  date: '2026-11-09T10:00:00-05:00',
  durationSec: 600,
  score: 97,
  scaleMax: 100,
  correctCount: 9,
  totalQuestions: 10,
  passed: true,
};

async function setup(attempts: Attempt[]) {
  localStorage.clear();
  sessionStorage.clear();
  new MockDataRepository().resetDemo();
  const s: DemoState = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
  s.attempts.push(...attempts);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: 'admin/resultados', component: AdminResults }], withComponentInputBinding()),
      { provide: DataRepository, useClass: MockDataRepository },
    ],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl('/admin/resultados?curso=c1', AdminResults);
  const el = harness.routeNativeElement as HTMLElement;
  await until(harness, () => !!el.querySelector('tr[data-attempt]'));
  const cell = (id: string) => text(el.querySelector(`tr[data-attempt="${id}"] [data-label="Puntos obtenidos"]`));
  return { el, cell };
}

describe('AdminResults: puntos obtenidos (Etapa 2B)', () => {
  it('muestra obtenido de máximo en los intentos nuevos, «Pendiente» en revisión y «No disponible» en los anteriores', async () => {
    const proportional = (q6: number) =>
      Object.fromEntries(['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8', 'q9', 'q10'].map((id) => [id, id === 'q6' ? q6 : 10]));
    const { el, cell } = await setup([
      { ...base, id: 'att-new', userId: 'u5', gradingRule: 'proporcional', questionScores: proportional(20 / 3), maxPoints: 100 },
      {
        ...base,
        id: 'att-graded',
        userId: 'u2',
        score: 92,
        gradingRule: 'proporcional',
        questionScores: { q1: 10, q2: 8, q3: 4 },
        maxPoints: 50,
        review: { status: 'calificado', manualScores: { qo: 12.5 }, gradedAt: '2026-11-09T12:00:00-05:00' },
      },
      {
        ...base,
        id: 'att-review',
        userId: 'u4',
        score: 0,
        passed: false,
        gradingRule: 'proporcional',
        questionScores: { q1: 10 },
        maxPoints: 100,
        review: { status: 'en_revision', manualScores: {} },
      },
    ]);
    expect(text(el.querySelector('tr[data-attempt]')!.closest('table')!.querySelector('thead'))).toContain('Puntos obtenidos');
    expect(cell('att-new')).toBe('96,67 de 100');
    expect(cell('att-graded')).toBe('34,5 de 50'); // automáticos + abierta calificada
    expect(cell('att-review')).toBe('Pendiente');
    expect(cell('att1')).toBe('No disponible (intento anterior a la calificación proporcional)');
    // La nota guardada no cambia.
    expect(text(el.querySelector('tr[data-attempt="att1"] [data-label="Nota"]'))).toBe('80 / 100');
  }, 20_000);
});
