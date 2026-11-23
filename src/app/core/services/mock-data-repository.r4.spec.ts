import { Observable, firstValueFrom } from 'rxjs';
import { MockDataRepository, STORAGE_KEY } from './mock-data-repository';
import { DemoState } from '../data/demo-state';
import { SEED_QUESTIONS } from '../data/seed';
import { Attempt, courseResult } from '../models/exam.model';
import { RecoveryInput } from '../models/recovery.model';

/**
 * Etapa 2B, Bloque 2 (R4): la recuperación se integra con la nota final, la condición del estudiante y los
 * certificados. Regla confirmada: la nota de recuperación REEMPLAZA a la regular como nota vigente, incluso si es
 * menor (sin promedios); el intento regular se conserva. D-11: el certificado lleva la nota del intento aprobado.
 * Reloj controlado. Semilla: Carla (u3) desaprobó c1 con 50/100; Rosa (u5) no tiene intentos; Ana (u1) aprobó con
 * certificado IMC-DEMO-0001. Datos ficticios.
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
const MIN = 60_000;
const H = 60 * MIN;
const T0 = Date.parse('2026-11-12T08:00:00-05:00');
const iso = (ms: number) => new Date(ms).toISOString();
let clock = T0;

function withState(edit: (s: DemoState) => void = () => undefined): MockDataRepository {
  new MockDataRepository().resetDemo();
  const s = stored();
  edit(s);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  return new MockDataRepository();
}
const input = (over: Partial<RecoveryInput> = {}): RecoveryInput => ({
  userId: 'u3',
  courseId: 'c1',
  mode: 'original',
  opensAt: iso(T0 + 1 * H),
  closesAt: iso(T0 + 3 * H),
  ...over,
});
const allCorrect = (): Record<string, string[]> => Object.fromEntries(SEED_QUESTIONS.map((q) => [q.id, [...q.correct]]));
/**
 * Respuestas completas (válidas para la entrega voluntaria): las `n` primeras preguntas correctas y el resto con
 * alternativas incorrectas. En selección múltiple, si no hay suficientes incorrectas para completar la cantidad
 * exigida, se completan con correctas, así que esas preguntas suman un puntaje parcial (regla proporcional).
 */
function withCorrect(n: number): Record<string, string[]> {
  return Object.fromEntries(
    SEED_QUESTIONS.map((q, i) => {
      if (i < n) return [q.id, [...q.correct]];
      const wrong = q.options.filter((o) => !q.correct.includes(o.id)).map((o) => o.id);
      const k = q.type === 'multiple' ? (q.selectCount ?? q.correct.length) : 1;
      return [q.id, [...wrong, ...q.correct].slice(0, k)];
    }),
  );
}
const enrollmentOf = (userId: string) => stored().enrollments.find((e) => e.userId === userId && e.courseId === 'c1')!;
const certificatesOf = (userId: string) => stored().certificates.filter((c) => c.userId === userId);
const attemptsOf = (userId: string) => stored().attempts.filter((a) => a.userId === userId);
/** Carla con su recuperación autorizada e iniciada a las 09:00. */
async function carlaInRecovery(edit?: (s: DemoState) => void) {
  const repo = withState(edit);
  const rec = await run(repo.authorizeRecovery('a1', input()));
  clock = T0 + 1 * H;
  await run(repo.startExam('u3', 'c1'));
  return { repo, rec };
}
/** c1 con una pregunta abierta de 20 puntos (las otras 10 valen 8). */
const withOpen = (s: DemoState) => {
  s.questions.filter((q) => q.examId === 'c1-e1').forEach((q) => (q.points = 8));
  s.questions.push({ id: 'qo', examId: 'c1-e1', type: 'open', text: 'Explica', options: [], correct: [], points: 20 });
};

describe('R4: recuperación integrada con nota final, condición y certificados', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    clock = T0;
    vi.spyOn(Date, 'now').mockImplementation(() => clock);
  });
  afterEach(() => vi.restoreAllMocks());

  it('1-4. quien desaprobó y fue autorizado rinde la recuperación; el intento queda identificado y la regular se conserva', async () => {
    const { repo, rec } = await carlaInRecovery();
    const before = stored().attempts.find((a) => a.id === 'att2')!;
    const attempt = await run(repo.submitExamAttempt('u3', 'c1-e1', allCorrect(), 600));
    expect(attempt).toMatchObject({ kind: 'recuperacion', recoveryId: rec.id, userId: 'u3', courseId: 'c1', examId: 'c1-e1', score: 100 });
    expect(stored().recoveries[0].attemptId).toBe(attempt.id);
    expect(stored().attempts.find((a) => a.id === 'att2')).toEqual(before); // nota regular 50 intacta
    expect(attemptsOf('u3').map((a) => [a.id, a.kind ?? 'regular', a.score])).toEqual([
      ['att2', 'regular', 50],
      [attempt.id, 'recuperacion', 100],
    ]);
  });

  it('6 y 16. al aprobar la recuperación: condición «aprobado» y certificado con la nota de la recuperación (D-11)', async () => {
    const { repo } = await carlaInRecovery();
    const attempt = await run(repo.submitExamAttempt('u3', 'c1-e1', allCorrect(), 600));
    expect(enrollmentOf('u3').status).toBe('aprobado');
    expect(certificatesOf('u3')).toMatchObject([{ attemptId: attempt.id, score: 100, scaleMax: 100, courseId: 'c1', status: 'vigente' }]);
    expect(courseResult(attemptsOf('u3'))).toMatchObject({ final: { score: 100, scaleMax: 100 }, condition: 'aprobado', regularReplaced: true });
  });

  it('la nota de la recuperación reemplaza a la regular aunque sea menor (50 → 30): sin promedio', async () => {
    const { repo } = await carlaInRecovery();
    const answers = withCorrect(3);
    const attempt = await run(repo.submitExamAttempt('u3', 'c1-e1', answers, 600));
    expect(attempt.score).toBeLessThan(50);
    const result = courseResult(attemptsOf('u3'));
    expect(result.final).toEqual({ score: attempt.score, scaleMax: 100 }); // no 50, ni un promedio
    expect(result.regular).toMatchObject({ id: 'att2', score: 50 });
    expect(result.condition).toBe('desaprobado');
  });

  it('escala 20: regular 8 → recuperación 16 = nota final 16 y aprueba', async () => {
    const { repo } = await carlaInRecovery((s) => {
      s.questions.filter((q) => q.examId === 'c1-e1').forEach((q) => (q.points = 2));
      Object.assign(s.exams.find((e) => e.id === 'c1-e1')!, { scaleMax: 20, passScore: 11 });
      Object.assign(s.attempts.find((a) => a.id === 'att2')!, { score: 8, scaleMax: 20 });
    });
    const attempt = await run(repo.submitExamAttempt('u3', 'c1-e1', withCorrect(8), 600));
    expect(attempt).toMatchObject({ score: 16, scaleMax: 20, passed: true });
    expect(courseResult(attemptsOf('u3')).final).toEqual({ score: 16, scaleMax: 20 });
    expect(certificatesOf('u3')).toMatchObject([{ score: 16, scaleMax: 20 }]);
  });

  it('7 y 17. al desaprobar la recuperación: «desaprobado» y sin certificado', async () => {
    const { repo } = await carlaInRecovery();
    await run(repo.submitExamAttempt('u3', 'c1-e1', withCorrect(2), 600));
    expect(enrollmentOf('u3').status).toBe('desaprobado');
    expect(certificatesOf('u3')).toEqual([]);
  });

  describe('5 y 12. preguntas abiertas: sin aprobación ni certificado hasta calificar', () => {
    it('pendiente: condición «en revisión», sin nota final ni certificado', async () => {
      const { repo } = await carlaInRecovery(withOpen);
      const attempt = await run(repo.submitExamAttempt('u3', 'c1-e1', { ...allCorrect(), qo: ['Mi respuesta'] }, 600));
      expect(attempt).toMatchObject({ kind: 'recuperacion', review: { status: 'en_revision' }, passed: false });
      expect(enrollmentOf('u3').status).toBe('en_revision');
      expect(certificatesOf('u3')).toEqual([]);
      expect(courseResult(attemptsOf('u3'))).toMatchObject({ final: null, condition: 'en_revision' });
    });

    it('al completar la calificación se calcula la nota final, se actualiza la condición y, si aprueba, el certificado', async () => {
      const { repo } = await carlaInRecovery(withOpen);
      const sent = await run(repo.submitExamAttempt('u3', 'c1-e1', { ...allCorrect(), qo: ['Mi respuesta'] }, 600));
      const graded = await run(repo.gradeOpenAnswers(sent.id, [{ questionId: 'qo', score: 15 }]));
      expect(graded).toMatchObject({ score: 95, passed: true, review: { status: 'calificado' } }); // 80 + 15
      expect(enrollmentOf('u3').status).toBe('aprobado');
      expect(certificatesOf('u3')).toMatchObject([{ attemptId: sent.id, score: 95 }]);
      expect(courseResult(attemptsOf('u3')).final).toEqual({ score: 95, scaleMax: 100 });
    });

    it('si con la calificación no aprueba: «desaprobado» y sin certificado', async () => {
      const { repo } = await carlaInRecovery(withOpen);
      const sent = await run(repo.submitExamAttempt('u3', 'c1-e1', { ...withCorrect(4), qo: ['Mi respuesta'] }, 600));
      const graded = await run(repo.gradeOpenAnswers(sent.id, [{ questionId: 'qo', score: 0 }]));
      expect(graded.passed).toBe(false);
      expect(enrollmentOf('u3').status).toBe('desaprobado');
      expect(certificatesOf('u3')).toEqual([]);
    });
  });

  describe('11. entrega automática por tiempo agotado', () => {
    it('con respuestas guardadas que aprueban: se integra (aprobado y certificado)', async () => {
      const { repo, rec } = await carlaInRecovery();
      await run(repo.saveExamAnswers('u3', 'c1', allCorrect()));
      clock = T0 + 1 * H + 20 * MIN + 6_000;
      const [auto] = (await run(repo.listAttempts({ userId: 'u3' }))).filter((a) => a.kind === 'recuperacion');
      expect(auto).toMatchObject({ recoveryId: rec.id, autoSubmitted: true, score: 100, passed: true });
      expect(enrollmentOf('u3').status).toBe('aprobado');
      expect(certificatesOf('u3')).toMatchObject([{ attemptId: auto.id, score: 100 }]);
    });

    it('sin respuestas: nota final 0, desaprobado, sin certificado', async () => {
      const { repo } = await carlaInRecovery();
      clock = T0 + 1 * H + 20 * MIN + 6_000;
      await run(repo.listAttempts());
      expect(courseResult(attemptsOf('u3'))).toMatchObject({ final: { score: 0, scaleMax: 100 }, condition: 'desaprobado' });
      expect(certificatesOf('u3')).toEqual([]);
    });
  });

  it('8. no se generan certificados duplicados (ni si ya hubiera uno vigente del curso)', async () => {
    const { repo } = await carlaInRecovery((s) => {
      // Dato anómalo: un certificado vigente previo de Carla en c1. No se modifica ni se emite otro.
      s.certificates.push({ ...s.certificates[0], id: 'cert-prev', code: 'IMC-DEMO-0099', userId: 'u3', attemptId: 'att2' });
    });
    const before = certificatesOf('u3');
    await run(repo.submitExamAttempt('u3', 'c1-e1', allCorrect(), 600));
    await run(repo.listCertificates());
    expect(certificatesOf('u3')).toEqual(before);
    expect(await fails(repo.submitExamAttempt('u3', 'c1-e1', allCorrect(), 600))).toBe('Tu recuperación ya fue entregada.');
    expect(certificatesOf('u3')).toEqual(before);
  });

  it('9. los certificados históricos no se modifican', async () => {
    const before = withState() && stored().certificates;
    const { repo } = await carlaInRecovery();
    await run(repo.submitExamAttempt('u3', 'c1-e1', allCorrect(), 600));
    expect(stored().certificates.slice(0, before.length)).toEqual(before);
  });

  it('10. sin recuperación, el examen regular funciona igual que antes', async () => {
    const repo = withState();
    const attempt = await run(repo.submitExamAttempt('u5', 'c1-e1', allCorrect(), 600));
    expect(attempt.kind).toBeUndefined();
    expect(enrollmentOf('u5').status).toBe('aprobado');
    expect(certificatesOf('u5')).toMatchObject([{ attemptId: attempt.id, score: 100 }]);
    expect(courseResult(attemptsOf('u5'))).toMatchObject({ regularReplaced: false, recovery: null, final: { score: 100 } });
    expect(courseResult(attemptsOf('u1'))).toMatchObject({ final: { score: 80 }, condition: 'aprobado' }); // Ana, histórico
  });

  it('12. un ausente no recibe recuperación (20/11/2026): sin nota ni intento ni certificado (no se aprueba a nadie)', async () => {
    const repo = withState();
    await expect(run(repo.authorizeRecovery('a1', input({ userId: 'u5' })))).rejects.toThrow('solo se autoriza a quien lo desaprobó');
    clock = T0 + 3 * H;
    const [state] = await run(repo.listRecoveryStates({ userId: 'u5', courseId: 'c1' }));
    expect(state.status).toBeNull();
    expect(attemptsOf('u5')).toEqual([]);
    expect(certificatesOf('u5')).toEqual([]);
    expect(courseResult(attemptsOf('u5'))).toMatchObject({ final: null });
  });

  it('quien desaprobó y no rindió la recuperación conserva su nota regular como final', async () => {
    const repo = withState();
    await run(repo.authorizeRecovery('a1', input()));
    clock = T0 + 3 * H;
    await run(repo.listRecoveryStates());
    expect(enrollmentOf('u3').status).toBe('desaprobado');
    expect(courseResult(attemptsOf('u3'), true)).toMatchObject({ final: { score: 50, scaleMax: 100 }, condition: 'desaprobado' });
  });

  it('recuperación HISTÓRICA con examen independiente (ya no se autorizan nuevas): se rinde igual y su nota es la final', async () => {
    const repo = withState((s) => {
      const regular = s.exams.find((e) => e.id === 'c1-e1')!;
      s.exams.push({ ...regular, id: 'c1-rec', active: false, kind: 'recuperacion', parentExamId: 'c1-e1' });
      s.questions.push(...SEED_QUESTIONS.map((q) => ({ ...q, id: `r-${q.id}`, examId: 'c1-rec' })));
      s.recoveries.push({
        id: 'rec-hist',
        userId: 'u3',
        courseId: 'c1',
        regularExamId: 'c1-e1',
        examId: 'c1-rec',
        reason: 'desaprobado',
        mode: 'independiente',
        opensAt: iso(T0 + 1 * H),
        closesAt: iso(T0 + 3 * H),
        authorizedBy: 'a1',
        authorizedAt: iso(T0),
      });
    });
    const rec = { id: 'rec-hist' };
    clock = T0 + 1 * H;
    await run(repo.startExam('u3', 'c1'));
    const answers = Object.fromEntries(SEED_QUESTIONS.map((q) => [`r-${q.id}`, [...q.correct]]));
    const attempt = await run(repo.submitExamAttempt('u3', 'c1-rec', answers, 600));
    expect(attempt).toMatchObject({ kind: 'recuperacion', recoveryId: rec.id, examId: 'c1-rec', score: 100 });
    expect(courseResult(attemptsOf('u3')).final).toEqual({ score: 100, scaleMax: 100 });
    expect(enrollmentOf('u3').status).toBe('aprobado');
  });

  it('listRecoveryStates devuelve la situación de cada inscripción', async () => {
    const repo = withState();
    await run(repo.authorizeRecovery('a1', input()));
    const states = await run(repo.listRecoveryStates({ courseId: 'c1' }));
    expect(states.find((s) => s.userId === 'u3')!.status).toBe('autorizada');
    expect(states.find((s) => s.userId === 'u1')!.status).toBeNull(); // aprobó
    expect(states.every((s) => s.courseId === 'c1')).toBe(true);
  });

  describe('courseResult (regla de la nota final)', () => {
    const at = (over: Partial<Attempt>): Attempt => ({
      id: 'x', userId: 'u', courseId: 'c', examId: 'e', date: '2026-11-01T10:00:00-05:00', durationSec: 60,
      score: 0, scaleMax: 100, correctCount: 0, totalQuestions: 10, passed: false, ...over,
    });
    it('sin intentos: sin resultado (o desaprobado si no rindió la recuperación), sin nota', () => {
      expect(courseResult([])).toMatchObject({ final: null, condition: 'sin_resultado', current: null });
      expect(courseResult([], true)).toMatchObject({ final: null, condition: 'desaprobado' });
    });
    it('la recuperación manda aunque sea anterior en la lista o tenga menor nota', () => {
      const regular = at({ id: 'r', score: 50, date: '2026-11-01T10:00:00-05:00' });
      const recovery = at({ id: 'rec', kind: 'recuperacion', score: 30, date: '2026-11-05T10:00:00-05:00' });
      expect(courseResult([recovery, regular])).toMatchObject({ current: { id: 'rec' }, final: { score: 30 }, regularReplaced: true });
    });
    it('un intento en revisión no tiene nota final ni aprobación', () => {
      const pending = at({ kind: 'recuperacion', passed: false, review: { status: 'en_revision', manualScores: {} } });
      expect(courseResult([at({ score: 50 }), pending])).toMatchObject({ final: null, condition: 'en_revision' });
    });
  });
});
