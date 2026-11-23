import { Observable, firstValueFrom } from 'rxjs';
import { MockDataRepository, STORAGE_KEY } from './mock-data-repository';
import { DemoState } from '../data/demo-state';
import { SEED_QUESTIONS } from '../data/seed';
import { RecoveryInput } from '../models/recovery.model';

/**
 * Etapa 2B, Bloque 2 — corrección de R3: respuestas guardadas en el repositorio, entrega automática al agotarse el
 * tiempo (regular y recuperación), registro permanente de «No rindió recuperación» y duración completa aunque la
 * ventana cierre. Reloj controlado; cada `new MockDataRepository()` es una pestaña. Datos ficticios.
 * Semilla: Carla (u3) desaprobó c1 (50); Rosa (u5) no tiene intentos y vio los videos; a1 es el Instructor.
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
const PAST_END = 20 * MIN + 6_000; // 20 minutos de examen más el margen técnico de 5 s
let clock = T0;

function withState(edit: (s: DemoState) => void = () => undefined): MockDataRepository {
  new MockDataRepository().resetDemo();
  const s = stored();
  edit(s);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  return new MockDataRepository();
}
const allCorrect = (): Record<string, string[]> => Object.fromEntries(SEED_QUESTIONS.map((q) => [q.id, [...q.correct]]));
const attemptsOf = (userId: string) => stored().attempts.filter((a) => a.userId === userId);
const input = (over: Partial<RecoveryInput> = {}): RecoveryInput => ({
  userId: 'u3',
  courseId: 'c1',
  mode: 'original',
  opensAt: iso(T0 + 1 * H),
  closesAt: iso(T0 + 3 * H),
  ...over,
});
/** c1 con una pregunta abierta de 20 puntos (las otras 10 valen 8): queda «En revisión» al entregar. */
const withOpen = (s: DemoState) => {
  s.questions.filter((q) => q.examId === 'c1-e1').forEach((q) => (q.points = 8));
  s.questions.push({ id: 'qo', examId: 'c1-e1', type: 'open', text: 'Explica', options: [], correct: [], points: 20 });
};

describe('Corrección de R3: persistencia, entrega automática y control del tiempo', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    clock = T0;
    vi.spyOn(Date, 'now').mockImplementation(() => clock);
  });
  afterEach(() => vi.restoreAllMocks());

  describe('A y B: examen regular iniciado frente a nunca iniciado', () => {
    it('1. iniciado sin respuestas: al agotarse el tiempo se entrega automáticamente con nota 0', async () => {
      const repo = withState();
      await run(repo.startExam('u5', 'c1'));
      clock = T0 + PAST_END;
      expect(attemptsOf('u5')).toEqual([]); // nada cambia hasta que el repositorio procesa algo
      const attempts = await run(new MockDataRepository().listAttempts({ userId: 'u5' }));
      expect(attempts).toMatchObject([{ score: 0, passed: false, answers: {}, autoSubmitted: true, durationSec: 1200, gradingRule: 'proporcional' }]);
      expect(attempts[0].kind).toBeUndefined(); // regular
      expect(stored().enrollments.find((e) => e.userId === 'u5' && e.courseId === 'c1')!.status).toBe('desaprobado');
      expect(stored().examStarts[0]).toMatchObject({ attemptId: attempts[0].id, closedAt: '2026-11-12T08:20:06.000-05:00' });
    });

    it('2. iniciado con respuestas guardadas: se califican esas respuestas (y aprueba con su certificado)', async () => {
      const repo = withState();
      await run(repo.startExam('u5', 'c1'));
      await run(repo.saveExamAnswers('u5', 'c1', allCorrect()));
      clock = T0 + PAST_END;
      const [attempt] = await run(repo.listAttempts({ userId: 'u5' }));
      expect(attempt).toMatchObject({ score: 100, passed: true, autoSubmitted: true, answers: allCorrect() });
      expect(stored().certificates.filter((c) => c.userId === 'u5')).toMatchObject([{ attemptId: attempt.id, score: 100 }]);
    });

    it('2b. con respuestas parciales, la selección múltiple se califica en proporción (Bloque 1)', async () => {
      const repo = withState();
      await run(repo.startExam('u5', 'c1'));
      await run(repo.saveExamAnswers('u5', 'c1', { q1: ['b'], q8: ['b'] }));
      clock = T0 + PAST_END;
      const [attempt] = await run(repo.listAttempts({ userId: 'u5' }));
      expect(attempt).toMatchObject({ score: 15, questionScores: { q1: 10, q8: 5 } });
    });

    it('2c. con una pregunta abierta, la entrega automática queda «En revisión», sin nota definitiva', async () => {
      const repo = withState(withOpen);
      await run(repo.startExam('u5', 'c1'));
      await run(repo.saveExamAnswers('u5', 'c1', { ...allCorrect(), qo: ['Mi respuesta'] }));
      clock = T0 + PAST_END;
      const [attempt] = await run(repo.listAttempts({ userId: 'u5' }));
      expect(attempt).toMatchObject({ score: 0, passed: false, review: { status: 'en_revision' }, answers: { qo: ['Mi respuesta'] } });
      expect(stored().enrollments.find((e) => e.userId === 'u5' && e.courseId === 'c1')!.status).toBe('en_revision');
      expect(stored().certificates.filter((c) => c.userId === 'u5')).toEqual([]);
    });

    it('3. un examen regular iniciado no se convierte en ausencia', async () => {
      const repo = withState();
      await run(repo.startExam('u5', 'c1'));
      clock = T0 + PAST_END;
      expect(await run(repo.getRecoveryStatus('u5', 'c1'))).toMatchObject({ status: 'pendiente', reason: 'Desaprobó el examen regular.' });
      expect((await run(repo.authorizeRecovery('a1', input({ userId: 'u5', opensAt: iso(clock + H), closesAt: iso(clock + 3 * H) })))).reason).toBe(
        'desaprobado',
      );
    });

    it('4. nunca iniciado: sigue ausente, sin intento ni nota, aunque pase el tiempo; no corresponde recuperación (20/11/2026)', async () => {
      const repo = withState();
      clock = T0 + 30 * 24 * H;
      expect(await run(repo.getRecoveryStatus('u5', 'c1'))).toMatchObject({ status: null, reason: 'El estudiante no ha rendido el examen regular: la recuperación solo se autoriza a quien lo desaprobó.' });
      expect(await run(repo.listAttempts({ userId: 'u5' }))).toEqual([]);
      await expect(run(repo.authorizeRecovery('a1', input({ userId: 'u5', opensAt: iso(clock + H), closesAt: iso(clock + 3 * H) })))).rejects.toThrow(
        'solo se autoriza a quien lo desaprobó',
      );
      expect(attemptsOf('u5')).toEqual([]);
    });
  });

  describe('C: recuperación nunca iniciada («No rindió recuperación» permanente)', () => {
    it('5 y 6. se registra una sola vez con la fecha en que se constató y sobrevive a la recarga', async () => {
      const repo = withState();
      await run(repo.authorizeRecovery('a1', input()));
      clock = T0 + 3 * H + 7 * MIN; // se constata 7 minutos después del cierre
      expect((await run(repo.getRecoveryStatus('u3', 'c1'))).status).toBe('no_rindio');
      const noShowAt = stored().recoveries[0].noShowAt;
      expect(noShowAt).toBe('2026-11-12T11:07:00.000-05:00');
      clock += 2 * H;
      const reloaded = new MockDataRepository();
      expect(await run(reloaded.getRecoveryStatus('u3', 'c1'))).toMatchObject({ status: 'no_rindio', reason: 'No rindió la recuperación.' });
      await run(reloaded.listRecoveries());
      expect(stored().recoveries[0].noShowAt).toBe(noShowAt); // no se vuelve a escribir
      expect(attemptsOf('u3').map((a) => [a.id, a.score])).toEqual([['att2', 50]]); // su nota regular se conserva
    });

    it('7. no cambia aunque después se modifiquen las fechas de la recuperación', async () => {
      const repo = withState();
      await run(repo.authorizeRecovery('a1', input()));
      clock = T0 + 3 * H;
      await run(repo.getRecoveryStatus('u3', 'c1'));
      const s = stored();
      s.recoveries[0].opensAt = iso(clock - H);
      s.recoveries[0].closesAt = iso(clock + 5 * H); // fechas alteradas después del vencimiento
      localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
      const other = new MockDataRepository();
      expect((await run(other.getRecoveryStatus('u3', 'c1'))).status).toBe('no_rindio');
      expect(await fails(other.startExam('u3', 'c1'))).toBe('El plazo de tu recuperación terminó sin que la iniciaras.');
      expect(await fails(other.cancelRecovery('a1', s.recoveries[0].id))).toContain('el plazo de la recuperación ya terminó');
    });

    it('8. la oportunidad vencida no se puede volver a autorizar', async () => {
      const repo = withState();
      await run(repo.authorizeRecovery('a1', input()));
      clock = T0 + 3 * H;
      expect(await fails(repo.authorizeRecovery('a1', input({ opensAt: iso(clock + H), closesAt: iso(clock + 3 * H) })))).toContain(
        'solo se permite una oportunidad',
      );
      expect(stored().recoveries).toHaveLength(1);
    });

    it('un ausente no recibe recuperación (20/11/2026): sigue sin intento ni nota', async () => {
      const repo = withState();
      await expect(run(repo.authorizeRecovery('a1', input({ userId: 'u5' })))).rejects.toThrow('solo se autoriza a quien lo desaprobó');
      clock = T0 + 3 * H;
      expect((await run(repo.getRecoveryStatus('u5', 'c1'))).status).toBeNull();
      expect(attemptsOf('u5')).toEqual([]);
      expect(stored().certificates.filter((c) => c.userId === 'u5')).toEqual([]);
    });

    it('no se registra en una recuperación anulada', async () => {
      const repo = withState();
      const rec = await run(repo.authorizeRecovery('a1', input()));
      await run(repo.cancelRecovery('a1', rec.id));
      clock = T0 + 3 * H;
      await run(repo.listRecoveries());
      expect(stored().recoveries[0].noShowAt).toBeUndefined();
      expect((await run(repo.getRecoveryStatus('u3', 'c1'))).status).toBe('anulada');
    });

    it('9. una recuperación iniciada nunca se convierte en «No rindió recuperación»', async () => {
      const repo = withState();
      await run(repo.authorizeRecovery('a1', input()));
      clock = T0 + 3 * H - 5 * MIN; // 10:55
      await run(repo.startExam('u3', 'c1'));
      clock = T0 + 3 * H + 5 * MIN; // 11:05: la ventana cerró, su examen sigue hasta las 11:15
      expect(await run(repo.getRecoveryStatus('u3', 'c1'))).toMatchObject({ status: 'autorizada', reason: 'Recuperación en curso.' });
      clock = T0 + 3 * H + 16 * MIN;
      expect((await run(repo.getRecoveryStatus('u3', 'c1'))).status).toBe('rendida');
      expect(stored().recoveries[0].noShowAt).toBeUndefined();
    });
  });

  describe('respuestas guardadas en el repositorio', () => {
    it('10 y 11. sobreviven al cierre de la pestaña y a la recarga, sin reiniciar el tiempo', async () => {
      const repo = withState();
      const first = await run(repo.startExam('u5', 'c1'));
      await run(repo.saveExamAnswers('u5', 'c1', { q1: ['b'], q6: ['a', 'c'] }));
      clock += 5 * MIN;
      const reopened = await run(new MockDataRepository().startExam('u5', 'c1')); // pestaña nueva
      expect(reopened).toMatchObject({ startedAt: first.startedAt, endsAt: first.endsAt, answers: { q1: ['b'], q6: ['a', 'c'] } });
    });

    it('12. dos pestañas ven el mismo estado y no se borran respuestas entre sí', async () => {
      withState();
      const tabA = new MockDataRepository();
      const tabB = new MockDataRepository();
      await run(tabA.startExam('u5', 'c1'));
      await run(tabA.saveExamAnswers('u5', 'c1', { q1: ['b'] }));
      const fromB = await run(tabB.saveExamAnswers('u5', 'c1', { q2: ['c'] })); // B no sabía de q1
      expect(fromB).toEqual({ q1: ['b'], q2: ['c'] });
      expect((await run(tabA.startExam('u5', 'c1'))).answers).toEqual({ q1: ['b'], q2: ['c'] });
      expect(stored().examStarts).toHaveLength(1);
    });

    it('solo guarda preguntas del examen y alternativas existentes; una respuesta vacía se quita; nunca inventa', async () => {
      const repo = withState(withOpen);
      await run(repo.startExam('u5', 'c1'));
      const saved = await run(
        repo.saveExamAnswers('u5', 'c1', { q1: ['b', 'zz', 'b'], otra: ['a'], q2: ['c'], qo: ['   '], q3: 'x' as unknown as string[] }),
      );
      expect(saved).toEqual({ q1: ['b'], q2: ['c'] });
      expect(await run(repo.saveExamAnswers('u5', 'c1', { q2: [], qo: ['Texto'] }))).toEqual({ q1: ['b'], qo: ['Texto'] });
    });

    it('no se guardan sin examen iniciado, después de entregar ni en el examen de otro estudiante', async () => {
      const repo = withState();
      expect(await fails(repo.saveExamAnswers('u5', 'c1', { q1: ['b'] }))).toBe('No tienes un examen iniciado en este curso.');
      await run(repo.startExam('u5', 'c1'));
      expect(await fails(repo.saveExamAnswers('u4', 'c1', { q1: ['a'] }))).toBe('No tienes un examen iniciado en este curso.');
      await run(repo.submitExamAttempt('u5', 'c1-e1', allCorrect(), 60));
      expect(await fails(repo.saveExamAnswers('u5', 'c1', { q1: ['a'] }))).toBe('Tu examen ya fue entregado.');
      expect(stored().examStarts[0].answers).toBeUndefined(); // la entrega voluntaria usó las de la página
    });
  });

  describe('entrega automática idempotente', () => {
    it('13. se realiza una sola vez aunque se consulte muchas veces', async () => {
      const repo = withState();
      await run(repo.startExam('u5', 'c1'));
      clock = T0 + PAST_END;
      for (let i = 0; i < 3; i++) {
        await run(repo.listAttempts());
        await run(repo.getExamAvailability('u5', 'c1'));
        await run(new MockDataRepository().listEnrollments());
      }
      expect(attemptsOf('u5')).toHaveLength(1);
    });

    it('14. dos pestañas no generan intentos duplicados (ni al consultar ni al reenviar)', async () => {
      withState();
      const tabA = new MockDataRepository();
      const tabB = new MockDataRepository();
      await run(tabA.startExam('u5', 'c1'));
      clock = T0 + PAST_END;
      const [auto] = await run(tabA.listAttempts({ userId: 'u5' }));
      // B, con datos viejos en memoria, intenta entregar por tiempo: ya estaba entregado.
      expect(await fails(tabB.submitExamAttempt('u5', 'c1-e1', {}, 1200, 'tiempo'))).toBe('Alcanzaste el límite de intentos permitidos.');
      expect(attemptsOf('u5').map((a) => a.id)).toEqual([auto.id]);
    });

    it('la entrega que llega tarde (pasado el margen) recibe el intento cerrado con lo guardado, no otro', async () => {
      const repo = withState();
      await run(repo.startExam('u5', 'c1'));
      await run(repo.saveExamAnswers('u5', 'c1', { q1: ['b'] }));
      clock = T0 + PAST_END;
      const attempt = await run(repo.submitExamAttempt('u5', 'c1-e1', allCorrect(), 1200, 'voluntaria'));
      expect(attempt).toMatchObject({ autoSubmitted: true, score: 10, answers: { q1: ['b'] } });
      expect(attemptsOf('u5')).toHaveLength(1);
    });
  });

  describe('D y E: recuperación iniciada', () => {
    it('15. abandonada: se entrega automáticamente con las respuestas guardadas', async () => {
      const repo = withState();
      const rec = await run(repo.authorizeRecovery('a1', input()));
      clock = T0 + 1 * H;
      await run(repo.startExam('u3', 'c1'));
      await run(repo.saveExamAnswers('u3', 'c1', { q1: ['b'], q2: ['c'] }));
      clock = T0 + 1 * H + PAST_END;
      await run(new MockDataRepository().getRecoveryStatus('u3', 'c1'));
      const recovery = attemptsOf('u3').filter((a) => a.kind === 'recuperacion');
      expect(recovery).toMatchObject([{ recoveryId: rec.id, autoSubmitted: true, score: 20, answers: { q1: ['b'], q2: ['c'] } }]);
      expect(stored().recoveries[0]).toMatchObject({ attemptId: recovery[0].id });
      expect(stored().recoveries[0].noShowAt).toBeUndefined();
      expect(attemptsOf('u3').find((a) => a.id === 'att2')).toMatchObject({ score: 50, passed: false }); // regular intacto
    });

    it('16. sin respuestas y sin preguntas abiertas obtiene 0', async () => {
      const repo = withState();
      await run(repo.authorizeRecovery('a1', input()));
      clock = T0 + 1 * H;
      await run(repo.startExam('u3', 'c1'));
      clock = T0 + 1 * H + PAST_END;
      const recovery = (await run(repo.listAttempts({ userId: 'u3' }))).filter((a) => a.kind === 'recuperacion');
      expect(recovery).toMatchObject([{ kind: 'recuperacion', score: 0, passed: false, answers: {} }]);
    });

    it('17. con preguntas abiertas pendientes queda «En revisión», sin nota definitiva ni certificado', async () => {
      const repo = withState(withOpen);
      await run(repo.authorizeRecovery('a1', input()));
      clock = T0 + 1 * H;
      await run(repo.startExam('u3', 'c1'));
      await run(repo.saveExamAnswers('u3', 'c1', { qo: ['Mi respuesta'] }));
      clock = T0 + 1 * H + PAST_END;
      const [attempt] = (await run(repo.listAttempts({ userId: 'u3' }))).filter((a) => a.kind === 'recuperacion');
      expect(attempt).toMatchObject({ review: { status: 'en_revision' }, score: 0, passed: false });
      // R4: la recuperación es la nota vigente; mientras esté en revisión la condición es «en revisión» y no hay
      // certificado (su calificación y su efecto se prueban en mock-data-repository.r4.spec).
      expect(stored().enrollments.find((e) => e.userId === 'u3' && e.courseId === 'c1')!.status).toBe('en_revision');
      expect(stored().certificates.filter((c) => c.userId === 'u3')).toEqual([]);
    });

    it('18. iniciada tres minutos antes del cierre conserva los veinte minutos completos', async () => {
      const repo = withState();
      await run(repo.authorizeRecovery('a1', input())); // cierre 11:00
      clock = Date.parse('2026-11-12T10:57:00-05:00');
      const started = await run(repo.startExam('u3', 'c1'));
      expect(started).toMatchObject({ startedAt: '2026-11-12T10:57:00.000-05:00', endsAt: '2026-11-12T11:17:00.000-05:00' });
      clock = Date.parse('2026-11-12T11:10:00-05:00'); // después del cierre: sigue disponible para terminar
      expect((await run(repo.getExamAvailability('u3', 'c1'))).available).toBe(true);
      expect(await run(repo.startExam('u3', 'c1'))).toEqual(started); // recarga
    });

    it('19. se puede entregar después del cierre si se inició dentro del plazo', async () => {
      const repo = withState();
      const rec = await run(repo.authorizeRecovery('a1', input()));
      clock = Date.parse('2026-11-12T10:57:00-05:00');
      await run(repo.startExam('u3', 'c1'));
      clock = Date.parse('2026-11-12T11:12:00-05:00');
      const attempt = await run(repo.submitExamAttempt('u3', 'c1-e1', allCorrect(), 900));
      expect(attempt).toMatchObject({ kind: 'recuperacion', recoveryId: rec.id, score: 100, durationSec: 900 });
      expect(attempt.autoSubmitted).toBeUndefined();
      expect(await fails(repo.submitExamAttempt('u3', 'c1-e1', allCorrect(), 900))).toBe('Tu recuperación ya fue entregada.');
      expect(attemptsOf('u3').filter((a) => a.kind === 'recuperacion')).toHaveLength(1);
    });

    it('19b. por tiempo agotado después del cierre: también se acepta y usa lo guardado', async () => {
      const repo = withState();
      await run(repo.authorizeRecovery('a1', input()));
      clock = Date.parse('2026-11-12T10:57:00-05:00');
      await run(repo.startExam('u3', 'c1'));
      await run(repo.saveExamAnswers('u3', 'c1', { q1: ['b'] }));
      clock = Date.parse('2026-11-12T11:17:01-05:00');
      const attempt = await run(repo.submitExamAttempt('u3', 'c1-e1', allCorrect(), 1200, 'tiempo'));
      expect(attempt).toMatchObject({ kind: 'recuperacion', score: 10, answers: { q1: ['b'] } });
    });

    it('20. después del cierre no se permite un nuevo inicio', async () => {
      const repo = withState();
      await run(repo.authorizeRecovery('a1', input()));
      clock = T0 + 3 * H;
      expect(await fails(repo.startExam('u3', 'c1'))).toBe('El plazo de tu recuperación terminó sin que la iniciaras.');
      expect(stored().examStarts).toEqual([]);
    });

    it('21. una recuperación anulada no se puede entregar', async () => {
      const repo = withState();
      const rec = await run(repo.authorizeRecovery('a1', input()));
      await run(repo.cancelRecovery('a1', rec.id));
      clock = T0 + 1 * H;
      expect(await fails(repo.startExam('u3', 'c1'))).toBe('Alcanzaste el límite de intentos permitidos.'); // vuelve al regular, ya usado
      expect(await fails(repo.submitExamAttempt('u3', 'c1-e1', allCorrect(), 60))).toBe('Alcanzaste el límite de intentos permitidos.');
      expect(await fails(repo.saveExamAnswers('u3', 'c1', { q1: ['b'] }))).toBe('No tienes un examen iniciado en este curso.');
      expect(attemptsOf('u3').map((a) => a.id)).toEqual(['att2']);
    });
  });

  it('22. no se modifican intentos ni certificados históricos', async () => {
    const repo = withState();
    const before = stored();
    await run(repo.authorizeRecovery('a1', input()));
    await run(repo.startExam('u5', 'c1'));
    await run(repo.saveExamAnswers('u5', 'c1', { q1: ['b'] }));
    clock = T0 + 1 * H;
    await run(repo.startExam('u3', 'c1'));
    clock = T0 + 2 * H;
    await run(repo.listAttempts());
    const after = stored();
    expect(after.attempts.slice(0, before.attempts.length)).toEqual(before.attempts);
    expect(after.certificates.slice(0, before.certificates.length)).toEqual(before.certificates);
    expect(after.attempts.slice(before.attempts.length).map((a) => [a.userId, a.kind ?? 'regular', a.autoSubmitted])).toEqual([
      ['u5', 'regular', true],
      ['u3', 'recuperacion', true],
    ]);
  });
});
