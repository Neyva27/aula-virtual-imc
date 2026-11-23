import { Observable, firstValueFrom } from 'rxjs';
import { MockDataRepository, STORAGE_KEY } from './mock-data-repository';
import { SEED_QUESTIONS } from '../data/seed';
import { DemoState } from '../data/demo-state';
import { EXAM_LOCKED_MESSAGE, MAX_ATTEMPTS, Question, scoreDistribution } from '../models/exam.model';
import { setCourseStatus } from './testing/exam-points';

/**
 * Etapa 2A (requisito 18): la suma de los puntajes debe ser exactamente la nota máxima (20 o 100).
 * Decisiones del 09/11/2026: en borrador se edita libremente; con el curso publicado se exige en cada cambio; publicar el
 * curso y rendir el examen requieren la suma exacta; las evaluaciones con intentos se conservan como están (RN-15).
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
const c1Questions = (s: DemoState) => s.questions.filter((q) => q.examId === EXAM);

/** Semilla con cambios aplicados antes de crear el repositorio. */
function withState(edit: (s: DemoState) => void): MockDataRepository {
  new MockDataRepository().resetDemo();
  const s = stored();
  edit(s);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  return new MockDataRepository();
}
/** c1 sin intentos, con las 10 preguntas de la semilla en `points` cada una y el curso en el estado indicado. */
function c1With(points: number, status: 'publicado' | 'borrador', scaleMax = 100): MockDataRepository {
  return withState((s) => {
    s.attempts = [];
    s.certificates = s.certificates.filter((c) => c.userId !== 'u5');
    c1Questions(s).forEach((q) => (q.points = points));
    s.exams.find((e) => e.id === EXAM)!.scaleMax = scaleMax;
    s.exams.find((e) => e.id === EXAM)!.passScore = scaleMax === 20 ? 11 : 60;
    s.courses.find((c) => c.id === 'c1')!.status = status;
  });
}
const allCorrect = () => Object.fromEntries(SEED_QUESTIONS.map((q) => [q.id, [...q.correct]]));
const plain = async (repo: MockDataRepository, id: string): Promise<Question> => {
  const { examId: _e, ...q } = (await run(repo.getExamQuestions(EXAM))).find((x) => x.id === id)!;
  return q;
};
const config = (scaleMax: number) => ({ timeMinutes: 20, scaleMax, passScore: scaleMax === 20 ? 11 : 60, maxAttempts: MAX_ATTEMPTS });

describe('Etapa 2A: suma de puntajes = nota máxima', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  describe('cálculo y mensajes (scoreDistribution)', () => {
    const pts = (...p: number[]) => p.map((points) => ({ points }));
    it.each([
      [20, pts(10, 10), true, 'La distribución de puntajes es correcta.'],
      [20, pts(10, 9), false, 'La suma de los puntajes es 19. Debe ser exactamente 20 (faltan 1 punto).'],
      [20, pts(10, 11), false, 'La suma de los puntajes es 21. Debe ser exactamente 20 (sobran 1 punto).'],
      [100, pts(50, 50), true, 'La distribución de puntajes es correcta.'],
      [100, pts(50, 45), false, 'La suma de los puntajes es 95. Debe ser exactamente 100 (faltan 5 puntos).'],
      [100, pts(50, 55), false, 'La suma de los puntajes es 105. Debe ser exactamente 100 (sobran 5 puntos).'],
      [20, pts(19.5, 0.5), true, 'La distribución de puntajes es correcta.'],
      [100, [], false, 'La suma de los puntajes es 0. Debe ser exactamente 100 (faltan 100 puntos).'],
    ])('escala %i con %j', (scale, questions, valid, message) => {
      expect(scoreDistribution(questions, scale)).toMatchObject({ valid, message });
    });

    it('suma medios puntos sin errores de coma flotante', () => {
      expect(scoreDistribution(pts(...Array(10).fill(0.1), 19), 20)).toMatchObject({ total: 20, valid: true });
    });
  });

  describe('publicar el curso exige la suma exacta', () => {
    it.each([
      [20, 2, true, ''], // 10 × 2 = 20
      [100, 10, true, ''], // 10 × 10 = 100
    ])('escala %i con 10 preguntas de %i puntos: se puede publicar', async (scale, each) => {
      const repo = c1With(each, 'borrador', scale);
      const check = await run(repo.getPublicationCheck('c1'));
      expect(check.blocking).toEqual([]);
      await setCourseStatus(repo, 'c1', 'publicado');
      expect((await run(repo.getCourses())).find((c) => c.id === 'c1')!.status).toBe('publicado');
    });

    it.each([
      [20, 19, 'La suma de los puntajes es 19. Debe ser exactamente 20 (faltan 1 punto).'],
      [20, 21, 'La suma de los puntajes es 21. Debe ser exactamente 20 (sobran 1 punto).'],
      [100, 95, 'La suma de los puntajes es 95. Debe ser exactamente 100 (faltan 5 puntos).'],
      [100, 105, 'La suma de los puntajes es 105. Debe ser exactamente 100 (sobran 5 puntos).'],
    ])('escala %i con suma %i: no se puede publicar', async (scale, total, message) => {
      const each = scale === 20 ? 2 : 10;
      const repo = withState((s) => {
        s.attempts = [];
        const qs = c1Questions(s);
        qs.forEach((q) => (q.points = each));
        qs[0].points = each + (total - each * qs.length); // ajusta la primera para llegar a `total`
        s.exams.find((e) => e.id === EXAM)!.scaleMax = scale;
        s.exams.find((e) => e.id === EXAM)!.passScore = scale === 20 ? 11 : 60;
        s.courses.find((c) => c.id === 'c1')!.status = 'borrador';
      });
      const check = await run(repo.getPublicationCheck('c1'));
      expect(check.canPublish).toBe(false);
      expect(check.blocking).toContain(message);
      expect(await fails(repo.updateCourseById('c1', { ...(await run(repo.getCourses())).find((c) => c.id === 'c1')!, status: 'publicado' }))).toContain(
        message,
      );
      expect(stored().courses.find((c) => c.id === 'c1')!.status).toBe('borrador');
    });
  });

  describe('en borrador se edita libremente y el total se recalcula', () => {
    it('agregar, editar y eliminar preguntas se acepta aunque la suma no coincida', async () => {
      const repo = c1With(10, 'borrador');
      let list = await run(repo.saveExamQuestion(EXAM, { ...(await plain(repo, 'q1')), id: '', text: 'Nueva' }));
      expect(scoreDistribution(list, 100).total).toBe(110);
      list = await run(repo.saveExamQuestion(EXAM, { ...(await plain(repo, 'q1')), points: 4 }));
      expect(scoreDistribution(list, 100).total).toBe(104);
      list = await run(repo.deleteExamQuestion(EXAM, 'q2'));
      expect(scoreDistribution(list, 100).total).toBe(94);
      expect(await run(repo.updateExamConfigById(EXAM, config(20)))).toMatchObject({ scaleMax: 20 });
    });
  });

  describe('con el curso publicado, ningún camino del repositorio deja la suma descuadrada', () => {
    it('cambiar la escala sin ajustar los puntajes se rechaza; mantenerla se acepta', async () => {
      const repo = c1With(10, 'publicado');
      expect(await fails(repo.updateExamConfigById(EXAM, config(20)))).toContain('Debe ser exactamente 20 (sobran 80 puntos)');
      expect(stored().exams.find((e) => e.id === EXAM)!.scaleMax).toBe(100);
      expect(await run(repo.updateExamConfigById(EXAM, { ...config(100), timeMinutes: 25 }))).toMatchObject({ timeMinutes: 25 });
    });

    it('agregar, cambiar el puntaje o eliminar se rechaza y no cambia nada', async () => {
      const repo = c1With(10, 'publicado');
      const before = JSON.stringify(c1Questions(stored()));
      expect(await fails(repo.saveExamQuestion(EXAM, { ...(await plain(repo, 'q1')), id: '' }))).toContain(
        'La suma de los puntajes es 110. Debe ser exactamente 100 (sobran 10 puntos).',
      );
      expect(await fails(repo.saveExamQuestion(EXAM, { ...(await plain(repo, 'q1')), points: 5 }))).toContain('faltan 5 puntos');
      expect(await fails(repo.deleteExamQuestion(EXAM, 'q1'))).toContain('faltan 10 puntos');
      expect(JSON.stringify(c1Questions(stored()))).toBe(before);
    });

    it('editar el enunciado sin cambiar el puntaje se acepta', async () => {
      const repo = c1With(10, 'publicado');
      const list = await run(repo.saveExamQuestion(EXAM, { ...(await plain(repo, 'q1')), text: 'Enunciado corregido' }));
      expect(list.find((q) => q.id === 'q1')!.text).toBe('Enunciado corregido');
    });

    it('los métodos heredados del curso principal tampoco la evaden', async () => {
      const repo = c1With(10, 'publicado');
      expect(await fails(repo.updateExamConfig(config(20)))).toContain('Debe ser exactamente 20');
      expect(await fails(repo.saveQuestion({ ...(await plain(repo, 'q1')), id: 'otra' }))).toContain('sobran 10 puntos');
      expect(await fails(repo.deleteQuestion('q1'))).toContain('faltan 10 puntos');
    });

    it('escala 20 publicada con suma 20: cambios que la mantienen se aceptan', async () => {
      const repo = c1With(2, 'publicado', 20);
      expect(await run(repo.updateExamConfigById(EXAM, { ...config(20), passScore: 12 }))).toMatchObject({ passScore: 12 });
      expect(await fails(repo.saveExamQuestion(EXAM, { ...(await plain(repo, 'q1')), points: 3 }))).toContain(
        'La suma de los puntajes es 21. Debe ser exactamente 20 (sobran 1 punto).',
      );
    });
  });

  describe('el alumno', () => {
    it('no puede rendir un examen cuya suma no coincide (sin intentos previos)', async () => {
      const repo = withState((s) => {
        s.attempts = [];
        c1Questions(s)[0].points = 5; // suma 95, curso publicado
      });
      const availability = await run(repo.getExamAvailability('u5', 'c1'));
      expect(availability.available).toBe(false);
      expect(availability.reason).toContain('la suma de los puntajes de sus preguntas no coincide con la nota máxima');
      expect(await fails(repo.submitExamAttempt('u5', EXAM, allCorrect(), 60))).toContain('no coincide con la nota máxima');
    });

    it('rinde normalmente con la suma exacta; la selección múltiple se califica en proporción (Etapa 2B)', async () => {
      const repo = c1With(10, 'publicado');
      const multiple = SEED_QUESTIONS.find((q) => q.type === 'multiple')!; // q6: 3 correctas, 3 exigidas
      const wrong = multiple.options.find((o) => !multiple.correct.includes(o.id))!.id;
      const attempt = await run(
        repo.submitExamAttempt('u5', EXAM, { ...allCorrect(), [multiple.id]: [...multiple.correct.slice(0, 1), wrong, 'd'] }, 60),
      );
      // 1 de 3 correctas: 90 + 3,33 = 93,33 → 93 (antes, con «todo o nada», 90).
      expect(attempt).toMatchObject({ correctCount: 9, score: 93, scaleMax: 100, passed: true, gradingRule: 'proporcional' });
    });

    it('con escala 20 y suma 20, la nota es la suma de los puntos obtenidos', async () => {
      const repo = c1With(2, 'publicado', 20);
      const attempt = await run(repo.submitExamAttempt('u5', EXAM, allCorrect(), 60));
      expect(attempt).toMatchObject({ score: 20, scaleMax: 20, passed: true });
    });
  });

  describe('RN-15: evaluaciones con intentos se conservan como están', () => {
    /** Semilla (c1 con 3 intentos) con la suma descuadrada en los datos guardados, como podría quedar en un navegador. */
    const mismatched = () => withState((s) => (c1Questions(s)[0].points = 30)); // suma 120

    it('no se bloquean: se informa en la publicación y los alumnos pendientes pueden rendir', async () => {
      const repo = mismatched();
      const check = await run(repo.getPublicationCheck('c1'));
      expect(check.blocking).toEqual([]);
      expect(check.warnings.join(' ')).toContain('se conserva sin cambios (RN-15)');
      expect(await run(repo.getExamAvailability('u5', 'c1'))).toMatchObject({ available: true });
    });

    it('siguen bloqueadas para editar (RN-15) y conservan sus notas, escalas y certificados', async () => {
      const repo = mismatched();
      const before = JSON.stringify({ a: stored().attempts, c: stored().certificates, e: stored().exams.find((e) => e.id === EXAM) });
      expect(await fails(repo.updateExamConfigById(EXAM, config(100)))).toBe(EXAM_LOCKED_MESSAGE);
      expect(await fails(repo.saveExamQuestion(EXAM, { ...(await plain(repo, 'q1')), points: 10 }))).toBe(EXAM_LOCKED_MESSAGE);
      expect(await fails(repo.deleteExamQuestion(EXAM, 'q1'))).toBe(EXAM_LOCKED_MESSAGE);
      expect(JSON.stringify({ a: stored().attempts, c: stored().certificates, e: stored().exams.find((e) => e.id === EXAM) })).toBe(before);
      expect(stored().attempts.map((a) => [a.id, a.score, a.scaleMax])).toEqual([
        ['att1', 80, 100],
        ['att2', 50, 100],
        ['att3', 90, 100],
      ]);
    });
  });
});
