import { Observable, firstValueFrom } from 'rxjs';
import { MockDataRepository, STORAGE_KEY } from './mock-data-repository';
import { DemoState } from '../data/demo-state';
import { SEED_QUESTIONS } from '../data/seed';
import { EXAM_LOCKED_MESSAGE } from '../models/exam.model';
import { RecoveryInput } from '../models/recovery.model';
import { registerExamStart } from './testing/exam-starts';

/**
 * Etapa 2B, Bloque 2 (R3): autorización, anulación y control de recuperaciones (sin entrega ni calificación: R4).
 * Reloj controlado. Semilla: Carla (u3) desaprobó c1; Rosa (u5) no tiene intentos (ausente: desde el 20/11/2026 no recibe
 * recuperación; `ROSA_FAILED` la deja desaprobada) y vio los videos;
 * Ana (u1) aprobó; Luis (u2) no tiene intentos y le faltan videos; a1 es el Instructor. Datos ficticios.
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
const T0 = Date.parse('2026-11-12T08:00:00-05:00'); // «ahora» al empezar cada prueba (hora de Lima)
const iso = (ms: number) => new Date(ms).toISOString(); // con «Z»: el repositorio lo guarda en -05:00
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
/** 20/11/2026: solo se autoriza a desaprobados (igual que el servidor). */
const NOT_TAKEN = 'El estudiante no ha rendido el examen regular: la recuperación solo se autoriza a quien lo desaprobó.';
/** Convierte a un ausente de la semilla en desaprobado: intento regular calificado de c1 con 0 (copia de att2). */
function failedRegular(s: DemoState, userId: string) {
  const base = s.attempts.find((a) => a.id === 'att2')!;
  s.attempts.push({ ...base, id: `att-${userId}`, userId, score: 0, passed: false });
  const enrollment = s.enrollments.find((e) => e.userId === userId && e.courseId === 'c1');
  if (enrollment) enrollment.status = 'desaprobado';
}
const ROSA_FAILED = (s: DemoState) => failedRegular(s, 'u5');
const REC_U5 = (a: { userId: string; kind?: string }) => a.userId === 'u5' && a.kind === 'recuperacion';
/** Examen de recuperación independiente de c1 (preparado como lo hará R5): misma configuración y suma 100. */
function withIndependentExam(s: DemoState, over: Record<string, unknown> = {}) {
  const regular = s.exams.find((e) => e.id === 'c1-e1')!;
  s.exams.push({ ...regular, id: 'c1-rec', title: 'Recuperación', active: false, kind: 'recuperacion', parentExamId: 'c1-e1', ...over });
  s.questions.push(...SEED_QUESTIONS.map((q) => ({ ...q, id: `r-${q.id}`, examId: 'c1-rec' })));
}

describe('Etapa 2B, Bloque 2 (R3): recuperaciones', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    clock = T0;
    vi.spyOn(Date, 'now').mockImplementation(() => clock);
  });
  afterEach(() => vi.restoreAllMocks());

  describe('a quién se puede autorizar', () => {
    it('a quien desaprobó el examen regular: se guarda en hora de Lima y no crea intentos', async () => {
      const repo = withState();
      const before = stored();
      const rec = await run(repo.authorizeRecovery('a1', input()));
      expect(rec).toMatchObject({
        userId: 'u3',
        courseId: 'c1',
        regularExamId: 'c1-e1',
        examId: 'c1-e1',
        reason: 'desaprobado',
        mode: 'original',
        opensAt: '2026-11-12T09:00:00.000-05:00',
        closesAt: '2026-11-12T11:00:00.000-05:00',
        authorizedBy: 'a1',
        authorizedAt: '2026-11-12T08:00:00.000-05:00',
      });
      expect(stored().recoveries).toEqual([rec]);
      expect(stored().attempts).toEqual(before.attempts);
      expect(stored().certificates).toEqual(before.certificates);
      expect(stored().enrollments).toEqual(before.enrollments);
      expect((await run(repo.getRecoveryStatus('u3', 'c1'))).status).toBe('autorizada');
    });

    it('20/11/2026: a quien estuvo ausente (sin intento regular calificado) no se le autoriza; no se crea nada', async () => {
      const repo = withState();
      expect(await fails(repo.authorizeRecovery('a1', input({ userId: 'u5' })))).toBe(NOT_TAKEN);
      expect(stored().attempts.filter((a) => a.userId === 'u5')).toEqual([]);
      expect(stored().recoveries).toEqual([]);
    });

    it.each([
      ['aprobó el examen regular', 'u1', (_s: DemoState) => undefined, 'aprobó el examen regular'],
      [
        'está pendiente de calificación',
        'u3',
        (s: DemoState) => (s.attempts.find((a) => a.id === 'att2')!.review = { status: 'en_revision', manualScores: {} }),
        'pendiente de calificación',
      ],
      ['no está inscrito en el curso', 'u6', (s: DemoState) => (s.enrollments = s.enrollments.filter((e) => e.userId !== 'u6')), 'no está inscrito'],
      ['es el Instructor', 'a1', (_s: DemoState) => undefined, 'no está inscrito'],
      ['curso en borrador', 'u3', (s: DemoState) => (s.courses.find((c) => c.id === 'c1')!.status = 'borrador'), 'El curso está en borrador'],
    ])('rechaza si el estudiante %s', async (_label, userId, edit, message) => {
      const repo = withState(edit);
      expect(await fails(repo.authorizeRecovery('a1', input({ userId })))).toContain(message);
      expect(stored().recoveries).toEqual([]);
    });

    it('rechaza a un ausente que está rindiendo el examen regular en este momento', async () => {
      withState();
      registerExamStart('u5', 'c1-e1', T0 - 5 * MIN, T0 + 15 * MIN);
      const repo = new MockDataRepository();
      expect(await fails(repo.authorizeRecovery('a1', input({ userId: 'u5' })))).toBe('El estudiante está rindiendo el examen regular en este momento.');
      // Corrección de R3 (regla A): al terminar su tiempo sin entregar, el regular se entrega automáticamente (nota 0
      // sin respuestas): ya no es ausente, sino desaprobado.
      clock = T0 + 16 * MIN;
      const rec = await run(repo.authorizeRecovery('a1', input({ userId: 'u5', opensAt: iso(clock + H), closesAt: iso(clock + 3 * H) })));
      expect(rec.reason).toBe('desaprobado');
      expect(stored().attempts.filter((a) => a.userId === 'u5')).toMatchObject([{ score: 0, passed: false, autoSubmitted: true }]);
    });

    it('solo el Instructor puede autorizar y anular', async () => {
      const repo = withState();
      expect(await fails(repo.authorizeRecovery('u2', input()))).toBe('Solo el Instructor puede autorizar recuperaciones.');
      expect(await fails(repo.authorizeRecovery('no-existe', input()))).toBe('Solo el Instructor puede autorizar recuperaciones.');
      const rec = await run(repo.authorizeRecovery('a1', input()));
      expect(await fails(repo.cancelRecovery('u3', rec.id))).toBe('Solo el Instructor puede anular recuperaciones.');
    });
  });

  describe('una sola oportunidad', () => {
    it('no se duplica una autorización vigente (tampoco desde otra pestaña del Instructor)', async () => {
      withState();
      const tabA = new MockDataRepository();
      const tabB = new MockDataRepository();
      await run(tabA.authorizeRecovery('a1', input()));
      expect(await fails(tabB.authorizeRecovery('a1', input()))).toBe(
        'El estudiante ya tiene una recuperación en este curso: solo se permite una oportunidad.',
      );
      expect(stored().recoveries).toHaveLength(1);
    });

    it('una vencida sin iniciar (no rindió) consume la oportunidad: no hay una tercera', async () => {
      const repo = withState();
      await run(repo.authorizeRecovery('a1', input()));
      clock = T0 + 3 * H; // cierre
      expect((await run(repo.getRecoveryStatus('u3', 'c1'))).status).toBe('no_rindio');
      expect(await fails(repo.authorizeRecovery('a1', input({ opensAt: iso(clock + H), closesAt: iso(clock + 3 * H) })))).toContain(
        'solo se permite una oportunidad',
      );
    });

    // Corrección de R3 (regla D): iniciada y abandonada se entrega automáticamente; también consume la oportunidad.
    it('una iniciada y abandonada (sin entrega) se entrega automáticamente y consume la oportunidad', async () => {
      const repo = withState(ROSA_FAILED);
      await run(repo.authorizeRecovery('a1', input({ userId: 'u5' })));
      clock = T0 + 1 * H;
      await run(repo.startExam('u5', 'c1'));
      clock = T0 + 1 * H + 21 * MIN; // pasó su tiempo de 20 minutos sin entregar
      expect(await run(repo.getRecoveryStatus('u5', 'c1'))).toMatchObject({ status: 'rendida' });
      expect(stored().attempts.filter(REC_U5)).toMatchObject([{ kind: 'recuperacion', autoSubmitted: true, score: 0 }]);
      expect(await fails(repo.startExam('u5', 'c1'))).toBe('Ya rendiste tu recuperación.');
      expect(await fails(repo.authorizeRecovery('a1', input({ userId: 'u5', opensAt: iso(clock + H), closesAt: iso(clock + 3 * H) })))).toContain(
        'solo se permite una oportunidad',
      );
    });

    it('una recuperación autorizada que nunca se inició no se puede entregar (ni se entrega el regular)', async () => {
      const repo = withState(ROSA_FAILED);
      await run(repo.authorizeRecovery('a1', input({ userId: 'u5' })));
      clock = T0 + 1 * H; // dentro de la ventana, pero sin iniciar
      const answers = Object.fromEntries(SEED_QUESTIONS.map((q) => [q.id, [...q.correct]]));
      expect(await fails(repo.submitExamAttempt('u5', 'c1-e1', answers, 60))).toBe('Debes iniciar la recuperación antes de entregarla.');
      expect(stored().attempts.filter(REC_U5)).toEqual([]);
    });
  });

  describe('modalidad', () => {
    it('«examen original»: reutiliza el regular sin modificarlo (RN-15 sigue bloqueando sus cambios)', async () => {
      const repo = withState(ROSA_FAILED);
      const before = { exams: stored().exams, questions: stored().questions };
      const rec = await run(repo.authorizeRecovery('a1', input()));
      expect(rec).toMatchObject({ mode: 'original', examId: 'c1-e1' });
      expect({ exams: stored().exams, questions: stored().questions }).toEqual(before);
      const { examId: _e, ...q1 } = (await run(repo.getExamQuestions('c1-e1'))).find((q) => q.id === 'q1')!;
      expect(await fails(repo.saveExamQuestion('c1-e1', { ...q1, text: 'Cambio' }))).toBe(EXAM_LOCKED_MESSAGE);
      expect(await fails(repo.authorizeRecovery('a1', input({ userId: 'u5', recoveryExamId: 'c-ia-e1' })))).toBe(
        'Las recuperaciones solo se rinden con el examen original del curso.',
      );
    });

    it('20/11/2026: la modalidad «independiente» ya no se autoriza (aunque el examen sea válido) y no se guarda nada', async () => {
      const repo = withState((s) => withIndependentExam(s));
      const indep = { mode: 'independiente', recoveryExamId: 'c1-rec' } as unknown as Partial<RecoveryInput>;
      expect(await fails(repo.authorizeRecovery('a1', input(indep)))).toBe('Las recuperaciones solo se rinden con el examen original del curso.');
      expect(await fails(repo.authorizeRecovery('a1', input({ recoveryExamId: 'c1-rec' })))).toBe('Las recuperaciones solo se rinden con el examen original del curso.');
      expect(stored().recoveries).toEqual([]);
      // Siempre con el examen original, aunque no se indique la modalidad.
      const rec = await run(repo.authorizeRecovery('a1', input({ mode: undefined })));
      expect(rec).toMatchObject({ mode: 'original', examId: 'c1-e1', regularExamId: 'c1-e1' });
    });

    it('rechaza una modalidad desconocida', async () => {
      const repo = withState();
      expect(await fails(repo.authorizeRecovery('a1', input({ mode: 'otra' as RecoveryInput['mode'] })))).toBe('Las recuperaciones solo se rinden con el examen original del curso.');
    });
  });

  describe('programación (hora de Lima)', () => {
    it.each([
      ['sin apertura', { opensAt: '' }, 'Indica la fecha y hora de apertura y de cierre'],
      ['sin cierre', { closesAt: undefined as unknown as string }, 'Indica la fecha y hora de apertura y de cierre'],
      ['sin zona horaria', { opensAt: '2026-11-12T09:00:00' }, 'con su zona horaria'],
      ['fecha inexistente', { closesAt: '2026-11-31T10:00:00-05:00' }, 'Indica la fecha y hora'],
      ['hora inexistente', { opensAt: '2026-11-12T25:00:00-05:00' }, 'Indica la fecha y hora'],
      ['cierre igual a la apertura', { closesAt: iso(T0 + 1 * H) }, 'posteriores a la apertura'],
      ['cierre antes de la apertura', { closesAt: iso(T0 + 30 * MIN) }, 'posteriores a la apertura'],
      ['cierre ya pasado', { opensAt: iso(T0 - 3 * H), closesAt: iso(T0 - 1 * H) }, 'ya pasaron'],
    ])('rechaza fechas inválidas: %s', async (_label, over, message) => {
      const repo = withState();
      expect(await fails(repo.authorizeRecovery('a1', input(over)))).toContain(message);
      expect(stored().recoveries).toEqual([]);
    });

    it('acepta la zona -05:00 y cualquier otra explícita, y guarda el mismo instante en hora de Lima', async () => {
      const repo = withState();
      const rec = await run(repo.authorizeRecovery('a1', input({ opensAt: '2026-11-12T14:00:00Z', closesAt: '2026-11-12T11:30-05:00' })));
      expect(rec.opensAt).toBe('2026-11-12T09:00:00.000-05:00');
      expect(rec.closesAt).toBe('2026-11-12T11:30:00.000-05:00');
      expect(Date.parse(rec.opensAt)).toBe(Date.parse('2026-11-12T14:00:00Z'));
    });

    it('una ventana que ya empezó es válida aunque falte menos que la duración del examen para el cierre', async () => {
      const repo = withState();
      await run(repo.authorizeRecovery('a1', input({ opensAt: iso(T0 - 1 * H), closesAt: iso(T0 + 1 * MIN) })));
      expect((await run(repo.getExamAvailability('u3', 'c1'))).available).toBe(true);
      expect((await run(repo.startExam('u3', 'c1'))).endsAt).toBe('2026-11-12T08:20:00.000-05:00'); // 20 minutos completos
    });

    describe('corrección final de R3: ventana más corta que el examen (10:00 a 10:05, examen de 20 minutos)', () => {
      const at = (hhmm: string) => Date.parse(`2026-11-12T${hhmm}:00-05:00`);
      const shortWindow = () => input({ opensAt: '2026-11-12T10:00:00-05:00', closesAt: '2026-11-12T10:05:00-05:00' });
      const answers = () => Object.fromEntries(SEED_QUESTIONS.map((q) => [q.id, [...q.correct]]));

      it('se acepta la configuración', async () => {
        const repo = withState();
        const rec = await run(repo.authorizeRecovery('a1', shortWindow()));
        expect(rec).toMatchObject({ opensAt: '2026-11-12T10:00:00.000-05:00', closesAt: '2026-11-12T10:05:00.000-05:00' });
      });

      it('quien inicia a las 10:04 termina a las 10:24 y puede entregar después del cierre', async () => {
        const repo = withState();
        const rec = await run(repo.authorizeRecovery('a1', shortWindow()));
        clock = at('10:04');
        const started = await run(repo.startExam('u3', 'c1'));
        expect(started).toMatchObject({ startedAt: '2026-11-12T10:04:00.000-05:00', endsAt: '2026-11-12T10:24:00.000-05:00' });
        clock = at('10:20'); // la ventana cerró a las 10:05; su examen sigue
        expect((await run(repo.getExamAvailability('u3', 'c1'))).available).toBe(true);
        expect(await run(new MockDataRepository().startExam('u3', 'c1'))).toEqual(started); // recarga
        const attempt = await run(repo.submitExamAttempt('u3', 'c1-e1', answers(), 960));
        expect(attempt).toMatchObject({ kind: 'recuperacion', recoveryId: rec.id, score: 100 });
        expect((await run(repo.getRecoveryStatus('u3', 'c1'))).status).toBe('rendida');
      });

      it('si no entrega, a las 10:24 se entrega automáticamente con lo guardado', async () => {
        const repo = withState();
        await run(repo.authorizeRecovery('a1', shortWindow()));
        clock = at('10:04');
        await run(repo.startExam('u3', 'c1'));
        await run(repo.saveExamAnswers('u3', 'c1', { q1: ['b'], q2: ['c'] }));
        clock = at('10:23');
        expect((await run(repo.listAttempts({ userId: 'u3' }))).filter((a) => a.kind === 'recuperacion')).toEqual([]); // aún en curso
        clock = at('10:24') + 6_000; // fin + margen técnico
        const [auto] = (await run(repo.listAttempts({ userId: 'u3' }))).filter((a) => a.kind === 'recuperacion');
        expect(auto).toMatchObject({ autoSubmitted: true, score: 20, durationSec: 1200, answers: { q1: ['b'], q2: ['c'] } });
        expect(stored().recoveries[0].noShowAt).toBeUndefined();
      });

      it('la entrega por tiempo agotado que envía la página después del cierre se acepta', async () => {
        const repo = withState();
        await run(repo.authorizeRecovery('a1', shortWindow()));
        clock = at('10:04');
        await run(repo.startExam('u3', 'c1'));
        await run(repo.saveExamAnswers('u3', 'c1', { q1: ['b'] }));
        clock = at('10:24') + 1_000; // dentro del margen
        const attempt = await run(repo.submitExamAttempt('u3', 'c1-e1', {}, 1200, 'tiempo'));
        expect(attempt).toMatchObject({ kind: 'recuperacion', score: 10, answers: { q1: ['b'] } });
        expect(attempt.autoSubmitted).toBeUndefined();
      });

      it('después de las 10:05 nadie puede iniciar: queda «No rindió recuperación»', async () => {
        const repo = withState();
        await run(repo.authorizeRecovery('a1', shortWindow()));
        clock = at('10:05');
        expect(await fails(repo.startExam('u3', 'c1'))).toBe('El plazo de tu recuperación terminó sin que la iniciaras.');
        expect((await run(repo.getRecoveryStatus('u3', 'c1'))).status).toBe('no_rindio');
        expect(stored().examStarts).toEqual([]);
      });
    });

    it('el estudiante solo puede iniciar dentro del periodo; el regular queda cerrado para él', async () => {
      const repo = withState(ROSA_FAILED);
      await run(repo.authorizeRecovery('a1', input({ userId: 'u5' })));
      // Antes de la apertura: ni la recuperación ni el regular.
      expect(await run(repo.getExamAvailability('u5', 'c1'))).toMatchObject({
        available: false,
        reason: 'Tu recuperación estará disponible desde el 12/11/2026 09:00 (hora de Lima).',
      });
      expect(await fails(repo.startExam('u5', 'c1'))).toContain('estará disponible desde el 12/11/2026 09:00');
      expect(stored().examStarts).toEqual([]);
      // En la apertura exacta ya puede.
      clock = T0 + 1 * H;
      const started = await run(repo.startExam('u5', 'c1'));
      expect(started.exam.id).toBe('c1-e1');
      expect(stored().examStarts).toEqual([
        { userId: 'u5', examId: 'c1-e1', recoveryId: stored().recoveries[0].id, startedAt: '2026-11-12T09:00:00.000-05:00', endsAt: '2026-11-12T09:20:00.000-05:00' },
      ]);
      expect(stored().recoveries[0].startedAt).toBe('2026-11-12T09:00:00.000-05:00');
      // Otra pestaña o una recarga recuperan el mismo inicio.
      clock += 5 * MIN;
      expect(await run(new MockDataRepository().startExam('u5', 'c1'))).toEqual(started);
      expect(stored().examStarts).toHaveLength(1);
    });

    it('después del cierre no puede iniciar (no rindió); al empezar tarde, conserva la duración completa', async () => {
      const repo = withState();
      await run(repo.authorizeRecovery('a1', input()));
      clock = T0 + 3 * H - 10 * MIN; // 10:50, 10 minutos antes del cierre
      const late = await run(repo.startExam('u3', 'c1'));
      expect(late.endsAt).toBe('2026-11-12T11:10:00.000-05:00'); // corrección de R3 (regla E): 20 minutos completos
      clock = T0; // otra autorización, hecha con tiempo
      const other = withState();
      await run(other.authorizeRecovery('a1', input()));
      clock = T0 + 3 * H;
      expect(await fails(other.startExam('u3', 'c1'))).toBe('El plazo de tu recuperación terminó sin que la iniciaras.');
      expect(stored().examStarts).toEqual([]);
    });

    it('durante la ventana sigue exigiendo los videos completos (RN-11)', async () => {
      const repo = withState((s) => failedRegular(s, 'u2'));
      await run(repo.authorizeRecovery('a1', input({ userId: 'u2' }))); // desaprobado con videos pendientes
      clock = T0 + 1 * H;
      expect(await fails(repo.startExam('u2', 'c1'))).toBe('Debes completar todos los videos antes de rendir el examen.');
    });

    it('getStudentExam devuelve el examen de la recuperación (una histórica independiente conserva su examen)', async () => {
      const repo = withState((s) => {
        withIndependentExam(s);
        s.recoveries.push({
          id: 'rec-hist',
          userId: 'u3',
          courseId: 'c1',
          regularExamId: 'c1-e1',
          examId: 'c1-rec',
          reason: 'desaprobado',
          mode: 'independiente',
          opensAt: new Date(T0 + 1 * H).toISOString(),
          closesAt: new Date(T0 + 3 * H).toISOString(),
          authorizedBy: 'a1',
          authorizedAt: new Date(T0).toISOString(),
        });
      });
      expect(await run(repo.getStudentExam('u3', 'c1'))).toMatchObject({ id: 'c1-rec', kind: 'recuperacion' });
      expect(await run(repo.getStudentExam('u5', 'c1'))).toMatchObject({ id: 'c1-e1' }); // los demás, el regular
    });
  });

  describe('anulación', () => {
    it('antes del inicio: no consume la oportunidad y se puede volver a autorizar; el regular sigue cerrado (ya lo rindió)', async () => {
      const repo = withState(ROSA_FAILED);
      const first = await run(repo.authorizeRecovery('a1', input({ userId: 'u5' })));
      expect((await run(repo.getExamAvailability('u5', 'c1'))).available).toBe(false); // regular cerrado
      const cancelled = await run(repo.cancelRecovery('a1', first.id));
      expect(cancelled.cancelledAt).toBe('2026-11-12T08:00:00.000-05:00');
      expect(await run(repo.getRecoveryStatus('u5', 'c1'))).toMatchObject({ status: 'anulada', recovery: { id: first.id } });
      expect((await run(repo.getExamAvailability('u5', 'c1'))).available).toBe(false); // el regular ya se rindió (RN-07)
      const second = await run(repo.authorizeRecovery('a1', input({ userId: 'u5' })));
      expect(second.id).not.toBe(first.id);
      expect(stored().recoveries.map((r) => [r.id, !!r.cancelledAt])).toEqual([
        [first.id, true],
        [second.id, false],
      ]);
      expect(stored().attempts.filter(REC_U5)).toEqual([]);
    });

    it('no se puede anular una iniciada (tampoco si se inició en otra pestaña), una vencida ni una ya anulada', async () => {
      withState();
      const instructor = new MockDataRepository();
      const rec = await run(instructor.authorizeRecovery('a1', input()));
      clock = T0 + 1 * H;
      await run(new MockDataRepository().startExam('u3', 'c1')); // el estudiante, en su navegador
      expect(await fails(instructor.cancelRecovery('a1', rec.id))).toBe('No se puede anular: el estudiante ya inició la recuperación.');

      const repo = withState();
      clock = T0;
      const expired = await run(repo.authorizeRecovery('a1', input()));
      clock = T0 + 3 * H;
      expect(await fails(repo.cancelRecovery('a1', expired.id))).toContain('el plazo de la recuperación ya terminó');

      const again = withState();
      clock = T0;
      const twice = await run(again.authorizeRecovery('a1', input()));
      await run(again.cancelRecovery('a1', twice.id));
      expect(await fails(again.cancelRecovery('a1', twice.id))).toBe('Esta recuperación ya fue anulada.');
      expect(await fails(again.cancelRecovery('a1', 'no-existe'))).toBe('No se encontró la recuperación.');
    });

    it('no se puede anular una recuperación rendida', async () => {
      const repo = withState();
      const rec = await run(repo.authorizeRecovery('a1', input()));
      const s = stored();
      s.recoveries[0].attemptId = 'att-rec'; // como la dejará R4 al entregar
      localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
      expect(await fails(new MockDataRepository().cancelRecovery('a1', rec.id))).toBe('No se puede anular: la recuperación ya fue rendida.');
      expect((await run(new MockDataRepository().getRecoveryStatus('u3', 'c1'))).status).toBe('rendida');
    });
  });

  describe('estados y datos históricos', () => {
    it('pendiente → autorizada → no rindió; sin nota inventada: la regular de Carla se conserva', async () => {
      const repo = withState();
      expect(await run(repo.getRecoveryStatus('u3', 'c1'))).toMatchObject({ status: 'pendiente', reason: 'Desaprobó el examen regular.', recovery: null });
      expect(await run(repo.getRecoveryStatus('u5', 'c1'))).toMatchObject({ status: null, reason: NOT_TAKEN }); // ausente: no corresponde
      expect(await run(repo.getRecoveryStatus('u1', 'c1'))).toMatchObject({ status: null, reason: expect.stringContaining('aprobó') });
      await run(repo.authorizeRecovery('a1', input()));
      expect(await run(repo.getRecoveryStatus('u3', 'c1'))).toMatchObject({
        status: 'autorizada',
        reason: 'Disponible desde el 12/11/2026 09:00 (hora de Lima).',
      });
      clock = T0 + 2 * H;
      expect((await run(repo.getRecoveryStatus('u3', 'c1'))).reason).toBe('Disponible hasta el 12/11/2026 11:00 (hora de Lima).');
      clock = T0 + 3 * H;
      expect((await run(repo.getRecoveryStatus('u3', 'c1'))).status).toBe('no_rindio');
      const att2 = stored().attempts.find((a) => a.id === 'att2')!;
      expect([att2.score, att2.passed]).toEqual([50, false]);
      expect(stored().attempts.filter((a) => a.userId === 'u3')).toHaveLength(1);
    });

    it('una desaprobada que no rindió la recuperación conserva solo su intento regular (sin intento ni nota nuevos)', async () => {
      const repo = withState(ROSA_FAILED);
      await run(repo.authorizeRecovery('a1', input({ userId: 'u5' })));
      clock = T0 + 3 * H;
      expect((await run(repo.getRecoveryStatus('u5', 'c1'))).status).toBe('no_rindio');
      expect(stored().attempts.filter((a) => a.userId === 'u5').map((a) => a.id)).toEqual(['att-u5']);
      expect(stored().certificates.filter((c) => c.userId === 'u5')).toEqual([]);
    });

    it('listRecoveries filtra por estudiante y curso', async () => {
      const repo = withState(ROSA_FAILED);
      await run(repo.authorizeRecovery('a1', input()));
      await run(repo.authorizeRecovery('a1', input({ userId: 'u5' })));
      expect((await run(repo.listRecoveries())).map((r) => r.userId)).toEqual(['u3', 'u5']);
      expect((await run(repo.listRecoveries({ userId: 'u5' }))).map((r) => r.userId)).toEqual(['u5']);
      expect(await run(repo.listRecoveries({ courseId: 'c-ia' }))).toEqual([]);
    });

    it('intentos y certificados históricos quedan intactos en todo el flujo', async () => {
      const repo = withState(ROSA_FAILED);
      const before = stored();
      const rec = await run(repo.authorizeRecovery('a1', input({ userId: 'u5' })));
      await run(repo.cancelRecovery('a1', rec.id));
      await run(repo.authorizeRecovery('a1', input()));
      clock = T0 + 1 * H;
      await run(repo.startExam('u3', 'c1'));
      clock = T0 + 3 * H;
      await run(repo.getRecoveryStatus('u3', 'c1'));
      // Corrección de R3: la recuperación iniciada y abandonada se entregó automáticamente (un intento nuevo, propio);
      // los intentos y certificados anteriores no cambian.
      expect(stored().attempts.slice(0, before.attempts.length)).toEqual(before.attempts);
      expect(stored().attempts.slice(before.attempts.length)).toMatchObject([{ userId: 'u3', kind: 'recuperacion', autoSubmitted: true }]);
      expect(stored().certificates).toEqual(before.certificates);
      expect(stored().exams).toEqual(before.exams);
      expect(stored().questions).toEqual(before.questions);
    });

    it('sin recuperaciones, el examen regular funciona igual que antes (RN-07, R2)', async () => {
      const repo = withState();
      expect(await run(repo.getExamAvailability('u3', 'c1'))).toMatchObject({ available: false, reason: 'Alcanzaste el límite de intentos permitidos.' });
      const r = await run(repo.startExam('u5', 'c1'));
      expect(r.exam.id).toBe('c1-e1');
      expect(stored().examStarts[0].recoveryId).toBeUndefined();
    });
  });
});
