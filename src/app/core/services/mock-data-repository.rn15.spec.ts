import { Observable, firstValueFrom } from 'rxjs';
import { MockDataRepository, STORAGE_KEY } from './mock-data-repository';
import { SEED_EXAM, SEED_QUESTIONS } from '../data/seed';
import { DemoState } from '../data/demo-state';
import { EXAM_LOCKED_MESSAGE, Question } from '../models/exam.model';

/**
 * RN-15: un examen con al menos un intento registrado no admite cambios en su configuración ni en sus preguntas.
 * El bloqueo lo aplica el repositorio. Los estados se preparan solo en el localStorage aislado de la prueba.
 */
const run = <T>(obs: Observable<T>): Promise<T> => firstValueFrom(obs);
const stored = (): DemoState => JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
const question = (over: Partial<Question> = {}): Question => ({ ...structuredClone(SEED_QUESTIONS[0]), id: 'nueva', ...over });
const config = { timeMinutes: 30, scaleMax: 20, passScore: 11, maxAttempts: 1 };

function allCorrect(): Record<string, string[]> {
  return Object.fromEntries(SEED_QUESTIONS.map((q) => [q.id, [...q.correct]]));
}

function withState(edit: (s: DemoState) => void): MockDataRepository {
  new MockDataRepository().resetDemo();
  const s = stored();
  edit(s);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  return new MockDataRepository();
}

/** Todo lo que un cambio bloqueado no debe tocar: exámenes, preguntas, intentos, certificados e inscripciones. */
function history() {
  const s = stored();
  return { exams: s.exams, questions: s.questions, attempts: s.attempts, certificates: s.certificates, enrollments: s.enrollments };
}

/** Intenta todas las modificaciones posibles sobre un examen y devuelve los mensajes de rechazo. */
async function tryAllChanges(repo: MockDataRepository, examId: string, existingQuestionId: string): Promise<string[]> {
  const ops: Observable<unknown>[] = [
    repo.updateExamConfigById(examId, config),
    repo.saveExamQuestion(examId, question()),
    repo.saveExamQuestion(examId, question({ id: existingQuestionId, text: 'Editada' })),
    repo.deleteExamQuestion(examId, existingQuestionId),
  ];
  const messages: string[] = [];
  for (const op of ops) {
    try {
      await run(op);
      messages.push('aceptado');
    } catch (e) {
      messages.push((e as Error).message);
    }
  }
  return messages;
}

describe('RN-15: bloqueo de edición de evaluaciones con intentos', () => {
  let repo: MockDataRepository;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    repo = new MockDataRepository();
  });

  describe('evaluación sin intentos', () => {
    it('permite modificar su configuración', async () => {
      const saved = await run(repo.updateExamConfigById('c-ia-e1', config));
      expect(saved).toMatchObject({ id: 'c-ia-e1', timeMinutes: 30, scaleMax: 20, passScore: 11, maxAttempts: 1 });
    });

    it('permite agregar, editar y eliminar preguntas', async () => {
      let list = await run(repo.saveExamQuestion('c-mkt-e1', question()));
      expect(list.length).toBe(1);
      const id = list[0].id;
      list = await run(repo.saveExamQuestion('c-mkt-e1', question({ id, text: 'Editada' })));
      expect(list.map((q) => q.text)).toEqual(['Editada']);
      list = await run(repo.saveExamQuestion('c-mkt-e1', question({ text: 'Segunda' })));
      expect(list.length).toBe(2);
      list = await run(repo.deleteExamQuestion('c-mkt-e1', id));
      expect(list.map((q) => q.text)).toEqual(['Segunda']);
    });
  });

  describe('evaluación con intentos', () => {
    it('bloquea la configuración, incluso con los mismos valores o con valores inválidos', async () => {
      // c1-e1 tiene 3 intentos en la semilla (Ana, Carla y Jorge).
      await expect(run(repo.updateExamConfigById('c1-e1', config))).rejects.toThrow(EXAM_LOCKED_MESSAGE);
      await expect(run(repo.updateExamConfigById('c1-e1', SEED_EXAM))).rejects.toThrow(EXAM_LOCKED_MESSAGE);
      // El motivo que se informa es el bloqueo, no una validación de formato.
      await expect(run(repo.updateExamConfigById('c1-e1', { ...SEED_EXAM, timeMinutes: 0 }))).rejects.toThrow(EXAM_LOCKED_MESSAGE);
      // También por la vía heredada del curso principal.
      await expect(run(repo.updateExamConfig(config))).rejects.toThrow(EXAM_LOCKED_MESSAGE);
    });

    it('bloquea agregar, editar y eliminar preguntas (también por la vía heredada)', async () => {
      expect(await tryAllChanges(repo, 'c1-e1', 'q1')).toEqual([
        EXAM_LOCKED_MESSAGE,
        EXAM_LOCKED_MESSAGE,
        EXAM_LOCKED_MESSAGE,
        EXAM_LOCKED_MESSAGE,
      ]);
      await expect(run(repo.saveQuestion(question()))).rejects.toThrow(EXAM_LOCKED_MESSAGE);
      await expect(run(repo.saveQuestion(question({ id: 'q2', text: 'Editada' })))).rejects.toThrow(EXAM_LOCKED_MESSAGE);
      await expect(run(repo.deleteQuestion('q2'))).rejects.toThrow(EXAM_LOCKED_MESSAGE);
    });

    it('un intento rechazado no altera intentos, notas, escalas, certificados ni preguntas', async () => {
      new MockDataRepository().resetDemo();
      repo = new MockDataRepository();
      const before = history();
      await tryAllChanges(repo, 'c1-e1', 'q1');
      await run(repo.updateExamConfig(config)).catch(() => {});
      await run(repo.saveQuestion(question())).catch(() => {});
      await run(repo.deleteQuestion('q1')).catch(() => {});
      expect(history()).toEqual(before);
      // Las notas históricas siguen visibles con su escala.
      expect((await run(repo.listAttempts({ examId: 'c1-e1' }))).map((a) => `${a.id}:${a.score}/${a.scaleMax}`)).toEqual([
        'att1:80/100',
        'att2:50/100',
        'att3:90/100',
      ]);
      expect((await run(repo.getExamQuestions('c1-e1'))).length).toBe(10);
    });

    it('basta un intento: la evaluación se bloquea en cuanto un alumno la rinde', async () => {
      // Etapa 2A: la configuración de prueba cambia la escala a 20; con c1 publicado eso descuadraría la suma (100), así
      // que se comprueba con c1 en borrador, donde lo único que impediría guardar sería RN-15.
      repo = withState((s) => {
        s.attempts = [];
        s.courses.find((c) => c.id === 'c1')!.status = 'borrador';
      });
      expect((await tryAllChanges(repo, 'c1-e1', 'q1'))[0]).toBe('aceptado'); // sin intentos, la configuración se guarda
      repo = withState((s) => (s.attempts = []));
      await run(repo.submitExamAttempt('u5', 'c1-e1', allCorrect(), 120));
      expect(await tryAllChanges(repo, 'c1-e1', 'q1')).toEqual(Array(4).fill(EXAM_LOCKED_MESSAGE));
    });
  });

  describe('por curso y por evaluación', () => {
    it('el bloqueo de un curso no afecta a los demás', async () => {
      repo = withState((s) => {
        // Intento ficticio solo en la evaluación de IA.
        s.attempts.push({ ...s.attempts[0], id: 'att-ia', userId: 'u4', courseId: 'c-ia', examId: 'c-ia-e1' });
        s.questions.push({ ...structuredClone(SEED_QUESTIONS[0]), id: 'ia-q1', examId: 'c-ia-e1' });
      });
      expect(await tryAllChanges(repo, 'c-ia-e1', 'ia-q1')).toEqual(Array(4).fill(EXAM_LOCKED_MESSAGE));
      // Marketing no tiene intentos: sigue editable.
      expect((await tryAllChanges(repo, 'c-mkt-e1', 'no-existe')).slice(0, 2)).toEqual(['aceptado', 'aceptado']);
    });

    it('el bloqueo es de cada evaluación: una evaluación nueva del mismo curso se puede editar', async () => {
      // Etapa 2A: c1 en borrador, para editar la evaluación nueva sin exigir todavía la suma exacta de puntajes.
      repo = withState((s) => {
        s.exams.find((e) => e.id === 'c1-e1')!.active = false;
        s.courses.find((c) => c.id === 'c1')!.status = 'borrador';
      });
      const created = await run(repo.createCourseExam('c1'));
      expect(created.id).not.toBe('c1-e1');
      expect(await run(repo.updateExamConfigById(created.id, config))).toMatchObject({ timeMinutes: 30 });
      expect((await run(repo.saveExamQuestion(created.id, question()))).length).toBe(1);
      // La evaluación anterior, con intentos, sigue bloqueada aunque ya no esté activa.
      await expect(run(repo.updateExamConfigById('c1-e1', config))).rejects.toThrow(EXAM_LOCKED_MESSAGE);
      await expect(run(repo.deleteExamQuestion('c1-e1', 'q1'))).rejects.toThrow(EXAM_LOCKED_MESSAGE);
    });
  });

  it('las funciones del alumno siguen funcionando con una evaluación bloqueada', async () => {
    await run(repo.updateExamConfigById('c1-e1', config)).catch(() => {});
    // Rosa todavía no rindió: puede hacerlo con la configuración intacta (sobre 100).
    expect(await run(repo.getExamAvailability('u5', 'c1'))).toMatchObject({ available: true, remainingAttempts: 1 });
    const attempt = await run(repo.submitExamAttempt('u5', 'c1-e1', allCorrect(), 120));
    expect(attempt).toMatchObject({ score: 100, scaleMax: 100, passed: true });
    expect((await run(repo.listCertificates({ userId: 'u5' }))).length).toBe(1);
    // Y la regla de un intento se mantiene.
    await expect(run(repo.submitExamAttempt('u5', 'c1-e1', allCorrect(), 120))).rejects.toThrow('Ya aprobaste este examen.');
  });
});
