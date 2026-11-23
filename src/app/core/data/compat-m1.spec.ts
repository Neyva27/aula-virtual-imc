import { firstValueFrom } from 'rxjs';
import { MockDataRepository, STORAGE_KEY } from '../services/mock-data-repository';
import { DemoState, isDemoState } from './demo-state';
import { isPendingReview } from '../models/exam.model';

/**
 * M1: los campos nuevos (descripción de módulo, fuente Drive, pregunta abierta, respuestas y revisión del intento)
 * son opcionales. Un estado v3 guardado antes de M1 se carga tal cual, sin migración ni pérdida de datos.
 */
describe('compatibilidad de los datos guardados (M1)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  function savedBeforeM1(): string {
    new MockDataRepository().resetDemo();
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY)!) as DemoState;
    // Un dato propio de la demostración, para comprobar que se conserva.
    s.modules.push({ id: 'c-ia-m2', courseId: 'c-ia', order: 2, title: 'Módulo agregado antes de M1' });
    const raw = JSON.stringify(s);
    localStorage.setItem(STORAGE_KEY, raw);
    return raw;
  }

  it('un estado guardado sin los campos nuevos sigue siendo válido y se carga sin cambios', async () => {
    const raw = savedBeforeM1();
    const parsed = JSON.parse(raw);
    expect(isDemoState(parsed)).toBe(true);
    expect(parsed.modules.every((m: object) => !('description' in m))).toBe(true);
    expect(parsed.attempts.every((a: object) => !('answers' in a) && !('review' in a))).toBe(true);

    const repo = new MockDataRepository();
    expect(repo.getStorageStatus().source).toBe('v4');
    expect(localStorage.getItem(STORAGE_KEY)).toBe(raw); // cargar no reescribe nada
    const content = await firstValueFrom(repo.getCourseContent('c-ia'));
    expect(content.modules.map((m) => m.id)).toEqual(['c-ia-m1', 'c-ia-m2']);
    expect((await firstValueFrom(repo.getUsers())).length).toBe(7);
  });

  it('los intentos anteriores (sin revisión) cuentan como calificados', async () => {
    savedBeforeM1();
    const attempts = await firstValueFrom(new MockDataRepository().listAttempts());
    expect(attempts.length).toBe(3);
    expect(attempts.some(isPendingReview)).toBe(false);
    expect(attempts.filter((a) => a.passed).length).toBe(2);
  });

  it('isPendingReview solo es verdadero con la revisión pendiente', () => {
    expect(isPendingReview({})).toBe(false);
    expect(isPendingReview({ review: { status: 'calificado', manualScores: {} } })).toBe(false);
    expect(isPendingReview({ review: { status: 'en_revision', manualScores: {} } })).toBe(true);
  });
});
