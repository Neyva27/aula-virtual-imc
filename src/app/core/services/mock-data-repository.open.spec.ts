import { Observable, firstValueFrom } from 'rxjs';
import { MockDataRepository, STORAGE_KEY } from './mock-data-repository';
import { SEED_QUESTIONS } from '../data/seed';
import { DemoState } from '../data/demo-state';
import { EXAM_LOCKED_MESSAGE, Question, isPendingReview } from '../models/exam.model';
import { addQuestionKeepingScale, setCourseStatus } from './testing/exam-points';

/**
 * M5: preguntas de selección única, múltiple y de respuesta abierta, calificación manual y RN-07 / RN-15.
 * Rosa (u5) está lista para rendir c1. Se usa un estado aislado sin intentos para poder editar c1-e1. Datos ficticios.
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

function withoutAttempts(): MockDataRepository {
  new MockDataRepository().resetDemo();
  const s = stored();
  s.attempts = [];
  s.certificates = s.certificates.filter((c) => c.userId !== 'u5');
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  return new MockDataRepository();
}

const open = (over: Partial<Question> = {}): Question => ({
  id: '',
  type: 'open',
  text: 'Explica con tus palabras qué es un riesgo laboral.',
  options: [],
  correct: [],
  points: 20,
  rubric: 'Menciona peligro, probabilidad y consecuencia.',
  ...over,
});

/** Respuestas correctas de las 10 preguntas de la semilla (100 puntos), más una respuesta abierta. */
function answers(openId: string, text = 'Es la posibilidad de que un peligro cause daño.'): Record<string, string[]> {
  return { ...Object.fromEntries(SEED_QUESTIONS.map((q) => [q.id, [...q.correct]])), [openId]: [text] };
}

/**
 * Etapa 2A: c1 está publicado, así que la suma de puntajes debe seguir siendo exactamente 100. La pregunta abierta se
 * agrega con el flujo del Instructor (borrador → repartir el resto de la escala entre las 10 de selección → publicar).
 */
async function withOpenQuestion(repo: MockDataRepository, over: Partial<Question> = {}): Promise<string> {
  const list = await addQuestionKeepingScale(repo, 'c1', EXAM, open(over));
  return list.find((q) => q.type === 'open')!.id;
}

describe('MockDataRepository — tipos de pregunta y respuestas abiertas (M5)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  describe('creación de preguntas', () => {
    it('guarda una pregunta abierta sin opciones ni respuesta correcta, con puntaje máximo y criterio', async () => {
      const repo = withoutAttempts();
      const id = await withOpenQuestion(repo, { options: [{ id: 'a', text: 'se ignora' }], correct: ['a'] });
      const q = (await run(repo.getExamQuestions(EXAM))).find((x) => x.id === id)!;
      expect(q).toMatchObject({ type: 'open', options: [], correct: [], points: 20, rubric: 'Menciona peligro, probabilidad y consecuencia.' });
    });

    it('valida enunciado, puntaje máximo y longitud del criterio', async () => {
      const repo = withoutAttempts();
      expect(await fails(repo.saveExamQuestion(EXAM, open({ text: ' ' })))).toBe('Escribe el enunciado de la pregunta.');
      expect(await fails(repo.saveExamQuestion(EXAM, open({ points: 0 })))).toBe('El puntaje máximo debe ser mayor que 0.');
      expect(await fails(repo.saveExamQuestion(EXAM, open({ rubric: 'x'.repeat(1001) })))).toContain('1000 caracteres');
    });

    it('selección única: una sola correcta; selección múltiple: una o varias; hasta 8 opciones', async () => {
      const repo = withoutAttempts();
      await setCourseStatus(repo, 'c1', 'borrador'); // Etapa 2A: en borrador se agregan preguntas sin exigir la suma exacta
      const opts = (n: number) => 'abcdefghi'.slice(0, n).split('').map((id) => ({ id, text: `Opción ${id}` }));
      const base = { id: '', text: '¿Cuál?', points: 10 };
      expect(await fails(repo.saveExamQuestion(EXAM, { ...base, type: 'single', options: opts(3), correct: ['a', 'b'] }))).toContain(
        'una sola respuesta correcta',
      );
      const multi = await run(repo.saveExamQuestion(EXAM, { ...base, type: 'multiple', options: opts(8), correct: ['a', 'c', 'h'] }));
      expect(multi.at(-1)).toMatchObject({ type: 'multiple', correct: ['a', 'c', 'h'] });
      expect(multi.at(-1)!.options.length).toBe(8);
      expect(await fails(repo.saveExamQuestion(EXAM, { ...base, type: 'multiple', options: opts(9), correct: ['a'] }))).toContain(
        'como máximo 8 opciones',
      );
      // Las preguntas de selección no conservan un criterio de calificación.
      const single = await run(repo.saveExamQuestion(EXAM, { ...base, type: 'single', options: opts(2), correct: ['b'], rubric: 'no aplica' }));
      expect('rubric' in single.at(-1)!).toBe(false);
    });

    it('RN-15: con intentos registrados no se pueden agregar preguntas abiertas', async () => {
      const repo = new MockDataRepository(); // la semilla tiene intentos en c1-e1
      expect(await fails(repo.saveExamQuestion(EXAM, open()))).toBe(EXAM_LOCKED_MESSAGE);
    });
  });

  // Etapa 2B (D1): los intentos nuevos ya no usan «todo o nada» sino la regla proporcional. «Todo o nada» se conserva
  // para los intentos anteriores (exam.model.grading.spec y mock-data-repository.proportional.spec).
  describe('selección múltiple: calificación proporcional (Etapa 2B)', () => {
    it('una respuesta parcial (entregada al agotarse el tiempo) suma en proporción a sus aciertos', async () => {
      const repo = withoutAttempts();
      const q = SEED_QUESTIONS.find((x) => x.type === 'multiple')!; // q6: 3 correctas de 5, 10 puntos
      const all = Object.fromEntries(SEED_QUESTIONS.map((x) => [x.id, [...x.correct]]));
      const partial = { ...all, [q.id]: q.correct.slice(0, 1) };
      const attempt = await run(repo.submitExamAttempt('u5', EXAM, partial, 20 * 60, 'tiempo'));
      expect(attempt.correctCount).toBe(SEED_QUESTIONS.length - 1); // preguntas con el puntaje completo
      expect(attempt.score).toBe(Math.round(100 - q.points + q.points / 3)); // 93,33 → 93
      expect(attempt.answers![q.id]).toEqual(q.correct.slice(0, 1)); // se guardan las respuestas del intento
      expect(attempt.review).toBeUndefined(); // sin preguntas abiertas no hay revisión
    });
  });

  describe('intento con preguntas abiertas', () => {
    it('queda «En revisión»: sin aprobado, sin certificado y con la respuesta guardada', async () => {
      const repo = withoutAttempts();
      const openId = await withOpenQuestion(repo);
      const attempt = await run(repo.submitExamAttempt('u5', EXAM, answers(openId), 300));
      expect(isPendingReview(attempt)).toBe(true);
      expect(attempt).toMatchObject({ passed: false, score: 0, correctCount: 10, totalQuestions: 11 });
      expect(attempt.answers![openId]).toEqual(['Es la posibilidad de que un peligro cause daño.']);
      expect(stored().enrollments.find((e) => e.userId === 'u5' && e.courseId === 'c1')!.status).toBe('en_revision');
      expect(stored().certificates.some((c) => c.userId === 'u5')).toBe(false);
    });

    it('RN-07: el intento pendiente consume el único intento; RN-15: la evaluación queda bloqueada', async () => {
      const repo = withoutAttempts();
      const openId = await withOpenQuestion(repo);
      await run(repo.submitExamAttempt('u5', EXAM, answers(openId), 300));
      const availability = await run(repo.getExamAvailability('u5', 'c1'));
      expect(availability.available).toBe(false);
      expect(availability.reason).toContain('está en revisión');
      expect(availability.remainingAttempts).toBe(0);
      expect(await fails(repo.submitExamAttempt('u5', EXAM, answers(openId), 300))).toContain('en revisión');
      expect(await fails(repo.saveExamQuestion(EXAM, open()))).toBe(EXAM_LOCKED_MESSAGE);
      expect(await fails(repo.deleteExamQuestion(EXAM, openId))).toBe(EXAM_LOCKED_MESSAGE);
    });

    it('publicar o despublicar videos no devuelve a «listo para examen» a quien está en revisión', async () => {
      const repo = withoutAttempts();
      const openId = await withOpenQuestion(repo);
      await run(repo.submitExamAttempt('u5', EXAM, answers(openId), 300));
      await run(repo.saveCourseVideo('c1', { title: 'Extra', durationSec: 360, published: true, url: 'https://videos.ejemplo.test/extra.mp4' }));
      expect(stored().enrollments.find((e) => e.userId === 'u5' && e.courseId === 'c1')!.status).toBe('en_revision');
    });

    it('una respuesta abierta vacía o con solo espacios no se guarda (cuenta como sin responder)', async () => {
      const repo = withoutAttempts();
      const openId = await withOpenQuestion(repo);
      // Etapa 2B (D3): sin texto no se puede entregar voluntariamente; al agotarse el tiempo sí, y cuenta como sin responder.
      expect(await fails(repo.submitExamAttempt('u5', EXAM, answers(openId, '   '), 300))).toBe(
        'Para entregar debes completar todas las preguntas. Falta completar la pregunta 11.',
      );
      const attempt = await run(repo.submitExamAttempt('u5', EXAM, answers(openId, '   '), 20 * 60, 'tiempo'));
      expect(openId in attempt.answers!).toBe(false);
      expect(isPendingReview(attempt)).toBe(true); // igual la califica el administrador (con 0 si corresponde)
    });
  });

  describe('calificación manual', () => {
    async function pending(repo: MockDataRepository, over: Partial<Question> = {}) {
      const openId = await withOpenQuestion(repo, over);
      const attempt = await run(repo.submitExamAttempt('u5', EXAM, answers(openId), 300));
      return { openId, attemptId: attempt.id };
    }

    it('al completar: nota con todos los puntajes, aprobado y certificado con esa nota', async () => {
      const repo = withoutAttempts();
      const { openId, attemptId } = await pending(repo);
      const graded = await run(repo.gradeOpenAnswers(attemptId, [{ questionId: openId, score: 15 }]));
      // Etapa 2A (suma exacta): 10 de selección × 8 = 80 + 15 de 20 en la abierta = 95 / 100 (antes, 115 / 120 → 96).
      expect(graded).toMatchObject({ score: 95, passed: true });
      expect(graded.review).toMatchObject({ status: 'calificado', manualScores: { [openId]: 15 } });
      expect(graded.review!.gradedAt).toBeTruthy();
      const s = stored();
      expect(s.enrollments.find((e) => e.userId === 'u5' && e.courseId === 'c1')!.status).toBe('aprobado');
      const cert = s.certificates.filter((c) => c.userId === 'u5');
      expect(cert.length).toBe(1);
      expect(cert[0]).toMatchObject({ attemptId, score: 95, status: 'vigente', courseId: 'c1' });
    });

    it('si no alcanza la nota mínima queda desaprobado y no se emite certificado', async () => {
      const repo = withoutAttempts();
      // La abierta pesa más que las de selección. Etapa 2A: la suma debe ser 100, así que la abierta vale 60 (antes 200,
      // imposible con escala 100) y las 10 de selección, 4 cada una.
      const openId = await withOpenQuestion(repo, { points: 60 });
      const attempt = await run(repo.submitExamAttempt('u5', EXAM, answers(openId), 300));
      const graded = await run(repo.gradeOpenAnswers(attempt.id, [{ questionId: openId, score: 0 }]));
      // 40 de selección + 0 en la abierta = 40 / 100, por debajo de la nota mínima (60). Antes: 100 / 300 → 33.
      expect(graded).toMatchObject({ score: 40, passed: false });
      expect(stored().enrollments.find((e) => e.userId === 'u5' && e.courseId === 'c1')!.status).toBe('desaprobado');
      expect(stored().certificates.some((c) => c.userId === 'u5')).toBe(false);
    });

    it('valida los puntajes y exige calificar todas las abiertas', async () => {
      const repo = withoutAttempts();
      const { openId, attemptId } = await pending(repo);
      expect(await fails(repo.gradeOpenAnswers(attemptId, []))).toBe('Falta calificar una pregunta abierta.');
      for (const score of [-1, 21, Number.NaN, 7.3]) {
        expect(await fails(repo.gradeOpenAnswers(attemptId, [{ questionId: openId, score }]))).toContain('debe estar entre 0 y 20');
      }
      expect(await fails(repo.gradeOpenAnswers(attemptId, [{ questionId: 'q1', score: 5 }]))).toContain('no corresponde a una pregunta abierta');
      expect(await fails(repo.gradeOpenAnswers('no-existe', []))).toBe('No se encontró el intento.');
      // Nada cambió: sigue en revisión.
      expect(isPendingReview(stored().attempts.find((a) => a.id === attemptId)!)).toBe(true);
      // Se admiten medios puntos.
      expect((await run(repo.gradeOpenAnswers(attemptId, [{ questionId: openId, score: 7.5 }]))).review!.status).toBe('calificado');
    });

    it('una calificación completada no se cambia, y los intentos sin abiertas no se califican a mano', async () => {
      const repo = withoutAttempts();
      const { openId, attemptId } = await pending(repo);
      await run(repo.gradeOpenAnswers(attemptId, [{ questionId: openId, score: 20 }]));
      expect(await fails(repo.gradeOpenAnswers(attemptId, [{ questionId: openId, score: 0 }]))).toContain('no tiene preguntas pendientes');
      const seed = new MockDataRepository();
      seed.resetDemo();
      expect(await fails(seed.gradeOpenAnswers('att1', []))).toContain('no tiene preguntas pendientes');
    });

    it('calificar no modifica la evaluación (RN-15)', async () => {
      const repo = withoutAttempts();
      const { openId, attemptId } = await pending(repo);
      const before = JSON.stringify({ e: stored().exams.find((e) => e.id === EXAM), q: stored().questions.filter((q) => q.examId === EXAM) });
      await run(repo.gradeOpenAnswers(attemptId, [{ questionId: openId, score: 10 }]));
      expect(JSON.stringify({ e: stored().exams.find((e) => e.id === EXAM), q: stored().questions.filter((q) => q.examId === EXAM) })).toBe(before);
    });
  });
});
