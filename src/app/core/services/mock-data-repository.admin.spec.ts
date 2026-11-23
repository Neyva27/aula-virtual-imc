import { Observable, firstValueFrom } from 'rxjs';
import { MockDataRepository, STORAGE_KEY } from './mock-data-repository';
import { SEED_QUESTIONS } from '../data/seed';
import { DemoState } from '../data/demo-state';
import { CourseVideoInput } from '../models/course.model';
import { Question } from '../models/exam.model';

/**
 * E5.1: operaciones de administración por curso (videos, examen, preguntas, publicación y asignaciones).
 * Todos los datos son ficticios. Ninguna prueba crea contenido académico para la semilla.
 */
const run = <T>(obs: Observable<T>): Promise<T> => firstValueFrom(obs);
const stored = (): DemoState => JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');

const video = (over: Partial<CourseVideoInput> = {}): CourseVideoInput => ({
  title: 'Video de prueba',
  durationSec: 360,
  published: true,
  url: 'https://videos.ejemplo.test/clase.mp4',
  ...over,
});

const question = (over: Partial<Question> = {}): Question => ({ ...structuredClone(SEED_QUESTIONS[0]), id: 'nueva', ...over });

/**
 * RN-15: el examen de c1 tiene intentos en la semilla y no admite cambios. Para probar otras reglas sobre c1
 * (como la pregunta mínima de un curso publicado) se usa un estado aislado sin intentos.
 */
function withoutAttempts(): MockDataRepository {
  new MockDataRepository().resetDemo();
  const s = stored();
  s.attempts = [];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  return new MockDataRepository();
}

/**
 * Etapa 2A: c1 sin intentos y con una sola pregunta de 100 puntos (suma exacta con escala 100). Con el curso publicado
 * ya no se puede llegar a ese estado eliminando preguntas una a una, porque cada eliminación descuadra la suma.
 */
function withSingleC1Question(): MockDataRepository {
  new MockDataRepository().resetDemo();
  const s = stored();
  s.attempts = [];
  s.questions = s.questions.filter((q) => q.examId !== 'c1-e1' || q.id === 'q1');
  s.questions.find((q) => q.id === 'q1')!.points = 100;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  return new MockDataRepository();
}

function allCorrect(): Record<string, string[]> {
  return Object.fromEntries(SEED_QUESTIONS.map((q) => [q.id, [...q.correct]]));
}

describe('MockDataRepository — administración por curso (E5.1)', () => {
  let repo: MockDataRepository;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    repo = new MockDataRepository();
  });

  /** Huella de c1 para comprobar que las operaciones en otros cursos no lo alteran. */
  async function c1Snapshot() {
    return {
      course: await run(repo.getCourse()),
      exam: await run(repo.getExamConfig()),
      questions: await run(repo.getQuestions()),
      enrollments: await run(repo.getEnrollments()),
    };
  }

  describe('videos por curso', () => {
    it('agrega un video a un curso sin alterar los demás', async () => {
      const before = await c1Snapshot();
      const content = await run(repo.saveCourseVideo('c-ia', video({ url: 'https://youtu.be/Ctd6BTuZmjA' })));
      const videos = content.modules.flatMap((m) => m.videos);
      expect(videos.map((v) => v.courseId)).toEqual(['c-ia', 'c-ia']);
      expect(videos[1]).toMatchObject({ order: 2, moduleId: 'c-ia-m1', source: { kind: 'youtube', videoId: 'Ctd6BTuZmjA' } });
      expect(await c1Snapshot()).toEqual(before);
      const mkt = await run(repo.getCourseContent('c-mkt'));
      expect(mkt.modules.flatMap((m) => m.videos).map((v) => v.id)).toEqual(['c-mkt-v1']);
    });

    it('editar el video de Marketing conserva su duración real (10:03) y su fuente', async () => {
      const content = await run(
        repo.saveCourseVideo('c-mkt', video({ id: 'c-mkt-v1', title: 'Título editado', durationSec: 603, url: 'https://www.youtube.com/watch?v=Ctd6BTuZmjA' })),
      );
      expect(content.modules[0].videos[0]).toMatchObject({
        title: 'Título editado',
        durationSec: 603,
        source: { kind: 'youtube', videoId: 'Ctd6BTuZmjA' },
        sourceCredit: 'Canal «Emprende Aprendiendo» en YouTube',
      });
      // 20/11/2026: sin límite de duración, 10:03 ya no genera aviso (solo falta el mínimo de videos del módulo).
      expect(content.ruleIssues.some((i) => i.includes('dura'))).toBe(false);
    });

    it('interpreta el enlace: vacío, YouTube u otro https; rechaza el resto', async () => {
      // 21/11/2026: sin «Sin archivo»: un video nuevo sin enlace se rechaza.
      await expect(run(repo.saveCourseVideo('c-ia', video({ url: '' })))).rejects.toThrow('Ingresa el enlace del video');
      const c = await run(repo.saveCourseVideo('c-ia', video({ url: ' https://ejemplo.test/clase.mp4 ' })));
      expect(c.modules[0].videos.at(-1)!.source).toEqual({ kind: 'url', url: 'https://ejemplo.test/clase.mp4' });
      for (const url of ['javascript:alert(1)', 'http://ejemplo.test/x', 'ftp://ejemplo.test/x', 'no es un enlace']) {
        await expect(run(repo.saveCourseVideo('c-ia', video({ url })))).rejects.toThrow('El enlace del video no es válido');
      }
    });

    it('valida título y duración; no hay máximo de videos por curso (19/11/2026)', async () => {
      await expect(run(repo.saveCourseVideo('c-ia', video({ title: ' ' })))).rejects.toThrow('Ingresa el título del video.');
      for (const durationSec of [0, -5, 90.5]) {
        await expect(run(repo.saveCourseVideo('c-ia', video({ durationSec })))).rejects.toThrow('duración real del video');
      }
      // Sin límite de duración (20/11/2026): 15, 30, 45 y 60 minutos, y más de 4 horas.
      for (const minutes of [15, 30, 45, 60, 5 * 60]) await run(repo.saveCourseVideo('c-mkt', video({ title: `${minutes} min`, durationSec: minutes * 60 })));
      expect((await run(repo.getCourseContent('c-mkt'))).modules[0].videos.map((v) => v.durationSec).slice(1)).toEqual([900, 1800, 2700, 3600, 18000]);
      for (let i = 0; i < 9; i++) await run(repo.saveCourseVideo('c-ia', video({ title: `Prueba ${i}` })));
      expect((await run(repo.getCourseContent('c-ia'))).modules[0].videos.length).toBe(10);
      expect((await run(repo.getCourseContent('c-mkt'))).modules[0].videos.length).toBe(6);
    });

    it('no opera sobre videos ni módulos de otro curso', async () => {
      await expect(run(repo.saveCourseVideo('c-ia', video({ id: 'c-mkt-v1' })))).rejects.toThrow('No se encontró el video.');
      await expect(run(repo.saveCourseVideo('c-ia', video({ moduleId: 'c-mkt-m1' })))).rejects.toThrow('No se encontró el módulo.');
      await expect(run(repo.setCourseVideoPublished('c-ia', 'v1', false))).rejects.toThrow('No se encontró el video.');
      await expect(run(repo.deleteCourseVideo('c-ia', 'c-mkt-v1'))).rejects.toThrow('No se encontró el video.');
      await expect(run(repo.moveCourseVideo('c-ia', 'v1', 1))).rejects.toThrow('No se encontró el video.');
      await expect(run(repo.saveCourseVideo('no-existe', video()))).rejects.toThrow('No se encontró el curso.');
      expect((await run(repo.getCourse())).videos.length).toBe(6);
    });

    it('en un curso en borrador se puede despublicar o eliminar su único video', async () => {
      await run(repo.markCourseVideoCompleted('u4', 'c-ia', 'c-ia-v1'));
      let c = await run(repo.setCourseVideoPublished('c-ia', 'c-ia-v1', false));
      expect(c.modules[0].videos[0].published).toBe(false);
      c = await run(repo.deleteCourseVideo('c-ia', 'c-ia-v1'));
      expect(c.modules[0].videos).toEqual([]);
      // El progreso de ese video se limpia solo en su curso.
      expect((await run(repo.listEnrollments({ userId: 'u4', courseId: 'c-ia' })))[0].completedVideoIds).toEqual([]);
      expect((await run(repo.listEnrollments({ userId: 'u2', courseId: 'c-mkt' })))[0].completedVideoIds).toEqual(['c-mkt-v1']);
    });

    it('en un curso publicado (c1) protege el mínimo de 1 publicado (21/11/2026); la duración es libre', async () => {
      for (const id of ['v6', 'v5', 'v4', 'v3', 'v2']) await run(repo.setCourseVideoPublished('c1', id, false)); // queda 1 publicado
      await expect(run(repo.setCourseVideoPublished('c1', 'v1', false))).rejects.toThrow('El curso necesita al menos 1 video publicado.');
      await expect(run(repo.deleteCourseVideo('c1', 'v1'))).rejects.toThrow('El curso necesita al menos 1 video publicado.');
      // Videos largos publicados en un curso publicado: se aceptan.
      const c = await run(repo.saveCourseVideo('c1', video({ durationSec: 3600 })));
      expect(c.ruleIssues).toEqual([]);
      const off = await run(repo.saveCourseVideo('c1', video({ durationSec: 2 * 3600, published: false })));
      await run(repo.setCourseVideoPublished('c1', off.modules[0].videos.at(-1)!.id, true));
    });

    it('reordena dentro del curso y renumera', async () => {
      await run(repo.saveCourseVideo('c-ia', video({ title: 'Segundo' })));
      const c = await run(repo.moveCourseVideo('c-ia', 'c-ia-v1', 1));
      expect(c.modules[0].videos.map((v) => [v.title, v.order])).toEqual([['Segundo', 1], ['¿Qué es y cómo funciona la Inteligencia Artificial?', 2]]);
      const same = await run(repo.moveCourseVideo('c-ia', 'c-ia-v1', 1)); // fuera de límites: sin cambios
      expect(same.modules[0].videos.map((v) => v.order)).toEqual([1, 2]);
    });

    it('lo guardado se recupera desde una nueva instancia', async () => {
      await run(repo.saveCourseVideo('c-mkt', video({ title: 'Persistido' })));
      const reopened = new MockDataRepository();
      expect((await run(reopened.getCourseContent('c-mkt'))).modules[0].videos.map((v) => v.title)).toContain('Persistido');
      expect(stored().videos.filter((v) => v.courseId === 'c-mkt').length).toBe(2);
    });
  });

  describe('examen y preguntas por curso', () => {
    it('la configuración se guarda en el examen indicado sin tocar el de c1', async () => {
      const before = await run(repo.getExamConfig());
      const exam = await run(repo.updateExamConfigById('c-ia-e1', { timeMinutes: 30, passScore: 14, maxAttempts: 1, scaleMax: 20 }));
      expect(exam).toMatchObject({ id: 'c-ia-e1', courseId: 'c-ia', timeMinutes: 30, passScore: 14, maxAttempts: 1, scaleMax: 20 });
      await expect(run(repo.updateExamConfigById('c-ia-e1', { ...exam, maxAttempts: 2 }))).rejects.toThrow('los intentos permitidos deben ser 1');
      expect(await run(repo.getExamConfig())).toEqual(before);
      await expect(run(repo.updateExamConfigById('c-ia-e1', { ...exam, passScore: 30 }))).rejects.toThrow('La nota mínima debe estar entre 0 y 20.');
      await expect(run(repo.updateExamConfigById('no-existe', exam))).rejects.toThrow('No se encontró el examen.');
    });

    it('las preguntas quedan en su examen; un mismo id en otro examen no se mezcla', async () => {
      let list = await run(repo.saveExamQuestion('c-ia-e1', question({ id: 'q1', text: 'Pregunta de prueba en IA' })));
      expect(list.map((q) => [q.examId, q.text])).toEqual([['c-ia-e1', 'Pregunta de prueba en IA']]);
      expect(list[0].id).not.toBe('q1'); // q1 no existía en este examen: se crea con un id nuevo
      expect((await run(repo.getQuestions())).find((q) => q.id === 'q1')!.text).toBe(SEED_QUESTIONS[0].text);

      list = await run(repo.saveExamQuestion('c-ia-e1', { ...list[0], text: 'Editada' }));
      expect(list.map((q) => q.text)).toEqual(['Editada']);
      expect((await run(repo.getQuestions())).length).toBe(10);
      await expect(run(repo.saveExamQuestion('c-ia-e1', question({ correct: [] })))).rejects.toThrow('Marca la respuesta correcta.');
    });

    it('en un curso en borrador se puede quitar la última pregunta; en c1 publicado, no', async () => {
      repo = withoutAttempts();
      const [q] = await run(repo.saveExamQuestion('c-ia-e1', question()));
      expect(await run(repo.deleteExamQuestion('c-ia-e1', q.id))).toEqual([]);
      await expect(run(repo.deleteExamQuestion('c-ia-e1', q.id))).rejects.toThrow('No se encontró la pregunta.');
      await expect(run(repo.deleteExamQuestion('c-ia-e1', 'q2'))).rejects.toThrow('No se encontró la pregunta.');
      repo = withSingleC1Question(); // Etapa 2A: ver withSingleC1Question
      await expect(run(repo.deleteExamQuestion('c1-e1', 'q1'))).rejects.toThrow('El examen necesita al menos una pregunta.');
    });

    it('agregar preguntas a un curso en borrador no habilita su examen', async () => {
      await run(repo.saveExamQuestion('c-ia-e1', question()));
      await run(repo.markCourseVideoCompleted('u4', 'c-ia', 'c-ia-v1'));
      const availability = await run(repo.getExamAvailability('u4', 'c-ia'));
      expect(availability.available).toBe(false);
      expect(availability.reason).toContain('borrador');
    });
  });

  describe('requisitos de publicación', () => {
    it('informa los bloqueos y las advertencias de cada curso', async () => {
      const ia = await run(repo.getPublicationCheck('c-ia'));
      expect(ia.canPublish).toBe(false);
      expect(ia.blocking).toEqual(['El examen activo no tiene preguntas.']); // 21/11/2026: con 1 video el módulo cumple
      expect(ia.warnings).toEqual(['Las horas de formación están sin definir: el certificado mostrará «Por definir».']);
      const mkt = await run(repo.getPublicationCheck('c-mkt'));
      expect(mkt.blocking.some((b) => b.includes('dura'))).toBe(false); // sin límite de duración (20/11/2026)
      expect(await run(repo.getPublicationCheck('c1'))).toEqual({ canPublish: true, blocking: [], warnings: [] });
      await expect(run(repo.getPublicationCheck('no-existe'))).rejects.toThrow('No se encontró el curso.');
    });

    it('sin preguntas no se publica; con RN-03 y preguntas, sí, y recién entonces el examen se habilita', async () => {
      for (let i = 0; i < 4; i++) await run(repo.saveCourseVideo('c-ia', video({ title: `Prueba ${i}` })));
      const ia = (await run(repo.getCourses())).find((c) => c.id === 'c-ia')!;
      await expect(run(repo.updateCourseById('c-ia', { ...ia, status: 'publicado' }))).rejects.toThrow(
        'No se puede publicar el curso: El examen activo no tiene preguntas.',
      );
      expect((await run(repo.getPublicationCheck('c-ia'))).blocking).toEqual(['El examen activo no tiene preguntas.']);

      for (const q of SEED_QUESTIONS) await run(repo.saveExamQuestion('c-ia-e1', structuredClone(q)));
      expect((await run(repo.updateCourseById('c-ia', { ...ia, status: 'publicado' }))).status).toBe('publicado');

      // Publicado, pero el alumno debe completar sus videos antes de rendir.
      expect((await run(repo.getExamAvailability('u4', 'c-ia'))).reason).toBe('Debes completar todos los videos antes de rendir el examen.');
      const content = await run(repo.getParticipantCourseContent('u4', 'c-ia'));
      for (const v of content.modules.flatMap((m) => m.videos)) await run(repo.markCourseVideoCompleted('u4', 'c-ia', v.id));
      expect((await run(repo.getExamAvailability('u4', 'c-ia'))).available).toBe(true);

      // Las preguntas guardadas en IA tienen ids nuevos: se califican por su posición en el examen.
      const questions = await run(repo.getExamQuestions('c-ia-e1'));
      const answers = Object.fromEntries(questions.map((q, i) => [q.id, allCorrect()[SEED_QUESTIONS[i].id]]));
      const attempt = await run(repo.submitExamAttempt('u4', 'c-ia-e1', answers, 120));
      expect(attempt).toMatchObject({ courseId: 'c-ia', passed: true });
      const certs = await run(repo.listCertificates({ userId: 'u4', courseId: 'c-ia' }));
      expect(certs).toEqual([expect.objectContaining({ courseId: 'c-ia', trainingHours: null })]);
    }, 30_000); // recorrido completo: muchas operaciones con la latencia simulada de 250 ms

    it('un curso publicado no puede quedarse sin preguntas a través del examen', async () => {
      repo = withSingleC1Question(); // Etapa 2A: ver withSingleC1Question
      const questions = await run(repo.getExamQuestions('c1-e1'));
      expect(questions).toHaveLength(1);
      await expect(run(repo.deleteExamQuestion('c1-e1', questions[0].id))).rejects.toThrow('al menos una pregunta');
    });
  });

  describe('retiro de cursos asignados', () => {
    it('retira un curso sin avance y devuelve las asignaciones restantes', async () => {
      const rest = await run(repo.unenrollParticipant('u4', 'c-mkt'));
      expect(rest.map((e) => e.courseId)).toEqual(['c1', 'c-ia']);
      expect((await run(repo.getParticipantCourses('u4'))).map((p) => p.course.id)).toEqual(['c1', 'c-ia']);
      expect(stored().enrollments.some((e) => e.userId === 'u4' && e.courseId === 'c-mkt')).toBe(false);
    });

    it('no retira si hay avance, intentos o certificados', async () => {
      const msg = 'No se puede retirar el curso: el participante ya tiene avance, intentos o certificados en él.';
      await expect(run(repo.unenrollParticipant('u2', 'c-mkt'))).rejects.toThrow(msg); // video completado
      await expect(run(repo.unenrollParticipant('u3', 'c1'))).rejects.toThrow(msg); // intento
      await expect(run(repo.unenrollParticipant('u1', 'c1'))).rejects.toThrow(msg); // certificado
      await expect(run(repo.unenrollParticipant('u6', 'c1'))).rejects.toThrow(msg); // aprobado
      expect((await run(repo.listEnrollments({ userId: 'u1' }))).map((e) => e.courseId)).toEqual(['c1', 'c-ia']);
    });

    it('retirar no borra intentos ni certificados de otros cursos', async () => {
      await run(repo.unenrollParticipant('u1', 'c-ia'));
      expect((await run(repo.getCertificates('u1'))).map((c) => c.code)).toEqual(['IMC-DEMO-0001']);
      expect((await run(repo.getAttempts('u1'))).length).toBe(1);
      await expect(run(repo.unenrollParticipant('u1', 'c-ia'))).rejects.toThrow('El participante no tiene este curso asignado.');
    });
  });

  describe('creación de evaluaciones (E5.5)', () => {
    /** Guarda la semilla en el localStorage de la prueba, la modifica y devuelve un repositorio que la carga. */
    function withState(edit: (s: DemoState) => void): MockDataRepository {
      new MockDataRepository().resetDemo();
      const s = stored();
      edit(s);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
      return new MockDataRepository();
    }

    it('crea la evaluación de un curso sin evaluación activa, sin preguntas y con la configuración de demostración', async () => {
      const r = withState((s) => (s.exams = s.exams.filter((e) => e.courseId !== 'c-mkt')));
      expect(await run(r.getActiveExam('c-mkt'))).toBeNull();
      expect((await run(r.getPublicationCheck('c-mkt'))).blocking).toContain('El curso no tiene un examen activo.');

      const exam = await run(r.createCourseExam('c-mkt'));
      expect(exam).toEqual({ id: 'c-mkt-e1', courseId: 'c-mkt', title: 'Examen del curso', active: true, timeMinutes: 20, passScore: 60, maxAttempts: 1, scaleMax: 100 });
      expect(await run(r.getActiveExam('c-mkt'))).toEqual(exam);
      expect(await run(r.getExamQuestions('c-mkt-e1'))).toEqual([]);
      // Ahora el requisito pendiente es tener preguntas, y el examen sigue bloqueado para los alumnos.
      const check = await run(r.getPublicationCheck('c-mkt'));
      expect(check.blocking).toContain('El examen activo no tiene preguntas.');
      expect(check.blocking).not.toContain('El curso no tiene un examen activo.');
      expect((await run(r.getExamAvailability('u2', 'c-mkt'))).available).toBe(false);
      // Persiste.
      expect(stored().exams.filter((e) => e.courseId === 'c-mkt').map((e) => e.id)).toEqual(['c-mkt-e1']);
    });

    it('no duplica: rechaza crear si el curso ya tiene una evaluación activa', async () => {
      for (const id of ['c1', 'c-ia', 'c-mkt']) {
        await expect(run(repo.createCourseExam(id))).rejects.toThrow('El curso ya tiene una evaluación activa.');
      }
      expect((await run(repo.getExams('c1'))).length).toBe(1);
      await expect(run(repo.createCourseExam('no-existe'))).rejects.toThrow('No se encontró el curso.');
    });

    it('si quedó un examen inactivo, lo conserva y crea uno activo con otro identificador', async () => {
      const r = withState((s) => (s.exams.find((e) => e.id === 'c-ia-e1')!.active = false));
      const exam = await run(r.createCourseExam('c-ia'));
      expect(exam.id).not.toBe('c-ia-e1');
      expect((await run(r.getExams('c-ia'))).map((e) => [e.id === 'c-ia-e1', e.active])).toEqual([[true, false], [false, true]]);
      expect((await run(r.getActiveExam('c-ia')))!.id).toBe(exam.id);
    });

    it('crear la evaluación de un curso no altera los demás, ni los intentos y certificados', async () => {
      const r = withState((s) => (s.exams = s.exams.filter((e) => e.courseId !== 'c-mkt')));
      const before = {
        c1: await run(r.getExams('c1')),
        ia: await run(r.getExams('c-ia')),
        q: await run(r.getQuestions()),
        attempts: await run(r.listAttempts()),
        certs: await run(r.listCertificates()),
        enrollments: await run(r.listEnrollments({ courseId: 'c1' })),
      };
      await run(r.createCourseExam('c-mkt'));
      expect({
        c1: await run(r.getExams('c1')),
        ia: await run(r.getExams('c-ia')),
        q: await run(r.getQuestions()),
        attempts: await run(r.listAttempts()),
        certs: await run(r.listCertificates()),
        enrollments: await run(r.listEnrollments({ courseId: 'c1' })),
      }).toEqual(before);
    });

    it('un curso creado sigue recibiendo su evaluación (createCourse no cambió)', async () => {
      const course = await run(repo.createCourse({ name: 'Curso nuevo', description: 'Descripción', trainingHours: null, coverImage: null }));
      expect(await run(repo.getActiveExam(course.id))).toMatchObject({ id: `${course.id}-e1`, active: true, ...{ timeMinutes: 20, passScore: 60 } });
      await expect(run(repo.createCourseExam(course.id))).rejects.toThrow('El curso ya tiene una evaluación activa.');
    });
  });
});
