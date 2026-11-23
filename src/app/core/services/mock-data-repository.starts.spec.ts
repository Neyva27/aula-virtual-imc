import { Observable, firstValueFrom } from 'rxjs';
import { MockDataRepository, STORAGE_KEY } from './mock-data-repository';
import { SEED_QUESTIONS } from '../data/seed';
import { DemoState } from '../data/demo-state';
import { EXAM_LOCKED_MESSAGE } from '../models/exam.model';
import { registerExamStart } from './testing/exam-starts';

/**
 * Etapa 2B, Bloque 2 (R2): inicio del examen regular registrado en el repositorio (`examStarts`), recuperable al
 * recargar o desde otra pestaña sin reiniciar el tiempo. Estado aislado en el localStorage de la prueba.
 * Cada `new MockDataRepository()` equivale a una pestaña: tiene su propia copia en memoria. Datos ficticios.
 */
const run = <T>(obs: Observable<T>): Promise<T> => firstValueFrom(obs);
const fails = async (obs: Observable<unknown>): Promise<string> => {
  try {
    await run(obs);
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error('Se esperaba un error');
};
const stored = (): DemoState => JSON.parse(localStorage.getItem(STORAGE_KEY)!);
const EXAM = 'c1-e1';
const MIN = 60_000;
const allCorrect = (): Record<string, string[]> => Object.fromEntries(SEED_QUESTIONS.map((q) => [q.id, [...q.correct]]));

/** Semilla guardada con cambios; devuelve una «pestaña» (repositorio) que la lee. */
function withState(edit: (s: DemoState) => void = () => undefined): MockDataRepository {
  new MockDataRepository().resetDemo();
  const s = stored();
  edit(s);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  return new MockDataRepository();
}
const startsOf = (userId: string) => stored().examStarts.filter((s) => s.userId === userId);

describe('Etapa 2B, Bloque 2 (R2): registro del inicio del examen', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  afterEach(() => vi.restoreAllMocks());

  describe('startExam', () => {
    it('registra el inicio del examen regular disponible con la duración configurada, sin crear intentos', async () => {
      const repo = withState();
      const before = stored();
      const t0 = Date.now();
      const r = await run(repo.startExam('u5', 'c1'));
      expect(r.exam).toMatchObject({ id: EXAM, courseId: 'c1', timeMinutes: 20, maxAttempts: 1 });
      expect(r.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}-05:00$/); // hora de Lima
      expect(Date.parse(r.startedAt)).toBeGreaterThanOrEqual(t0 - 5);
      expect(Date.parse(r.endsAt) - Date.parse(r.startedAt)).toBe(20 * MIN);
      expect(startsOf('u5')).toEqual([{ userId: 'u5', examId: EXAM, startedAt: r.startedAt, endsAt: r.endsAt }]);
      // Registrar un inicio no crea intentos ni cambia la inscripción, los intentos o los certificados.
      expect(stored().attempts).toEqual(before.attempts);
      expect(stored().certificates).toEqual(before.certificates);
      expect(stored().enrollments).toEqual(before.enrollments);
    });

    it('al recargar (otra llamada) recupera el mismo inicio, sin duplicarlo ni reiniciar el tiempo', async () => {
      const repo = withState();
      const first = await run(repo.startExam('u5', 'c1'));
      const later = Date.parse(first.startedAt) + 7 * MIN;
      vi.spyOn(Date, 'now').mockReturnValue(later); // 7 minutos después del inicio
      const again = await run(new MockDataRepository().startExam('u5', 'c1')); // página recargada
      expect(again).toEqual(first);
      expect(Date.parse(again.endsAt) - later).toBe(13 * MIN); // el tiempo restante se cuenta desde el inicio original
      expect(startsOf('u5')).toHaveLength(1);
    });

    it('una segunda pestaña abierta antes del inicio no crea otro: lee el inicio de la primera', async () => {
      withState();
      const tabA = new MockDataRepository();
      const tabB = new MockDataRepository(); // memoria cargada antes de que A registre el inicio
      const a = await run(tabA.startExam('u5', 'c1'));
      const b = await run(tabB.startExam('u5', 'c1'));
      expect(b).toEqual(a);
      expect(startsOf('u5')).toHaveLength(1);
    });

    // Corrección de R3 (regla A): un examen iniciado cuyo tiempo terminó sin entrega se entrega automáticamente; el
    // tiempo no se reinicia ni se abre otro inicio.
    it('con el tiempo ya agotado y sin entregar, se entrega automáticamente y no se reinicia', async () => {
      const now = Date.now();
      registerExamStart('u5', EXAM, now - 30 * MIN, now - 10 * MIN);
      expect(await fails(new MockDataRepository().startExam('u5', 'c1'))).toBe('Alcanzaste el límite de intentos permitidos.');
      expect(startsOf('u5')).toHaveLength(1);
      expect(stored().attempts.filter((a) => a.userId === 'u5')).toMatchObject([{ score: 0, autoSubmitted: true, durationSec: 20 * 60 }]);
    });

    it('cada estudiante y cada examen tienen su propio inicio', async () => {
      const repo = withState((s) => {
        s.attempts = s.attempts.filter((a) => a.userId !== 'u6');
        s.enrollments.find((e) => e.userId === 'u6' && e.courseId === 'c1')!.status = 'listo_examen';
        s.certificates = s.certificates.filter((c) => c.userId !== 'u6');
      });
      const rosa = await run(repo.startExam('u5', 'c1'));
      const jorge = await run(repo.startExam('u6', 'c1'));
      expect(stored().examStarts.map((s) => s.userId)).toEqual(['u5', 'u6']);
      expect(jorge.startedAt >= rosa.startedAt).toBe(true);
    });

    it.each([
      ['RN-07: ya usó su único intento', 'u3', 'c1', (_s: DemoState) => undefined, 'Alcanzaste el límite de intentos permitidos.'],
      ['ya aprobó', 'u1', 'c1', (_s: DemoState) => undefined, 'Ya aprobaste este examen.'],
      ['RN-11: videos pendientes', 'u2', 'c1', (_s: DemoState) => undefined, 'Debes completar todos los videos antes de rendir el examen.'],
      ['curso en borrador', 'u4', 'c-ia', (_s: DemoState) => undefined, 'El curso está en borrador'],
      ['sin curso asignado', 'u6', 'c-ia', (_s: DemoState) => undefined, 'No tienes un curso asignado.'],
      [
        'Etapa 2A: suma de puntajes distinta de la nota máxima',
        'u5',
        'c1',
        (s: DemoState) => {
          s.attempts = [];
          s.questions.find((q) => q.id === 'q1')!.points = 5;
        },
        'la suma de los puntajes de sus preguntas no coincide con la nota máxima',
      ],
    ])('no permite iniciar un examen no disponible (%s) y no registra nada', async (_label, userId, courseId, edit, reason) => {
      const repo = withState(edit);
      expect(await fails(repo.startExam(userId, courseId))).toContain(reason);
      expect(stored().examStarts).toEqual([]);
    });

    it('un curso sin examen no se puede iniciar', async () => {
      const repo = withState((s) => (s.exams = s.exams.filter((e) => e.courseId !== 'c1')));
      expect(await fails(repo.startExam('u5', 'c1'))).toBe('El curso no tiene un examen activo.');
    });
  });

  describe('getStudentExam', () => {
    it('devuelve el examen regular del curso (por ahora no considera recuperaciones)', async () => {
      const repo = withState((s) =>
        s.exams.unshift({ ...s.exams.find((e) => e.id === EXAM)!, id: 'c1-rec', kind: 'recuperacion', parentExamId: EXAM }),
      );
      expect(await run(repo.getStudentExam('u5', 'c1'))).toMatchObject({ id: EXAM, maxAttempts: 1 });
      expect(await run(repo.getStudentExam('u5', 'c-ia'))).toMatchObject({ id: 'c-ia-e1' });
      const none = withState((s) => (s.exams = s.exams.filter((e) => e.courseId !== 'c1')));
      expect(await run(none.getStudentExam('u5', 'c1'))).toBeNull();
    });
  });

  describe('entrega con el inicio registrado', () => {
    it('la entrega voluntaria y la calificación proporcional no cambian', async () => {
      const repo = withState();
      await run(repo.startExam('u5', 'c1'));
      expect(await fails(repo.submitExamAttempt('u5', EXAM, { ...allCorrect(), q3: [] }, 60))).toContain('Falta completar la pregunta 3.');
      const attempt = await run(repo.submitExamAttempt('u5', EXAM, { ...allCorrect(), q8: ['b', 'a'] }, 60));
      expect(attempt).toMatchObject({ score: 95, passed: true, gradingRule: 'proporcional', durationSec: 60 });
      expect(await fails(repo.startExam('u5', 'c1'))).toBe('Ya aprobaste este examen.'); // RN-07 / aprobado
    });

    it('«tiempo agotado» se decide con el fin registrado, no con la duración que informa el navegador', async () => {
      const repo = withState();
      await run(repo.startExam('u5', 'c1'));
      expect(await fails(repo.submitExamAttempt('u5', EXAM, {}, 20 * 60, 'tiempo'))).toBe(
        'La entrega automática solo se admite cuando se agotó el tiempo del examen.',
      );
      expect(stored().attempts.filter((a) => a.userId === 'u5')).toEqual([]);
    });

    it('con el fin registrado ya pasado, la entrega por tiempo se acepta y califica lo registrado', async () => {
      const now = Date.now();
      // Corrección de R3: «lo registrado» son las respuestas guardadas en el repositorio, no las que manda la página.
      registerExamStart('u5', EXAM, now - 20 * MIN, now - 1000, { q1: ['b'], q8: ['b'] });
      const repo = new MockDataRepository();
      const attempt = await run(repo.submitExamAttempt('u5', EXAM, { q1: ['b'], q2: ['c'], q8: ['b'] }, 20 * 60, 'tiempo'));
      expect(attempt).toMatchObject({ score: 15, passed: false });
      expect(attempt.answers).toEqual({ q1: ['b'], q8: ['b'] });
    });

    it('dos pestañas: la segunda entrega ve el intento de la primera (RN-07)', async () => {
      withState();
      const tabA = new MockDataRepository();
      const tabB = new MockDataRepository();
      await run(tabA.startExam('u5', 'c1'));
      await run(tabB.startExam('u5', 'c1'));
      await run(tabA.submitExamAttempt('u5', EXAM, allCorrect(), 60));
      expect(await fails(tabB.submitExamAttempt('u5', EXAM, allCorrect(), 60))).toBe('Ya aprobaste este examen.');
      expect(stored().attempts.filter((a) => a.userId === 'u5')).toHaveLength(1);
    });

    it('RN-15: la evaluación con intentos sigue bloqueada; un inicio sin entregar no la bloquea', async () => {
      const repo = withState(); // la semilla tiene intentos en c1-e1
      await run(repo.startExam('u5', 'c1'));
      const { examId: _e, ...q1 } = (await run(repo.getExamQuestions(EXAM))).find((q) => q.id === 'q1')!;
      expect(await fails(repo.saveExamQuestion(EXAM, { ...q1, text: 'Cambio' }))).toBe(EXAM_LOCKED_MESSAGE);
      // Sin intentos (con el curso en borrador, Etapa 2A), un inicio registrado no es un intento: se puede editar.
      withState((s) => {
        s.attempts = [];
        s.courses.find((c) => c.id === 'c1')!.status = 'borrador';
      });
      registerExamStart('u5', EXAM, Date.now(), Date.now() + 20 * MIN);
      const list = await run(new MockDataRepository().saveExamQuestion(EXAM, { ...q1, text: 'Cambio' }));
      expect(list.find((q) => q.id === 'q1')!.text).toBe('Cambio');
    });

    it('los intentos y certificados históricos permanecen intactos', async () => {
      const repo = withState();
      const before = stored();
      await run(repo.startExam('u5', 'c1'));
      await run(repo.submitExamAttempt('u5', EXAM, allCorrect(), 60));
      const after = stored();
      expect(after.attempts.slice(0, before.attempts.length)).toEqual(before.attempts);
      expect(after.certificates.slice(0, before.certificates.length)).toEqual(before.certificates);
    });
  });
});
