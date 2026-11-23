import { MockDataRepository, STORAGE_KEY } from '../mock-data-repository';
import { DemoState } from '../../data/demo-state';

/**
 * SOLO PARA PRUEBAS (Etapa 2B, Bloque 2, R2). Desde R2 el inicio del examen lo registra el repositorio y es la
 * fuente de verdad del tiempo. Para simular un examen que empezó antes (por ejemplo, al que le quedan 2 segundos),
 * la prueba debe registrar ese inicio en el estado guardado, como lo habría hecho `startExam`.
 * Si el localStorage de la prueba está vacío, primero guarda la semilla.
 */
export function registerExamStart(
  userId: string,
  examId: string,
  startedAt: number,
  endsAt: number,
  answers?: Record<string, string[]>,
): void {
  if (localStorage.getItem(STORAGE_KEY) === null) new MockDataRepository().resetDemo();
  const state: DemoState = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
  state.examStarts = [
    ...(state.examStarts ?? []).filter((s) => !(s.userId === userId && s.examId === examId && !s.recoveryId)),
    // Corrección de R3: con `answers`, como si el estudiante las hubiera guardado al responder.
    { userId, examId, startedAt: new Date(startedAt).toISOString(), endsAt: new Date(endsAt).toISOString(), ...(answers ? { answers } : {}) },
  ];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
