import { Observable, firstValueFrom } from 'rxjs';
import { BACKUP_STORAGE_KEY, LEGACY_STORAGE_KEY, MockDataRepository, STORAGE_KEY, V3_STORAGE_KEY } from './mock-data-repository';
import { SEED_ATTEMPTS, SEED_COURSE, SEED_EXAM, SEED_QUESTIONS, SEED_USERS, SEED_V2 } from '../data/seed';
import { DemoState, DemoStateV2, migrateV2, verifyMigration } from '../data/demo-state';
import { DEMO_CONFIG } from '../config/demo.config';

/**
 * Pruebas del repositorio simulado.
 * - E1: fijan el comportamiento de las pantallas actuales, que trabajan sobre el curso principal (c1).
 * - E2: varios cursos, migración del estado v2 a v3, acceso por inscripción y portadas.
 * Todos los datos son ficticios (PENDIENTES M5).
 */
const run = <T>(obs: Observable<T>): Promise<T> => firstValueFrom(obs);

/** Respuestas correctas de todas las preguntas semilla. */
function allCorrect(): Record<string, string[]> {
  return Object.fromEntries(SEED_QUESTIONS.map((q) => [q.id, [...q.correct]]));
}

/**
 * Etapa 2B (P4): las respuestas de `allWrong()` dejan incompletas las de selección múltiple, así que solo se pueden
 * entregar al agotarse el tiempo (20 minutos en la demostración). Con entrega voluntaria, q6 y q7 (3 exigidas, solo 2
 * incorrectas) ya no pueden valer 0.
 */
const TIME_UP = 20 * 60;

/** Respuestas incorrectas (opción que no es la correcta). */
function allWrong(): Record<string, string[]> {
  return Object.fromEntries(
    SEED_QUESTIONS.map((q) => [q.id, [q.options.find((o) => !q.correct.includes(o.id))!.id]]),
  );
}

/** Estado v2 (un solo curso), como lo guardaba la versión anterior. */
function seedState(): DemoStateV2 {
  return structuredClone(SEED_V2);
}

/** Simula un navegador con solo el estado de la versión anterior. */
function useV2(state: unknown): void {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(state));
}

function stored(): DemoState {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
}

/** Guarda la semilla v3, la modifica y devuelve un repositorio que la carga. */
function withV3(edit: (s: DemoState) => void): MockDataRepository {
  new MockDataRepository().resetDemo();
  const s = stored();
  edit(s);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  return new MockDataRepository();
}

/**
 * RN-15: el examen de c1 tiene intentos en la semilla y no admite cambios. Las pruebas de otras reglas de edición
 * (validaciones, RN-12, escala al calificar) usan un estado aislado sin intentos.
 */
function withoutAttempts(): MockDataRepository {
  return withV3((s) => (s.attempts = []));
}

/** Cinco videos válidos (RN-03) y las preguntas semilla para un curso demo. */
function makeCourseCompliant(s: DemoState, courseId: string): void {
  s.courses.find((c) => c.id === courseId)!.status = 'publicado';
  s.videos = s.videos.filter((v) => v.courseId !== courseId);
  for (let i = 1; i <= 5; i++) {
    s.videos.push({
      id: `${courseId}-t${i}`,
      courseId,
      moduleId: `${courseId}-m1`,
      order: i,
      title: `Video de prueba ${i}`,
      durationSec: 360,
      published: true,
      source: { kind: 'placeholder' },
    });
  }
  s.questions.push(...SEED_QUESTIONS.map((q) => ({ ...structuredClone(q), examId: `${courseId}-e1` })));
}

describe('MockDataRepository — comportamiento heredado (curso principal c1)', () => {
  let repo: MockDataRepository;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    repo = new MockDataRepository();
  });

  describe('carga y persistencia en localStorage', () => {
    it('usa los datos semilla cuando no hay estado guardado, sin escribir nada', async () => {
      const course = await run(repo.getCourse());
      expect(course.id).toBe('c1');
      expect(course.videos.length).toBe(6);
      expect((await run(repo.getUsers())).length).toBe(SEED_USERS.length);
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
      expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toBeNull();
      expect(repo.getStorageStatus()).toMatchObject({ source: 'seed', warning: '' });
    });

    it('restaura (migrando) el estado guardado con la clave v2', async () => {
      const state = seedState();
      state.course.name = 'Nombre guardado';
      useV2(state);
      const restored = new MockDataRepository();
      expect((await run(restored.getCourse())).name).toBe('Nombre guardado');
    });

    it('vuelve a la semilla si el JSON v2 es inválido, sin borrarlo y con aviso', async () => {
      localStorage.setItem(LEGACY_STORAGE_KEY, '{no es json');
      const restored = new MockDataRepository();
      expect((await run(restored.getCourse())).name).toBe(SEED_COURSE.name);
      expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toBe('{no es json');
      expect(restored.getStorageStatus().warning).toContain('formato no reconocido');
    });

    it('un estado v2 con otra forma no se migra, no se borra y se avisa (antes se descartaba en silencio)', async () => {
      const state: Record<string, unknown> = { ...seedState() };
      delete state['course'];
      useV2(state);
      const restored = new MockDataRepository();
      expect((await run(restored.getCourse())).id).toBe('c1');
      expect(JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY)!)).toEqual(state);
      expect(restored.getStorageStatus()).toMatchObject({ source: 'seed', legacyStatePresent: true });
      expect(restored.getStorageStatus().warning).not.toBe('');
    });

    it('guarda el estado (v3) tras una operación y resetDemo vuelve a la semilla', async () => {
      await run(repo.markVideoCompleted('u4', 'v1'));
      expect(stored().enrollments.find((e) => e.userId === 'u4' && e.courseId === 'c1')!.completedVideoIds).toEqual(['v1']);
      repo.resetDemo();
      expect((await run(repo.getEnrollment('u4')))!.completedVideoIds).toEqual([]);
      expect(stored().enrollments.find((e) => e.userId === 'u4' && e.courseId === 'c1')!.completedVideoIds).toEqual([]);
    });

    it('entrega copias: modificar la respuesta no altera el estado interno', async () => {
      const course = await run(repo.getCourse());
      course.videos.length = 0;
      expect((await run(repo.getCourse())).videos.length).toBe(6);
    });
  });

  describe('lecturas', () => {
    it('getEnrollment devuelve la inscripción del curso principal o null', async () => {
      expect((await run(repo.getEnrollment('u2')))!.courseId).toBe('c1');
      expect(await run(repo.getEnrollment('a1'))).toBeNull();
    });

    it('getEnrollments devuelve solo las inscripciones del curso principal', async () => {
      const list = await run(repo.getEnrollments());
      expect(list.every((e) => e.courseId === 'c1')).toBe(true);
      expect(list.length).toBe(6);
    });

    it('getExamConfig y getQuestions conservan su forma anterior', async () => {
      expect(await run(repo.getExamConfig())).toEqual(SEED_EXAM);
      expect(await run(repo.getQuestions())).toEqual(SEED_QUESTIONS);
    });

    it('filtra intentos y certificados por usuario', async () => {
      expect((await run(repo.getAttempts())).length).toBe(SEED_ATTEMPTS.length);
      expect((await run(repo.getAttempts('u3'))).map((a) => a.id)).toEqual(['att2']);
      expect((await run(repo.getCertificates('u1'))).map((c) => c.code)).toEqual(['IMC-DEMO-0001']);
      expect(await run(repo.getCertificates('u6'))).toEqual([]);
    });

    it('busca certificados por código sin distinguir mayúsculas y con espacios', async () => {
      expect((await run(repo.findCertificateByCode('  imc-demo-0001 ')))!.userId).toBe('u1');
      expect(await run(repo.findCertificateByCode('IMC-DEMO-9999'))).toBeNull();
    });

    it('busca certificados por DNI', async () => {
      expect((await run(repo.findCertificatesByDni(' 00000001 '))).length).toBe(1);
      expect(await run(repo.findCertificatesByDni('00000002'))).toEqual([]);
    });
  });

  describe('progreso de videos', () => {
    it('marca un video una sola vez, fija la fecha de inicio y recalcula el estado', async () => {
      let e = await run(repo.markVideoCompleted('u4', 'v1'));
      expect(e.status).toBe('en_progreso');
      expect(e.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      e = await run(repo.markVideoCompleted('u4', 'v1'));
      expect(e.completedVideoIds).toEqual(['v1']);
    });

    it('pasa a listo_examen al completar todos los videos publicados', async () => {
      for (const id of ['v4', 'v5']) await run(repo.markVideoCompleted('u2', id));
      const e = await run(repo.markVideoCompleted('u2', 'v6'));
      expect(e.status).toBe('listo_examen');
    });

    it('falla si el usuario no tiene curso asignado', async () => {
      await expect(run(repo.markVideoCompleted('a1', 'v1'))).rejects.toThrow('No tienes un curso asignado.');
    });
  });

  describe('examen e intentos', () => {
    it('RN-11: no permite rendir sin completar los videos', async () => {
      await expect(run(repo.submitAttempt('u2', allCorrect(), 60))).rejects.toThrow(
        'Debes completar todos los videos antes de rendir el examen.',
      );
    });

    it('no permite volver a rendir si ya aprobó', async () => {
      await expect(run(repo.submitAttempt('u1', allCorrect(), 60))).rejects.toThrow('Ya aprobaste este examen.');
    });

    it('califica sobre la escala configurada y aprueba con nota >= mínima', async () => {
      const a = await run(repo.submitAttempt('u5', allCorrect(), 300));
      expect(a).toMatchObject({ userId: 'u5', courseId: 'c1', examId: 'c1-e1', score: 100, scaleMax: 100, correctCount: 10, totalQuestions: 10, passed: true, durationSec: 300 });
      expect((await run(repo.getEnrollment('u5')))!.status).toBe('aprobado');
    });

    it('selección múltiple: una respuesta parcial suma en proporción a sus aciertos (Etapa 2B)', async () => {
      const answers = allCorrect();
      answers['q6'] = ['a', 'c', 'b']; // 2 de 3 correctas ('b' es incorrecta y ocupa el tercer espacio)
      const a = await run(repo.submitAttempt('u5', answers, 300));
      expect(a.correctCount).toBe(9); // preguntas con el puntaje completo
      expect(a.questionScores!['q6']).toBeCloseTo(20 / 3, 10);
      expect(a.score).toBe(97); // 90 + 6,67 → 96,67, redondeado como antes
      expect(a.gradingRule).toBe('proporcional');
    });

    it('desaprueba con nota menor a la mínima y no emite certificado', async () => {
      const a = await run(repo.submitAttempt('u5', allWrong(), TIME_UP, 'tiempo'));
      expect(a.passed).toBe(false);
      expect(a.score).toBe(0);
      expect((await run(repo.getEnrollment('u5')))!.status).toBe('desaprobado');
      expect(await run(repo.getCertificates('u5'))).toEqual([]);
    });

    it('un solo intento: quien ya rindió (aunque haya desaprobado) no puede volver a rendir', async () => {
      // u3 ya usó su único intento en la semilla (desaprobó).
      await expect(run(repo.submitAttempt('u3', allCorrect(), 300))).rejects.toThrow(
        'Alcanzaste el límite de intentos permitidos.',
      );
      expect((await run(repo.getAttempts('u3'))).map((a) => a.id)).toEqual(['att2']);
    });

    it('usa la escala vigente del examen al calificar y la guarda en el intento (escala 20)', async () => {
      // Etapa 2A: con escala 20 los puntajes deben sumar 20: las 10 preguntas valen 2 puntos cada una.
      repo = withV3((s) => {
        s.attempts = [];
        s.questions.filter((q) => q.examId === 'c1-e1').forEach((q) => (q.points = 2));
      });
      await run(repo.updateExamConfig({ ...SEED_EXAM, scaleMax: 20, passScore: 11 }));
      const a = await run(repo.submitAttempt('u5', allCorrect(), 300));
      expect(a).toMatchObject({ score: 20, scaleMax: 20, passed: true });
      expect((await run(repo.getCertificates('u5')))[0].scaleMax).toBe(20);
    });

    it('cuenta los intentos del examen del curso', async () => {
      const state = seedState();
      state.attempts.push({ ...state.attempts[1], id: 'att-x', userId: 'u5' }, { ...state.attempts[1], id: 'att-y', userId: 'u5' });
      useV2(state);
      const r = new MockDataRepository();
      await expect(run(r.submitAttempt('u5', allCorrect(), 300))).rejects.toThrow(
        'Alcanzaste el límite de intentos permitidos.',
      );
    });

    it('si el curso principal pasa a borrador, el examen queda bloqueado', async () => {
      await run(repo.updateCourse({ name: SEED_COURSE.name, description: 'x', status: 'borrador', trainingHours: 8 }));
      await expect(run(repo.submitAttempt('u5', allCorrect(), 300))).rejects.toThrow('El curso está en borrador');
      expect((await run(repo.getEnrollment('u5')))!.status).toBe('en_progreso');
    });
  });

  describe('certificados', () => {
    it('RN-08: emite un único certificado al aprobar, con los datos del momento de emisión', async () => {
      const a = await run(repo.submitAttempt('u5', allCorrect(), 300));
      const certs = await run(repo.getCertificates('u5'));
      expect(certs.length).toBe(1);
      expect(certs[0]).toMatchObject({
        code: 'IMC-DEMO-0002',
        courseId: 'c1',
        attemptId: a.id,
        participantName: 'Rosa Cruz Huamán',
        participantDni: '00000005',
        courseName: SEED_COURSE.name,
        trainingHours: SEED_COURSE.trainingHours,
        score: 100,
        scaleMax: 100,
        status: 'vigente',
      });

      // Cambiar el curso después no altera el certificado emitido.
      await run(repo.updateCourse({ name: 'Nombre nuevo', description: 'x', status: 'publicado', trainingHours: 20 }));
      const after = (await run(repo.getCertificates('u5')))[0];
      expect(after.courseName).toBe(SEED_COURSE.name);
      expect(after.trainingHours).toBe(SEED_COURSE.trainingHours);
    });

    it('genera códigos sin repetir uno existente', async () => {
      const state = seedState();
      state.certificates[0].code = 'IMC-DEMO-0002';
      useV2(state);
      const r = new MockDataRepository();
      await run(r.submitAttempt('u5', allCorrect(), 300));
      expect((await run(r.getCertificates('u5')))[0].code).toBe('IMC-DEMO-0003');
    });

    it('RN-08: un certificado vigente del mismo curso impide emitir otro', async () => {
      // Estado preparado: u1 conserva su certificado vigente, pero sin intento registrado, para
      // comprobar que la protección del certificado no depende del límite de intentos.
      const state = seedState();
      state.enrollments.find((e) => e.userId === 'u1')!.status = 'desaprobado';
      state.attempts = state.attempts.filter((a) => a.userId !== 'u1');
      useV2(state);
      const r = new MockDataRepository();
      const a = await run(r.submitAttempt('u1', allCorrect(), 300));
      expect(a.passed).toBe(true);
      expect((await run(r.getCertificates('u1'))).map((c) => c.attemptId)).toEqual(['att1']);
    });
  });

  describe('persistencia de intentos y certificados', () => {
    it('un intento y su certificado se recuperan desde una nueva instancia', async () => {
      const a = await run(repo.submitAttempt('u5', allCorrect(), 420));
      const reopened = new MockDataRepository();
      expect((await run(reopened.getAttempts('u5'))).map((x) => x.id)).toEqual([a.id]);
      const cert = await run(reopened.findCertificateByCode('IMC-DEMO-0002'));
      expect(cert).toMatchObject({ userId: 'u5', attemptId: a.id });
      expect((await run(reopened.getEnrollment('u5')))!.status).toBe('aprobado');
    });

    it('un intento desaprobado también queda guardado (RN-06)', async () => {
      const a = await run(repo.submitAttempt('u5', allWrong(), TIME_UP, 'tiempo'));
      expect(stored().attempts.some((x) => x.id === a.id)).toBe(true);
    });
  });

  describe('datos inexistentes y estados inválidos', () => {
    it('devuelve null o listas vacías para usuarios sin datos', async () => {
      expect(await run(repo.getEnrollment('no-existe'))).toBeNull();
      expect(await run(repo.getAttempts('no-existe'))).toEqual([]);
      expect(await run(repo.getCertificates('no-existe'))).toEqual([]);
    });

    it('submitAttempt falla para un usuario inexistente', async () => {
      await expect(run(repo.submitAttempt('no-existe', allCorrect(), 60))).rejects.toThrow('No tienes un curso asignado.');
    });

    it('rechaza operaciones sobre videos inexistentes', async () => {
      await expect(run(repo.setVideoPublished('no-existe', false))).rejects.toThrow('No se encontró el video.');
      await expect(run(repo.saveVideo({ id: 'no-existe', title: 'X', durationMin: 6, published: true }))).rejects.toThrow('No se encontró el video.');
      await expect(run(repo.deleteVideo('no-existe'))).rejects.toThrow('No se encontró el video.');
      expect((await run(repo.moveVideo('no-existe', 1))).videos.map((v) => v.id)).toEqual(['v1', 'v2', 'v3', 'v4', 'v5', 'v6']);
    });

    it('markVideoCompleted rechaza un video inexistente o de otro curso (antes lo guardaba: RIESGO T6)', async () => {
      await expect(run(repo.markVideoCompleted('u4', 'no-existe'))).rejects.toThrow('No se encontró el video.');
      await expect(run(repo.markVideoCompleted('u4', 'c-ia-v1'))).rejects.toThrow('No se encontró el video.');
      expect((await run(repo.getEnrollment('u4')))!.completedVideoIds).toEqual([]);
    });

    it('vuelve a la semilla si al estado v2 le falta una colección', async () => {
      const state: Record<string, unknown> = { ...seedState() };
      delete state['exam'];
      useV2(state);
      const restored = new MockDataRepository();
      expect(await run(restored.getExamConfig())).toEqual(SEED_EXAM);
    });
  });

  describe('administración: participantes', () => {
    const valid = { fullName: 'Nuevo Participante', email: 'NUEVO@ejemplo.test ', dni: '00000099' };

    it('registra al participante y lo inscribe en el curso principal con estado pendiente', async () => {
      const u = await run(repo.addParticipant(valid));
      expect(u).toMatchObject({ email: 'nuevo@ejemplo.test', role: 'participant' });
      expect(await run(repo.getEnrollment(u.id))).toMatchObject({ courseId: 'c1', status: 'pendiente', completedVideoIds: [] });
    });

    it('RN-01: rechaza un correo repetido sin distinguir mayúsculas', async () => {
      await expect(run(repo.addParticipant({ ...valid, email: 'ANA@ejemplo.test' }))).rejects.toThrow(
        'Ya existe un usuario con ese correo electrónico.',
      );
    });

    it('valida nombre, correo, DNI y DNI repetido', async () => {
      await expect(run(repo.addParticipant({ ...valid, fullName: 'Al' }))).rejects.toThrow('Ingresa nombres y apellidos.');
      await expect(run(repo.addParticipant({ ...valid, email: 'sin-arroba' }))).rejects.toThrow('Ingresa un correo electrónico válido.');
      await expect(run(repo.addParticipant({ ...valid, dni: '123' }))).rejects.toThrow('El DNI debe tener 8 dígitos.');
      await expect(run(repo.addParticipant({ ...valid, dni: '00000001' }))).rejects.toThrow('Ya existe un participante con ese DNI.');
    });
  });

  describe('administración: curso y videos (RN-02, RN-03)', () => {
    const patch = { name: 'Curso', description: 'Descripción', status: 'publicado' as const, trainingHours: 8 };

    it('valida los datos del curso', async () => {
      await expect(run(repo.updateCourse({ ...patch, name: ' ' }))).rejects.toThrow('Ingresa el nombre del curso.');
      await expect(run(repo.updateCourse({ ...patch, description: '' }))).rejects.toThrow('Ingresa la descripción del curso.');
      await expect(run(repo.updateCourse({ ...patch, trainingHours: 0 }))).rejects.toThrow('Las horas de formación deben ser al menos 1.');
    });

    it('no publica el curso sin videos publicados (21/11/2026: basta 1)', async () => {
      const state = seedState();
      state.course.videos.forEach((v) => (v.published = false));
      useV2(state);
      const r = new MockDataRepository();
      await expect(run(r.updateCourse(patch))).rejects.toThrow('Para publicar el curso necesitas al menos 1 video publicado.');
      expect((await run(r.updateCourse({ ...patch, status: 'borrador' }))).status).toBe('borrador');
    });

    it('editar el curso principal conserva su portada', async () => {
      await run(repo.updateCourse(patch));
      expect((await run(repo.getCourses())).find((c) => c.id === 'c1')!.coverImage).toBe('demo/covers/curso-demostracion.svg');
    });

    it('valida la duración del video en minutos enteros mayores que 0, sin límite (20/11/2026)', async () => {
      const v = { title: 'Nuevo', durationMin: 0, published: true };
      const message = 'Ingresa la duración en minutos (número entero mayor que 0).';
      await expect(run(repo.saveVideo(v))).rejects.toThrow(message);
      await expect(run(repo.saveVideo({ ...v, durationMin: 7.5 }))).rejects.toThrow(message);
      const long = await run(repo.saveVideo({ ...v, title: 'Una hora', durationMin: 60, url: 'https://ejemplo.test/hora' }));
      expect(long.videos.find((x) => x.title === 'Una hora')!.durationMin).toBe(60);
      await expect(run(repo.saveVideo({ ...v, title: '  ', durationMin: 6 }))).rejects.toThrow('Ingresa el título del video.');
    });

    it('admite más de 7 videos (sin máximo, 19/11/2026) y asigna el orden al final', async () => {
      const c = await run(repo.saveVideo({ title: 'Séptimo', durationMin: 6, published: true, url: ' https://ejemplo.test/v ' }));
      const added = c.videos.find((v) => v.title === 'Séptimo')!;
      expect(added.order).toBe(7);
      expect(added.url).toBe('https://ejemplo.test/v');
      const more = await run(repo.saveVideo({ title: 'Octavo', durationMin: 6, published: true, url: 'https://ejemplo.test/v8' }));
      expect(more.videos.find((v) => v.title === 'Octavo')!.order).toBe(8);
      // 21/11/2026: un video nuevo sin enlace se rechaza.
      await expect(run(repo.saveVideo({ title: 'Sin enlace', durationMin: 6, published: true }))).rejects.toThrow('Ingresa el enlace del video');
    });

    it('al despublicar un video recalcula el estado de quien estaba en progreso', async () => {
      const c = await run(repo.setVideoPublished('v6', false));
      expect(c.videos.find((v) => v.id === 'v6')!.published).toBe(false);
      expect((await run(repo.getEnrollment('u2')))!.status).toBe('en_progreso');
      // 21/11/2026: el mínimo en un curso publicado es 1 video publicado.
      for (const id of ['v5', 'v4', 'v3', 'v2']) await run(repo.setVideoPublished(id, false));
      await expect(run(repo.setVideoPublished('v1', false))).rejects.toThrow('El curso necesita al menos 1 video publicado.');
    });

    it('reordena videos y no hace nada fuera de los límites', async () => {
      let c = await run(repo.moveVideo('v1', 1));
      expect(c.videos.map((v) => v.id).slice(0, 2)).toEqual(['v2', 'v1']);
      c = await run(repo.moveVideo('v2', -1));
      expect(c.videos[0].id).toBe('v2');
      expect(c.videos.map((v) => v.order)).toEqual([1, 2, 3, 4, 5, 6]);
    });

    it('elimina videos sin bajar de 1 (21/11/2026) y limpia el progreso asociado', async () => {
      const c = await run(repo.deleteVideo('v1'));
      expect(c.videos.map((v) => v.order)).toEqual([1, 2, 3, 4, 5]);
      expect((await run(repo.getEnrollment('u2')))!.completedVideoIds).toEqual(['v2', 'v3']);
      for (const id of ['v2', 'v3', 'v4', 'v5']) await run(repo.deleteVideo(id));
      await expect(run(repo.deleteVideo('v6'))).rejects.toThrow('Un curso debe tener como mínimo 1 video.');
    });
  });

  describe('administración: evaluación', () => {
    it('valida tiempo, escala, nota mínima e intentos', async () => {
      repo = withoutAttempts();
      await expect(run(repo.updateExamConfig({ ...SEED_EXAM, timeMinutes: 0 }))).rejects.toThrow('El tiempo debe estar entre 1 y 240 minutos.');
      await expect(run(repo.updateExamConfig({ ...SEED_EXAM, scaleMax: 50 }))).rejects.toThrow('La escala de nota debe ser 20 o 100.');
      await expect(run(repo.updateExamConfig({ ...SEED_EXAM, scaleMax: 20, passScore: 60 }))).rejects.toThrow('La nota mínima debe estar entre 0 y 20.');
      for (const maxAttempts of [0, 2, 3, 10]) {
        await expect(run(repo.updateExamConfig({ ...SEED_EXAM, maxAttempts }))).rejects.toThrow(
          'Cada alumno tiene un solo intento por examen: los intentos permitidos deben ser 1.',
        );
      }
      expect(await run(repo.updateExamConfig({ ...SEED_EXAM, timeMinutes: 30, maxAttempts: 1 }))).toMatchObject({ timeMinutes: 30, maxAttempts: 1 });
    });

    it('RN-12: exige respuesta correcta y puntaje en cada pregunta', async () => {
      repo = withoutAttempts();
      const base = { ...structuredClone(SEED_QUESTIONS[0]), id: 'nueva' };
      await expect(run(repo.saveQuestion({ ...base, text: ' ' }))).rejects.toThrow('Escribe el enunciado de la pregunta.');
      await expect(run(repo.saveQuestion({ ...base, options: [base.options[0]] }))).rejects.toThrow('Completa el texto de todas las opciones (mínimo 2).');
      await expect(run(repo.saveQuestion({ ...base, correct: [] }))).rejects.toThrow('Marca la respuesta correcta.');
      await expect(run(repo.saveQuestion({ ...base, correct: ['a', 'b'] }))).rejects.toThrow('Esta pregunta debe tener una sola respuesta correcta.');
      await expect(run(repo.saveQuestion({ ...base, points: 0 }))).rejects.toThrow('El puntaje debe ser mayor que 0.');
    });

    it('agrega, edita y elimina preguntas, conservando al menos una', async () => {
      // Etapa 2A: c1 en borrador, donde se puede editar sin exigir la suma exacta de puntajes.
      repo = withV3((s) => {
        s.attempts = [];
        s.courses.find((c) => c.id === 'c1')!.status = 'borrador';
      });
      let list = await run(repo.saveQuestion({ ...structuredClone(SEED_QUESTIONS[0]), id: 'nueva', text: 'Otra' }));
      expect(list.length).toBe(11);
      list = await run(repo.saveQuestion({ ...structuredClone(SEED_QUESTIONS[0]), text: 'Editada' }));
      expect(list.find((q) => q.id === 'q1')!.text).toBe('Editada');
      list = await run(repo.deleteQuestion('q1'));
      expect(list.some((q) => q.id === 'q1')).toBe(false);

      const state = seedState();
      state.questions = state.questions.slice(0, 1);
      state.attempts = []; // RN-15: sin intentos, para que el motivo del rechazo sea la pregunta mínima
      useV2(state);
      const r = new MockDataRepository();
      await expect(run(r.deleteQuestion('q1'))).rejects.toThrow('El examen necesita al menos una pregunta.');
    });
  });
});

describe('MockDataRepository — varios cursos (E2)', () => {
  let repo: MockDataRepository;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    repo = new MockDataRepository();
  });

  describe('cursos de demostración', () => {
    it('la semilla tiene tres cursos, cada uno con su portada y su descripción', async () => {
      const courses = await run(repo.getCourses());
      expect(courses.map((c) => c.id)).toEqual(['c1', 'c-ia', 'c-mkt']);
      const covers = courses.map((c) => c.coverImage);
      expect(new Set(covers).size).toBe(3);
      expect(covers.every((c) => c!.startsWith('demo/covers/') && c!.endsWith('.svg'))).toBe(true);
      expect(courses.every((c) => c.description.trim().length > 0 && c.isDemo)).toBe(true);
    });

    it('IA y Marketing están en borrador, sin horas ni preguntas inventadas', async () => {
      const courses = await run(repo.getCourses());
      for (const id of ['c-ia', 'c-mkt']) {
        expect(courses.find((c) => c.id === id)).toMatchObject({ status: 'borrador', trainingHours: null });
        const exam = (await run(repo.getActiveExam(id)))!;
        expect(await run(repo.getExamQuestions(exam.id))).toEqual([]);
      }
    });

    it('cada curso tiene su único video real de YouTube con su duración real', async () => {
      const ia = await run(repo.getCourseContent('c-ia'));
      const mkt = await run(repo.getCourseContent('c-mkt'));
      expect(ia.modules.flatMap((m) => m.videos)).toEqual([
        expect.objectContaining({ courseId: 'c-ia', durationSec: 513, source: { kind: 'youtube', videoId: '_tA5cinv0U8' } }),
      ]);
      expect(mkt.modules.flatMap((m) => m.videos)).toEqual([
        expect.objectContaining({ courseId: 'c-mkt', durationSec: 603, source: { kind: 'youtube', videoId: 'Ctd6BTuZmjA' } }),
      ]);
    });

    it('RN-03: informa que IA y Marketing tienen 1 video; la duración de 10:03 ya no es un problema (20/11/2026)', async () => {
      const ia = await run(repo.getCourseContent('c-ia'));
      const mkt = await run(repo.getCourseContent('c-mkt'));
      // 21/11/2026: con 1 video publicado por módulo se cumple RN-03.
      expect(ia.ruleIssues).toEqual([]);
      expect(mkt.ruleIssues).toEqual([]);
      expect((await run(repo.getCourseContent('c1'))).ruleIssues).toEqual([]);
    });

    it('no permite publicar los cursos demo mientras no cumplan los requisitos (su examen no tiene preguntas)', async () => {
      const course = (await run(repo.getCourses())).find((c) => c.id === 'c-mkt')!;
      await expect(run(repo.updateCourseById('c-mkt', { ...course, status: 'publicado' }))).rejects.toThrow(
        'No se puede publicar el curso: El examen activo no tiene preguntas.',
      );
    });

    it('con 5 videos (uno de 10:03), solo bloquea lo que falta del examen: la duración ya no se limita', async () => {
      const r = withV3((s) => {
        for (let i = 2; i <= 5; i++) {
          s.videos.push({ id: `c-mkt-x${i}`, courseId: 'c-mkt', moduleId: 'c-mkt-m1', order: i, title: `Prueba ${i}`, durationSec: 360, published: true, source: { kind: 'placeholder' } });
        }
      });
      const course = (await run(r.getCourses())).find((c) => c.id === 'c-mkt')!;
      const attempt = run(r.updateCourseById('c-mkt', { ...course, status: 'publicado' }));
      await expect(attempt).rejects.toThrow('No se puede publicar el curso: El examen activo no tiene preguntas.');
    });
  });

  describe('separación de datos por curso', () => {
    it('el contenido de un curso no incluye videos de otros cursos', async () => {
      const c1 = await run(repo.getCourse());
      expect(c1.videos.map((v) => v.id)).toEqual(['v1', 'v2', 'v3', 'v4', 'v5', 'v6']);
      const ia = await run(repo.getCourseContent('c-ia'));
      expect(ia.modules.every((m) => m.courseId === 'c-ia' && m.videos.every((v) => v.courseId === 'c-ia'))).toBe(true);
    });

    it('lista inscripciones, intentos y certificados por curso', async () => {
      expect((await run(repo.listEnrollments({ userId: 'u4' }))).map((e) => e.courseId)).toEqual(['c1', 'c-ia', 'c-mkt']);
      expect((await run(repo.listEnrollments({ courseId: 'c-mkt' }))).map((e) => e.userId)).toEqual(['u2', 'u4']);
      expect(await run(repo.listAttempts({ courseId: 'c-ia' }))).toEqual([]);
      expect((await run(repo.listAttempts({ courseId: 'c1' }))).length).toBe(3);
      expect((await run(repo.listCertificates({ courseId: 'c1' }))).length).toBe(1);
      expect(await run(repo.listCertificates({ courseId: 'c-ia' }))).toEqual([]);
    });

    it('un curso puede tener varios exámenes; la interfaz usa el activo', async () => {
      const r = withV3((s) => s.exams.push({ ...s.exams.find((e) => e.id === 'c1-e1')!, id: 'c1-e2', title: 'Otro examen', active: false }));
      expect((await run(r.getExams('c1'))).map((e) => e.id)).toEqual(['c1-e1', 'c1-e2']);
      expect((await run(r.getActiveExam('c1')))!.id).toBe('c1-e1');
      await expect(run(r.submitExamAttempt('u5', 'c1-e2', allCorrect(), 60))).rejects.toThrow('Este examen no está activo.');
      await expect(run(r.submitExamAttempt('u5', 'no-existe', allCorrect(), 60))).rejects.toThrow('No se encontró el examen.');
    });

    it('certificados independientes por curso: aprobar otro curso emite su propio certificado', async () => {
      const r = withV3((s) => makeCourseCompliant(s, 'c-ia'));
      for (let i = 1; i <= 5; i++) await run(r.markCourseVideoCompleted('u1', 'c-ia', `c-ia-t${i}`));
      expect((await run(r.getExamAvailability('u1', 'c-ia'))).available).toBe(true);

      const a = await run(r.submitExamAttempt('u1', 'c-ia-e1', allCorrect(), 300));
      expect(a).toMatchObject({ courseId: 'c-ia', examId: 'c-ia-e1', passed: true });
      const certs = await run(r.getCertificates('u1'));
      expect(certs.map((c) => [c.courseId, c.attemptId])).toEqual([['c1', 'att1'], ['c-ia', a.id]]);
      expect(certs[1]).toMatchObject({ courseName: 'Introducción a la Inteligencia Artificial', trainingHours: null });
      // El aprobado de IA no altera la inscripción de c1.
      expect((await run(r.getEnrollment('u1')))!.status).toBe('aprobado');
    });

    it('los intentos de un curso no consumen los de otro', async () => {
      const r = withV3((s) => {
        makeCourseCompliant(s, 'c-ia');
        s.enrollments.push({ userId: 'u3', courseId: 'c-ia', completedVideoIds: [1, 2, 3, 4, 5].map((i) => `c-ia-t${i}`), status: 'listo_examen' });
      });
      // u3 ya consumió su único intento de c1 (semilla): no puede rendir c1, pero sí el examen de IA.
      expect(await run(r.getExamAvailability('u3', 'c1'))).toMatchObject({ available: false, remainingAttempts: 0, maxAttempts: 1 });
      expect(await run(r.getExamAvailability('u3', 'c-ia'))).toMatchObject({ available: true, remainingAttempts: 1, maxAttempts: 1 });
      const questions = await run(r.getExamQuestions('c-ia-e1'));
      const correct = Object.fromEntries(questions.map((q) => [q.id, [...q.correct]]));
      // Desaprueba su único intento de IA: ya no puede volver a rendirlo (aunque responda bien).
      expect((await run(r.submitExamAttempt('u3', 'c-ia-e1', {}, TIME_UP, 'tiempo'))).passed).toBe(false);
      await expect(run(r.submitExamAttempt('u3', 'c-ia-e1', correct, 60))).rejects.toThrow('Alcanzaste el límite de intentos permitidos.');
      expect((await run(r.listAttempts({ userId: 'u3' }))).map((a) => a.courseId)).toEqual(['c1', 'c-ia']);
    });
  });

  describe('acceso del alumno (protección visual de demostración)', () => {
    it('el tablero muestra solo los cursos asignados, con progreso y borradores marcados', async () => {
      const u4 = await run(repo.getParticipantCourses('u4'));
      expect(u4.map((p) => [p.course.id, p.preview])).toEqual([['c1', false], ['c-ia', true], ['c-mkt', true]]);
      const u2 = await run(repo.getParticipantCourses('u2'));
      expect(u2.find((p) => p.course.id === 'c1')).toMatchObject({ totalVideos: 6, completedVideos: 3, percent: 50 });
      expect(u2.find((p) => p.course.id === 'c-mkt')).toMatchObject({ totalVideos: 1, completedVideos: 1, percent: 100 });
      expect((await run(repo.getParticipantCourses('u3'))).map((p) => p.course.id)).toEqual(['c1']);
    });

    it('fuera del modo demostración, los borradores no se muestran ni se abren', async () => {
      DEMO_CONFIG.showDraftCoursesToParticipants = false;
      try {
        expect((await run(repo.getParticipantCourses('u4'))).map((p) => p.course.id)).toEqual(['c1']);
        await expect(run(repo.getParticipantCourseContent('u4', 'c-ia'))).rejects.toThrow('Este curso aún no está disponible.');
      } finally {
        DEMO_CONFIG.showDraftCoursesToParticipants = true;
      }
    });

    it('conocer el identificador de un curso no asignado no da acceso', async () => {
      await expect(run(repo.getParticipantCourseContent('u3', 'c-ia'))).rejects.toThrow('No tienes acceso a este curso.');
      await expect(run(repo.markCourseVideoCompleted('u3', 'c-ia', 'c-ia-v1'))).rejects.toThrow('No tienes un curso asignado.');
      await expect(run(repo.getParticipantCourseContent('u3', 'no-existe'))).rejects.toThrow('No se encontró el curso.');
      const ia = await run(repo.getParticipantCourseContent('u4', 'c-ia'));
      expect(ia.course.id).toBe('c-ia');
    });

    it('el aula del alumno muestra solo videos publicados', async () => {
      const r = withV3((s) => (s.videos.find((v) => v.id === 'v6')!.published = false));
      const c1 = await run(r.getParticipantCourseContent('u2', 'c1'));
      expect(c1.modules.flatMap((m) => m.videos).map((v) => v.id)).toEqual(['v1', 'v2', 'v3', 'v4', 'v5']);
      await expect(run(r.markCourseVideoCompleted('u2', 'c1', 'v6'))).rejects.toThrow('Este video no está disponible.');
    });

    it('en un curso en borrador se puede ver el video, pero el examen sigue bloqueado', async () => {
      const e = await run(repo.markCourseVideoCompleted('u4', 'c-ia', 'c-ia-v1'));
      expect(e).toMatchObject({ courseId: 'c-ia', completedVideoIds: ['c-ia-v1'], status: 'en_progreso' });
      const availability = await run(repo.getExamAvailability('u4', 'c-ia'));
      expect(availability).toMatchObject({ available: false, examId: 'c-ia-e1' });
      expect(availability.reason).toContain('borrador');
      await expect(run(repo.submitExamAttempt('u4', 'c-ia-e1', {}, 60))).rejects.toThrow('borrador');
      expect(await run(repo.listCertificates({ userId: 'u4' }))).toEqual([]);
    });
  });

  describe('administración de cursos y portadas', () => {
    const input = { name: 'Curso nuevo', description: 'Descripción del curso nuevo', trainingHours: null, coverImage: null };

    it('crea un curso en borrador con su módulo y su examen, sin portada heredada', async () => {
      const course = await run(repo.createCourse(input));
      expect(course).toMatchObject({ status: 'borrador', coverImage: null, isDemo: false, trainingHours: null });
      const content = await run(repo.getCourseContent(course.id));
      expect(content.modules.map((m) => m.courseId)).toEqual([course.id]);
      expect((await run(repo.getActiveExam(course.id)))!.courseId).toBe(course.id);
      expect((await run(repo.getCourses())).length).toBe(4);
    });

    it('valida los datos del curso nuevo', async () => {
      await expect(run(repo.createCourse({ ...input, name: ' ' }))).rejects.toThrow('Ingresa el nombre del curso.');
      await expect(run(repo.createCourse({ ...input, trainingHours: 0 }))).rejects.toThrow('Las horas de formación deben ser al menos 1.');
      await expect(run(repo.createCourse({ ...input, coverImage: 'javascript:alert(1)' }))).rejects.toThrow('La portada debe ser');
    });

    it('la portada se edita por curso y no se comparte con otros', async () => {
      const ia = (await run(repo.getCourses())).find((c) => c.id === 'c-ia')!;
      await run(repo.updateCourseById('c-ia', { ...ia, coverImage: ' https://ejemplo.test/portada.png ' }));
      const courses = await run(repo.getCourses());
      expect(courses.find((c) => c.id === 'c-ia')!.coverImage).toBe('https://ejemplo.test/portada.png');
      expect(courses.find((c) => c.id === 'c-mkt')!.coverImage).toBe('demo/covers/marketing-digital.svg');
      expect(stored().courses.find((c) => c.id === 'c-ia')!.coverImage).toBe('https://ejemplo.test/portada.png');

      await run(repo.updateCourseById('c-ia', { ...ia, coverImage: '' }));
      expect((await run(repo.getCourses())).find((c) => c.id === 'c-ia')!.coverImage).toBeNull();
      await expect(run(repo.updateCourseById('c-ia', { ...ia, coverImage: '../secreto.svg' }))).rejects.toThrow('La portada debe ser');
      await expect(run(repo.updateCourseById('no-existe', { ...ia }))).rejects.toThrow('No se encontró el curso.');
    });

    it('asigna cursos a participantes nuevos y existentes', async () => {
      const u = await run(repo.addParticipant({ fullName: 'Persona de Prueba', email: 'prueba@ejemplo.test', dni: '00000098' }, ['c-ia', 'c-mkt']));
      expect((await run(repo.listEnrollments({ userId: u.id }))).map((e) => e.courseId)).toEqual(['c-ia', 'c-mkt']);
      await expect(run(repo.addParticipant({ fullName: 'Otra Persona', email: 'otra@ejemplo.test', dni: '00000097' }, ['no-existe']))).rejects.toThrow('No se encontró el curso.');

      expect(await run(repo.enrollParticipant('u3', 'c-ia'))).toMatchObject({ userId: 'u3', courseId: 'c-ia', status: 'pendiente' });
      await expect(run(repo.enrollParticipant('u3', 'c-ia'))).rejects.toThrow('El participante ya tiene este curso asignado.');
      await expect(run(repo.enrollParticipant('a1', 'c-ia'))).rejects.toThrow('No se encontró el participante.');
      await expect(run(repo.enrollParticipant('u3', 'no-existe'))).rejects.toThrow('No se encontró el curso.');
    });
  });
});

describe('Regla: un solo intento por alumno y examen (27/10/2026)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('la configuración, los exámenes y la disponibilidad informan un intento', async () => {
    const repo = new MockDataRepository();
    expect((await run(repo.getExamConfig())).maxAttempts).toBe(1);
    for (const id of ['c1', 'c-ia', 'c-mkt']) expect((await run(repo.getActiveExam(id)))!.maxAttempts).toBe(1);
    expect((await run(repo.getExams('c1'))).map((e) => e.maxAttempts)).toEqual([1]);
    expect(await run(repo.getExamAvailability('u5', 'c1'))).toMatchObject({ available: true, maxAttempts: 1, remainingAttempts: 1 });
  });

  it('tras el único intento, aprobado o no, se bloquea el examen y se conserva el resultado', async () => {
    const repo = new MockDataRepository();
    const first = await run(repo.submitAttempt('u5', allWrong(), TIME_UP, 'tiempo'));
    expect(first.passed).toBe(false);
    expect(await run(repo.getExamAvailability('u5', 'c1'))).toMatchObject({
      available: false,
      remainingAttempts: 0,
      reason: 'Alcanzaste el límite de intentos permitidos.',
    });
    await expect(run(repo.submitAttempt('u5', allCorrect(), 120))).rejects.toThrow('Alcanzaste el límite de intentos permitidos.');
    await expect(run(repo.submitExamAttempt('u5', 'c1-e1', allCorrect(), 120))).rejects.toThrow('Alcanzaste el límite de intentos permitidos.');
    expect((await run(repo.getAttempts('u5'))).map((a) => [a.id, a.score, a.passed])).toEqual([[first.id, 0, false]]);
    expect(await run(repo.getCertificates('u5'))).toEqual([]);
  });

  it('datos v3 antiguos con maxAttempts 2 no permiten un segundo intento y no se reescriben al leerlos', async () => {
    new MockDataRepository().resetDemo();
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY)!) as DemoState;
    s.exams.forEach((e) => (e.maxAttempts = 2));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    const repo = new MockDataRepository();

    expect((await run(repo.getActiveExam('c1')))!.maxAttempts).toBe(1);
    expect((await run(repo.getExamConfig())).maxAttempts).toBe(1);
    // u3 ya rindió: con el dato antiguo (2) podría volver a rendir; la regla lo impide.
    expect(await run(repo.getExamAvailability('u3', 'c1'))).toMatchObject({ available: false, remainingAttempts: 0 });
    await expect(run(repo.submitAttempt('u3', allCorrect(), 60))).rejects.toThrow('Alcanzaste el límite de intentos permitidos.');
    // u5 rinde una vez y queda bloqueado.
    await run(repo.submitAttempt('u5', allWrong(), TIME_UP, 'tiempo'));
    await expect(run(repo.submitAttempt('u5', allCorrect(), 60))).rejects.toThrow('Alcanzaste el límite de intentos permitidos.');
    // El dato guardado no se modificó en silencio (solo deja de usarse).
    expect(stored().exams.map((e) => e.maxAttempts)).toEqual([2, 2, 2]);
  });

  it('datos v2 antiguos (migrados) con maxAttempts 2 tampoco permiten un segundo intento', async () => {
    const state = seedState();
    state.exam = { ...state.exam, maxAttempts: 2 };
    useV2(state);
    const repo = new MockDataRepository();
    expect(repo.getStorageStatus().source).toBe('migrated-v2');
    expect((await run(repo.getExamConfig())).maxAttempts).toBe(1);
    await expect(run(repo.submitAttempt('u3', allCorrect(), 60))).rejects.toThrow('Alcanzaste el límite de intentos permitidos.');
  });

  it('el administrador no puede configurar 2 o más intentos; al guardar 1, el dato antiguo se corrige', async () => {
    new MockDataRepository().resetDemo();
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY)!) as DemoState;
    s.exams.find((e) => e.id === 'c-ia-e1')!.maxAttempts = 2;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    const repo = new MockDataRepository();
    const exam = (await run(repo.getActiveExam('c-ia')))!;
    for (const maxAttempts of [2, 3, 10, 0]) {
      await expect(run(repo.updateExamConfigById('c-ia-e1', { ...exam, maxAttempts }))).rejects.toThrow(
        'Cada alumno tiene un solo intento por examen: los intentos permitidos deben ser 1.',
      );
    }
    expect(stored().exams.find((e) => e.id === 'c-ia-e1')!.maxAttempts).toBe(2);
    expect(await run(repo.updateExamConfigById('c-ia-e1', { ...exam, maxAttempts: 1 }))).toMatchObject({ maxAttempts: 1 });
    expect(stored().exams.find((e) => e.id === 'c-ia-e1')!.maxAttempts).toBe(1);
  });

  it('el historial de intentos y certificados no cambia con la regla', async () => {
    const repo = new MockDataRepository();
    expect((await run(repo.listAttempts())).map((a) => [a.id, a.userId, a.score, a.passed])).toEqual([
      ['att1', 'u1', 80, true],
      ['att2', 'u3', 50, false],
      ['att3', 'u6', 90, true],
    ]);
    expect((await run(repo.listCertificates())).map((c) => [c.code, c.userId, c.score])).toEqual([['IMC-DEMO-0001', 'u1', 80]]);
  });
});

describe('Migración del estado v2 (a v4, pasando por v3)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('migra conservando identificadores, datos y el estado anterior', async () => {
    const v2 = seedState();
    v2.users.push({ id: 'u-extra', fullName: 'Alumno Registrado En Demo', email: 'extra@ejemplo.test', dni: '00000077', role: 'participant' });
    v2.enrollments.push({ userId: 'u-extra', courseId: 'c1', completedVideoIds: ['v1'], status: 'en_progreso' });
    useV2(v2);

    const repo = new MockDataRepository();
    expect(repo.getStorageStatus()).toMatchObject({ source: 'migrated-v2', migrationProblems: [], legacyStatePresent: true });
    expect(repo.getStorageStatus().warning).toContain('Se migraron');

    // El estado v2 sigue intacto y el migrado quedó guardado (v4, B1.2); no se escribe una clave v3.
    expect(JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY)!)).toEqual(v2);
    const v3 = stored();
    expect(v3.version).toBe(4);
    expect(localStorage.getItem(V3_STORAGE_KEY)).toBeNull();
    expect(v3.users.map((u) => u.role)).toEqual(v2.users.map((u) => (u.role === 'admin' ? 'instructor' : u.role)));
    expect(v3.users.map((u) => u.id)).toEqual(v2.users.map((u) => u.id));
    expect(v3.attempts.map((a) => [a.id, a.courseId, a.examId, a.scaleMax])).toEqual(
      v2.attempts.map((a) => [a.id, 'c1', 'c1-e1', 100]),
    );
    expect(v3.certificates.map((c) => [c.code, c.courseId])).toEqual([['IMC-DEMO-0001', 'c1']]);
    expect((await run(repo.getEnrollment('u-extra')))!.completedVideoIds).toEqual(['v1']);
    // Se añaden los cursos demo sin reemplazar el curso existente.
    expect((await run(repo.getCourses())).map((c) => c.id)).toEqual(['c1', 'c-ia', 'c-mkt']);
  });

  it('no asigna una portada al curso migrado (P9): se mostrará la de respaldo', async () => {
    useV2(seedState());
    const repo = new MockDataRepository();
    expect((await run(repo.getCourses())).find((c) => c.id === 'c1')!.coverImage).toBeNull();
  });

  it('una vez migrado, se carga el estado v4 y no se vuelve a migrar', async () => {
    useV2(seedState());
    const first = new MockDataRepository();
    await run(first.markVideoCompleted('u4', 'v1'));
    const second = new MockDataRepository();
    expect(second.getStorageStatus().source).toBe('v4');
    expect((await run(second.getEnrollment('u4')))!.completedVideoIds).toEqual(['v1']);
  });

  it('un estado v3 ilegible se respalda en otra clave antes de usar la semilla', () => {
    localStorage.setItem(STORAGE_KEY, '{dañado');
    const repo = new MockDataRepository();
    expect(localStorage.getItem(BACKUP_STORAGE_KEY)).toBe('{dañado');
    expect(repo.getStorageStatus()).toMatchObject({ source: 'seed' });
    expect(repo.getStorageStatus().warning).toContain(BACKUP_STORAGE_KEY);
  });

  it('resetDemo no vuelve a migrar el estado anterior ni lo borra', async () => {
    const v2 = seedState();
    v2.course.name = 'Nombre de la versión anterior';
    useV2(v2);
    new MockDataRepository().resetDemo();
    const repo = new MockDataRepository();
    expect((await run(repo.getCourse())).name).toBe(SEED_COURSE.name);
    expect(localStorage.getItem(LEGACY_STORAGE_KEY)).not.toBeNull();
  });

  it('removeLegacyState solo elimina el estado v2 cuando el v3 está guardado y es válido', () => {
    localStorage.setItem(LEGACY_STORAGE_KEY, '{no es json');
    const repo = new MockDataRepository();
    expect(repo.removeLegacyState()).toBe(false);
    expect(localStorage.getItem(LEGACY_STORAGE_KEY)).not.toBeNull();

    localStorage.clear();
    useV2(seedState());
    const migrated = new MockDataRepository();
    expect(migrated.removeLegacyState()).toBe(true);
    expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toBeNull();
    expect(migrated.getStorageStatus().legacyStatePresent).toBe(false);
  });

  it('verifyMigration detecta datos perdidos', () => {
    const v2 = seedState();
    const v3 = migrateV2(v2);
    expect(verifyMigration(v2, v3)).toEqual([]);
    v3.attempts.pop();
    v3.certificates = [];
    expect(verifyMigration(v2, v3)).toEqual(['Intentos: 3 antes, 2 después.', 'Certificados: 1 antes, 0 después.']);
  });
});
