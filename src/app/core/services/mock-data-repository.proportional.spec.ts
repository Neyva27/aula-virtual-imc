import { Observable, firstValueFrom } from 'rxjs';
import { MockDataRepository, STORAGE_KEY } from './mock-data-repository';
import { SEED_QUESTIONS } from '../data/seed';
import { DemoState } from '../data/demo-state';
import { Attempt, EXAM_LOCKED_MESSAGE, ExamQuestion, Question, SubmitMode, attemptPoints } from '../models/exam.model';

/**
 * Etapa 2B, Bloque 1 (decisiones P1–P4 y D1–D4 del 09/11/2026): configuración de la cantidad exigida, entrega
 * voluntaria y por tiempo agotado, calificación proporcional y protección de los intentos anteriores.
 * Estado aislado en el localStorage de la prueba. Datos ficticios.
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
const stored = (): DemoState => JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
const EXAM = 'c1-e1';
const TIME_UP = 20 * 60; // tiempo de la demostración
const opts = (n: number) => 'abcdefgh'.slice(0, n).split('').map((id) => ({ id, text: `Opción ${id}` }));

function withState(edit: (s: DemoState) => void): MockDataRepository {
  new MockDataRepository().resetDemo();
  const s = stored();
  edit(s);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  return new MockDataRepository();
}
/** c1 publicado, sin intentos ni certificados de u5: u5 puede rendir. Suma 100 (10 preguntas × 10). */
const ready = (edit: (s: DemoState) => void = () => undefined) =>
  withState((s) => {
    s.attempts = [];
    edit(s);
  });
/** c1 en borrador y sin intentos: el instructor edita libremente (Etapa 2A). */
const draft = () =>
  withState((s) => {
    s.attempts = [];
    s.courses.find((c) => c.id === 'c1')!.status = 'borrador';
  });

const allCorrect = (): Record<string, string[]> => Object.fromEntries(SEED_QUESTIONS.map((q) => [q.id, [...q.correct]]));
const submit = (repo: MockDataRepository, answers: Record<string, string[]>, mode: SubmitMode = 'voluntaria', duration = 300) =>
  run(repo.submitExamAttempt('u5', EXAM, answers, mode === 'tiempo' ? TIME_UP : duration, mode));
const multiple = (over: Partial<Question> = {}): Question => ({
  id: '',
  type: 'multiple',
  text: 'Selecciona las correctas',
  options: opts(4),
  correct: ['a', 'b'],
  points: 10,
  ...over,
});
const last = (list: ExamQuestion[]) => list.at(-1)!;

describe('Etapa 2B, Bloque 1: calificación proporcional en el repositorio', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  describe('configuración de la cantidad exigida (P1, P2)', () => {
    it('sin valor, guarda tantas como respuestas correctas; con valor válido, lo guarda', async () => {
      const repo = draft();
      expect(last(await run(repo.saveExamQuestion(EXAM, multiple())))).toMatchObject({ selectCount: 2 });
      expect(last(await run(repo.saveExamQuestion(EXAM, multiple({ selectCount: 3 }))))).toMatchObject({ selectCount: 3 });
    });

    it('rechaza cantidades fuera del rango correctas ≤ exigidas < alternativas', async () => {
      const repo = draft();
      const before = stored().questions.length;
      expect(await fails(repo.saveExamQuestion(EXAM, multiple({ selectCount: 1 })))).toBe(
        'La cantidad de alternativas a seleccionar no puede ser menor que la cantidad de respuestas correctas (2).',
      );
      expect(await fails(repo.saveExamQuestion(EXAM, multiple({ selectCount: 4 })))).toBe(
        'La cantidad de alternativas a seleccionar debe ser menor que el total de alternativas (4).',
      );
      expect(await fails(repo.saveExamQuestion(EXAM, multiple({ selectCount: 2.5 })))).toContain('número entero');
      expect(await fails(repo.saveExamQuestion(EXAM, multiple({ correct: ['a', 'b', 'c', 'd'] })))).toBe(
        'En selección múltiple, al menos una alternativa debe ser incorrecta.',
      );
      expect(stored().questions.length).toBe(before);
    });

    it('las preguntas que no son de selección múltiple no guardan la cantidad', async () => {
      const repo = draft();
      const single = last(await run(repo.saveExamQuestion(EXAM, multiple({ type: 'single', correct: ['a'], selectCount: 3 }))));
      expect('selectCount' in single).toBe(false);
      const open = last(
        await run(repo.saveExamQuestion(EXAM, { id: '', type: 'open', text: 'Explica', options: [], correct: [], points: 5, selectCount: 2 })),
      );
      expect('selectCount' in open).toBe(false);
    });

    it('las preguntas guardadas antes de la 2B (sin cantidad) exigen tantas como correctas y se pueden editar', async () => {
      const repo = draft();
      const q6 = (await run(repo.getExamQuestions(EXAM))).find((q) => q.id === 'q6')!;
      expect(q6.selectCount).toBeUndefined();
      const { examId: _e, ...plain } = q6;
      const list = await run(repo.saveExamQuestion(EXAM, { ...plain, text: 'Selecciona los números pares.' }));
      expect(list.find((q) => q.id === 'q6')).toMatchObject({ selectCount: 3, correct: ['a', 'c', 'e'] });
    });

    it('RN-15: con intentos registrados no se puede cambiar la cantidad exigida', async () => {
      const repo = new MockDataRepository(); // la semilla tiene intentos en c1-e1
      const { examId: _e, ...q6 } = (await run(repo.getExamQuestions(EXAM))).find((q) => q.id === 'q6')!;
      expect(await fails(repo.saveExamQuestion(EXAM, { ...q6, selectCount: 4 }))).toBe(EXAM_LOCKED_MESSAGE);
    });

    it('Etapa 2A: con el curso publicado, cambiar solo la cantidad mantiene la suma y se acepta', async () => {
      const repo = ready();
      const { examId: _e, ...q6 } = (await run(repo.getExamQuestions(EXAM))).find((q) => q.id === 'q6')!;
      const list = await run(repo.saveExamQuestion(EXAM, { ...q6, selectCount: 4 }));
      expect(list.find((q) => q.id === 'q6')!.selectCount).toBe(4);
    });
  });

  describe('entrega voluntaria (D3): todo completo, validado también en el repositorio', () => {
    it('con todas las preguntas completas se registra con la regla proporcional', async () => {
      const attempt = await submit(ready(), allCorrect());
      expect(attempt).toMatchObject({ score: 100, passed: true, gradingRule: 'proporcional', correctCount: 10 });
      expect(attempt.questionScores).toEqual(Object.fromEntries(SEED_QUESTIONS.map((q) => [q.id, 10])));
    });

    it.each([
      ['una pregunta sin responder', { q2: [] }, 'Falta completar la pregunta 2.'],
      ['selección múltiple con menos marcas', { q6: ['a', 'c'] }, 'Falta completar la pregunta 6.'],
      ['selección múltiple con más marcas', { q8: ['a', 'b', 'd'] }, 'Falta completar la pregunta 8.'],
      ['varias incompletas', { q1: [], q7: ['a'], q10: [] }, 'Falta completar las preguntas 1, 7, 10.'],
    ])('%s: se rechaza y no se registra el intento', async (_label, change, message) => {
      const repo = ready();
      expect(await fails(repo.submitExamAttempt('u5', EXAM, { ...allCorrect(), ...change }, 300, 'voluntaria'))).toBe(
        `Para entregar debes completar todas las preguntas. ${message}`,
      );
      expect(stored().attempts).toEqual([]);
      expect(stored().enrollments.find((e) => e.userId === 'u5' && e.courseId === 'c1')!.status).not.toBe('desaprobado');
    });

    it('sin indicar el modo, la entrega es voluntaria (también en el método heredado)', async () => {
      const repo = ready();
      const incomplete = { ...allCorrect(), q3: [] };
      expect(await fails(repo.submitExamAttempt('u5', EXAM, incomplete, 300))).toContain('Falta completar la pregunta 3.');
      expect(await fails(repo.submitAttempt('u5', incomplete, 300))).toContain('Falta completar la pregunta 3.');
      expect(await fails(repo.submitExamAttempt('u5', EXAM, incomplete, 300, 'otro' as SubmitMode))).toBe('Tipo de entrega no válido.');
    });
  });

  describe('entrega por tiempo agotado (P4)', () => {
    it('envía solo lo registrado: completas normales, parciales en proporción y sin responder en cero', async () => {
      const answers = { ...allCorrect(), q1: [], q6: ['a'], q8: ['b'] }; // q1 vacía; q6 1 de 3; q8 1 de 2
      const attempt = await submit(ready(), answers, 'tiempo');
      expect(attempt.questionScores).toMatchObject({ q1: 0, q8: 5 });
      expect(attempt.questionScores!['q6']).toBeCloseTo(10 / 3, 10);
      expect(attempt.score).toBe(Math.round(70 + 10 / 3 + 5)); // 78,33 → 78
      expect(attempt.answers!['q1']).toBeUndefined(); // no se inventan respuestas
      expect(attempt.answers!['q6']).toEqual(['a']);
    });

    it('sin ninguna respuesta registra un intento con nota 0', async () => {
      const attempt = await submit(ready(), {}, 'tiempo');
      expect(attempt).toMatchObject({ score: 0, passed: false, answers: {}, gradingRule: 'proporcional' });
    });

    it('no se admite antes de que se agote el tiempo del examen', async () => {
      const repo = ready();
      expect(await fails(repo.submitExamAttempt('u5', EXAM, {}, 10 * 60, 'tiempo'))).toBe(
        'La entrega automática solo se admite cuando se agotó el tiempo del examen.',
      );
      expect(stored().attempts).toEqual([]);
    });

    it('más marcas que las exigidas (envío manipulado) valen 0 en esa pregunta', async () => {
      const attempt = await submit(ready(), { ...allCorrect(), q8: ['a', 'b', 'c', 'd'] }, 'tiempo');
      expect(attempt.questionScores!['q8']).toBe(0);
      expect(attempt.score).toBe(90);
    });
  });

  describe('ejemplos aprobados en un examen real', () => {
    // q8 de la semilla: 10 puntos, 4 alternativas, 2 correctas (b, d), 2 exigidas.
    it.each([
      ['2 correctas', ['b', 'd'], 'voluntaria', 10],
      ['1 correcta y 1 incorrecta', ['b', 'a'], 'voluntaria', 5],
      ['2 incorrectas', ['a', 'c'], 'voluntaria', 0],
      ['1 correcta (tiempo agotado)', ['b'], 'tiempo', 5],
      ['sin respuesta (tiempo agotado)', [], 'tiempo', 0],
    ] as const)('10 puntos, %s → %d', async (_label, q8, mode, expected) => {
      const attempt = await submit(ready(), { ...allCorrect(), q8: [...q8] }, mode);
      expect(attempt.questionScores!['q8']).toBe(expected);
      expect(attempt.score).toBe(90 + expected);
    });

    // q7 pasa a 20 puntos, 5 alternativas, 4 correctas y 4 exigidas; se quita q6 para mantener la suma en 100.
    const twenty = () =>
      ready((s) => {
        s.questions = s.questions.filter((q) => q.id !== 'q6');
        Object.assign(s.questions.find((q) => q.id === 'q7')!, { points: 20, correct: ['a', 'b', 'c', 'd'], selectCount: 4 });
      });
    const base = () => {
      const { q6: _q6, ...rest } = allCorrect();
      return rest;
    };
    it.each([
      [['a', 'b', 'c', 'd'], 'voluntaria', 20],
      [['a', 'b', 'c', 'e'], 'voluntaria', 15],
      [['a', 'b'], 'tiempo', 10],
    ] as const)('20 puntos, %j → %d', async (q7, mode, expected) => {
      const attempt = await submit(twenty(), { ...base(), q7: [...q7] }, mode);
      expect(attempt.questionScores!['q7']).toBe(expected);
      expect(attempt.score).toBe(80 + expected);
    });

    it('escala 20 (10 preguntas × 2 puntos): 1 de 2 correctas en q8 vale 1 punto', async () => {
      const repo = ready((s) => {
        s.questions.filter((q) => q.examId === EXAM).forEach((q) => (q.points = 2));
        Object.assign(s.exams.find((e) => e.id === EXAM)!, { scaleMax: 20, passScore: 11 });
      });
      const attempt = await submit(repo, { ...allCorrect(), q8: ['b', 'a'] });
      expect(attempt).toMatchObject({ score: 19, scaleMax: 20, passed: true });
      expect(attempt.questionScores!['q8']).toBe(1);
    });
  });

  describe('protección de los intentos anteriores (D4)', () => {
    it('rendir con la regla nueva no cambia los intentos ni los certificados existentes', async () => {
      const repo = withState(() => undefined); // semilla: c1 con 3 intentos y un certificado
      const before = stored();
      await submit(repo, { ...allCorrect(), q8: ['b', 'a'] });
      const after = stored();
      expect(after.attempts).toHaveLength(before.attempts.length + 1);
      expect(after.attempts.slice(0, before.attempts.length)).toEqual(before.attempts);
      expect(after.certificates.slice(0, before.certificates.length)).toEqual(before.certificates);
      expect(after.attempts.slice(0, 3).map((a) => [a.id, a.score, a.correctCount, a.gradingRule])).toEqual([
        ['att1', 80, 8, undefined],
        ['att2', 50, 5, undefined],
        ['att3', 90, 9, undefined],
      ]);
    });

    /** c1 con una pregunta abierta de 20 puntos (las otras 10 valen 8) y un intento de u5 «En revisión». */
    function inReview(attempt?: Partial<Attempt>): MockDataRepository {
      return withState((s) => {
        s.attempts = [];
        s.questions.filter((q) => q.examId === EXAM).forEach((q) => (q.points = 8));
        s.questions.push({ id: 'qo', examId: EXAM, type: 'open', text: 'Explica', options: [], correct: [], points: 20 });
        if (attempt) {
          s.attempts.push({
            id: 'att-old',
            userId: 'u5',
            courseId: 'c1',
            examId: EXAM,
            date: '2026-11-01T10:00:00-05:00',
            durationSec: 600,
            score: 0,
            scaleMax: 100,
            correctCount: 9,
            totalQuestions: 11,
            passed: false,
            answers: { ...allCorrect(), q6: ['a', 'c'], qo: ['Mi respuesta'] },
            review: { status: 'en_revision', manualScores: {} },
            ...attempt,
          });
          s.enrollments.find((e) => e.userId === 'u5' && e.courseId === 'c1')!.status = 'en_revision';
        }
      });
    }

    it('un intento «En revisión» anterior a la 2B se termina de calificar con «todo o nada»', async () => {
      const repo = inReview({});
      const graded = await run(repo.gradeOpenAnswers('att-old', [{ questionId: 'qo', score: 20 }]));
      // q6 parcial (2 de 3) no suma con «todo o nada»: 9 × 8 + 20 = 92 (con la regla nueva serían 97).
      expect(graded).toMatchObject({ score: 92, passed: true, correctCount: 9 });
      expect(graded.gradingRule).toBeUndefined();
      expect(stored().attempts[0].gradingRule).toBeUndefined();
    });

    it('un intento «En revisión» posterior a la 2B se termina de calificar con la regla proporcional', async () => {
      const repo = inReview();
      const sent = await submit(repo, { ...allCorrect(), q6: ['a', 'c', 'b'], qo: ['Mi respuesta'] });
      expect(sent).toMatchObject({ gradingRule: 'proporcional', review: { status: 'en_revision' } });
      const graded = await run(repo.gradeOpenAnswers(sent.id, [{ questionId: 'qo', score: 20 }]));
      expect(graded.score).toBe(97); // 9 × 8 + 8 × 2/3 + 20 = 97,33
      expect(graded.gradingRule).toBe('proporcional');
      // P3: puntos obtenidos guardados (automáticos + abierta calificada) frente al máximo.
      expect(attemptPoints(graded)).toEqual({ earned: 97.33, max: 100 });
    });

    it('P3: los intentos nuevos guardan el máximo y los puntos; los anteriores no tienen detalle (no se recalculan)', async () => {
      const repo = withState(() => undefined);
      const sent = await submit(repo, { ...allCorrect(), q8: ['b', 'a'] });
      expect(sent.maxPoints).toBe(100);
      expect(attemptPoints(sent)).toEqual({ earned: 95, max: 100 });
      expect(attemptPoints(stored().attempts.find((a) => a.id === 'att1')!)).toBeNull();
    });
  });
});
