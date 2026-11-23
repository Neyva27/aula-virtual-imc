/**
 * Módulo académico (18/11/2026), integración HTTP con la aplicación completa y la base simulada (sin MySQL):
 * Instructor (cursos, módulos, videos, evaluación, publicación, matrícula, resultados, panel) y estudiante (avance,
 * examen con tiempo del servidor, un solo intento, calificación, certificado y verificación pública).
 */
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDemo } from '../prisma/seed-data.js';
import { FakePrisma } from './support/fake-prisma.js';
import { createTestApp, DEMO_PASSWORD, type TestApp } from './support/test-app.js';

const API = '/api/v1';
const INSTRUCTOR = 'admin@ejemplo.test';
const ANA = 'ana@ejemplo.test';
const LUIS = 'luis@ejemplo.test';
const YT = ['dQw4w9WgXcQ', 'aaaaaaaaaaa', 'bbbbbbbbbbb', 'ccccccccccc', 'ddddddddddd'];

async function scenario(db: FakePrisma) {
  await seedDemo(db as never, DEMO_PASSWORD);
  const passwordHash = db.userByEmail(ANA).passwordHash;
  await db.user.create({ data: { id: 'i2', email: 'i2@prueba.test', role: 'INSTRUCTOR', firstNames: 'Otro', lastNames: 'Instructor', passwordHash } });
  await db.instructor.create({ data: { userId: 'i2' } });
  db.registeredBy('a1', ['u1', 'u2']); // ana (u1) y luis (u2) son de a1
}

describe('Módulo académico (HTTP, base simulada)', () => {
  let db: FakePrisma;
  let t: TestApp;
  const tokens = new Map<string, string>();
  const token = async (email: string) => {
    if (!tokens.has(email)) {
      const res = await request(t.http).post(`${API}/auth/login`).send({ email, password: DEMO_PASSWORD });
      tokens.set(email, res.body.accessToken as string);
    }
    return tokens.get(email)!;
  };
  const as = async (email: string) => {
    const bearer = await token(email);
    return {
      get: (path: string) => request(t.http).get(`${API}${path}`).set('Authorization', `Bearer ${bearer}`),
      post: (path: string, body: object = {}) => request(t.http).post(`${API}${path}`).set('Authorization', `Bearer ${bearer}`).send(body),
      put: (path: string, body: object = {}) => request(t.http).put(`${API}${path}`).set('Authorization', `Bearer ${bearer}`).send(body),
      del: (path: string) => request(t.http).delete(`${API}${path}`).set('Authorization', `Bearer ${bearer}`),
    };
  };

  /** Curso publicable: 5 videos de 6 min publicados y examen de 2 preguntas que suman 100. */
  async function publishedCourse() {
    const ins = await as(INSTRUCTOR);
    const course = await ins.post('/courses', { name: 'Seguridad en altura', description: 'Curso real de prueba', trainingHours: 4, coverImage: null });
    expect(course.status).toBe(201);
    const id = course.body.id as string;
    for (const [i, v] of YT.entries()) {
      const res = await ins.post(`/courses/${id}/videos`, {
        title: `Video ${i + 1}`,
        durationSec: 360,
        published: true,
        url: `https://www.youtube.com/watch?v=${v}`,
        sourceKind: 'youtube',
      });
      expect(res.status, res.body.message).toBe(201);
    }
    const exam = (await ins.get(`/courses/${id}/exams/active`)).body;
    const q1 = await ins.post(`/exams/${exam.id}/questions`, {
      id: 'nueva-1',
      type: 'single',
      text: '¿Altura mínima para usar arnés?',
      options: [
        { id: 'a', text: '1,8 m' },
        { id: 'b', text: '5 m' },
      ],
      correct: ['a'],
      points: 50,
    });
    expect(q1.status, q1.body.message).toBe(201);
    const q2 = await ins.post(`/exams/${exam.id}/questions`, {
      id: 'nueva-2',
      type: 'multiple',
      text: 'Elementos del sistema de detención',
      options: [
        { id: 'a', text: 'Arnés' },
        { id: 'b', text: 'Línea de vida' },
        { id: 'c', text: 'Casco de bicicleta' },
      ],
      correct: ['a', 'b'],
      points: 50,
    });
    expect(q2.status, q2.body.message).toBe(201);
    const published = await ins.put(`/courses/${id}`, { name: 'Seguridad en altura', description: 'Curso real de prueba', trainingHours: 4, coverImage: null, status: 'publicado' });
    expect(published.status, published.body.message).toBe(200);
    return { id, examId: exam.id as string, questions: q2.body as { id: string; type: string }[] };
  }

  beforeEach(async () => {
    db = new FakePrisma();
    await scenario(db);
    tokens.clear();
    t = await createTestApp(db);
  });
  afterEach(() => t.close());

  describe('Instructor: cursos, contenido y evaluación', () => {
    it('crea el curso en borrador con un módulo y un examen; RN-03 y la evaluación bloquean la publicación', async () => {
      const ins = await as(INSTRUCTOR);
      const created = await ins.post('/courses', { name: 'Curso A', description: 'Descripción', trainingHours: null, coverImage: null });
      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({ name: 'Curso A', status: 'borrador', active: true });
      const id = created.body.id;
      expect(db.courses[0]).toMatchObject({ createdById: 'a1' });
      const content = await ins.get(`/courses/${id}/content`);
      expect(content.body.modules).toHaveLength(1);
      const check = await ins.get(`/courses/${id}/publication-check`);
      expect(check.body.canPublish).toBe(false);
      expect(check.body.blocking.join(' ')).toContain('Módulo 1 «Contenido del curso»: no tiene videos publicados; se requiere al menos 1 video publicado por módulo.');
      const publish = await ins.put(`/courses/${id}`, { name: 'Curso A', description: 'Descripción', trainingHours: null, coverImage: null, status: 'publicado' });
      expect(publish.status).toBe(409);
      expect(publish.body.message).toBe('Para publicar el curso necesitas al menos 1 video publicado.');
    });

    it('valida enlaces de video (YouTube, Drive, https) y no guarda archivos en la base', async () => {
      const ins = await as(INSTRUCTOR);
      const id = (await ins.post('/courses', { name: 'Curso B', description: 'D', trainingHours: 2, coverImage: null })).body.id;
      const bad = await ins.post(`/courses/${id}/videos`, { title: 'V', durationSec: 300, published: false, url: 'http://inseguro.test/v.mp4' });
      expect(bad.status).toBe(400);
      const mp4 = await ins.post(`/courses/${id}/videos`, { title: 'MP4', durationSec: 300, published: false, url: 'https://almacen.ejemplo.test/v.mp4', materialUrl: 'https://almacen.ejemplo.test/guia.pdf' });
      expect(mp4.status).toBe(201);
      const drive = await ins.post(`/courses/${id}/videos`, { title: 'Drive', durationSec: 300, published: false, url: 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/view', sourceKind: 'drive' });
      expect(drive.status).toBe(201);
      expect(db.courseVideos.map((v) => String(v.sourceKind)).sort((a, b) => a.localeCompare(b))).toEqual(['DRIVE', 'URL']);
      expect(db.courseVideos.find((v) => v.sourceKind === 'URL')).toMatchObject({ sourceRef: 'https://almacen.ejemplo.test/v.mp4', materialUrl: 'https://almacen.ejemplo.test/guia.pdf' });
    });

    it('módulos: crear, reordenar y eliminar moviendo sus videos (nunca se borran videos)', async () => {
      const ins = await as(INSTRUCTOR);
      const id = (await ins.post('/courses', { name: 'Curso C', description: 'D', trainingHours: 2, coverImage: null })).body.id;
      const withModule = await ins.post(`/courses/${id}/modules`, { title: 'Módulo 2', description: 'Práctica' });
      const [m1, m2] = withModule.body.modules;
      await ins.post(`/courses/${id}/videos`, { title: 'V1', durationSec: 300, published: false, url: 'https://videos.ejemplo.test/v1.mp4', sourceKind: 'url', moduleId: m2.id });
      expect((await ins.del(`/courses/${id}/modules/${m2.id}`)).status).toBe(409); // falta el destino
      const moved = await ins.del(`/courses/${id}/modules/${m2.id}?targetModuleId=${m1.id}`);
      expect(moved.status).toBe(200);
      expect(moved.body.modules).toHaveLength(1);
      expect(moved.body.modules[0].videos.map((v: { title: string }) => v.title)).toEqual(['V1']);
      expect((await ins.del(`/courses/${id}/modules/${m1.id}`)).body.message).toBe('El curso debe tener al menos un módulo.');
    });

    it('aislamiento: otro Instructor no ve ni modifica el curso (404); un estudiante no usa rutas de Instructor (403)', async () => {
      const ins = await as(INSTRUCTOR);
      const id = (await ins.post('/courses', { name: 'Curso D', description: 'D', trainingHours: 2, coverImage: null })).body.id;
      const other = await as('i2@prueba.test');
      expect((await other.get('/courses')).body).toEqual([]);
      expect((await other.get(`/courses/${id}/content`)).status).toBe(404);
      expect((await other.post(`/courses/${id}/videos`, { title: 'X', durationSec: 300, published: false })).status).toBe(404);
      expect((await (await as(ANA)).get('/courses')).status).toBe(403);
    });
  });

  describe('Flujo completo: matrícula → avance → examen → certificado', () => {
    it('el estudiante avanza, rinde una sola vez, aprueba y obtiene un certificado verificable', async () => {
      const { id, examId, questions } = await publishedCourse();
      const ins = await as(INSTRUCTOR);
      // Solo estudiantes propios: luis es de a1; un estudiante ajeno daría 404.
      expect((await ins.post('/enrollments', { studentId: 'u1', courseId: id })).status).toBe(201);
      expect((await (await as('i2@prueba.test')).post('/enrollments', { studentId: 'u1', courseId: id })).status).toBe(404);

      const ana = await as(ANA);
      const courses = await ana.get('/me/courses');
      expect(courses.body).toHaveLength(1);
      expect(courses.body[0]).toMatchObject({ totalVideos: 5, completedVideos: 0, percent: 0 });
      expect((await ana.get(`/me/courses/${id}/exam/availability`)).body).toMatchObject({
        available: false,
        reason: 'Debes completar todos los videos antes de rendir el examen.',
      });
      const content = await ana.get(`/me/courses/${id}/content`);
      const videoIds = content.body.modules.flatMap((m: { videos: { id: string }[] }) => m.videos.map((v) => v.id));
      for (const v of videoIds) expect((await ana.post(`/me/courses/${id}/videos/${v}/complete`)).status).toBe(200);
      expect((await ana.get('/me/courses')).body[0]).toMatchObject({ completedVideos: 5, percent: 100, enrollment: { status: 'listo_examen' } });

      // Preguntas para rendir: sin respuestas correctas.
      const forStudent = await ana.get(`/me/exams/${examId}/questions`);
      expect(forStudent.body.every((q: { correct: string[] }) => q.correct.length === 0)).toBe(true);
      expect(forStudent.body.find((q: { type: string }) => q.type === 'multiple').selectCount).toBe(2);
      expect(JSON.stringify(forStudent.body)).not.toContain('rubric');

      const started = await ana.post(`/me/courses/${id}/exam/start`);
      expect(started.status).toBe(200);
      const again = await ana.post(`/me/courses/${id}/exam/start`);
      expect(again.body.startedAt).toBe(started.body.startedAt); // el tiempo no se reinicia

      const [single, multiple] = questions;
      const incomplete = await ana.post(`/me/exams/${examId}/submit`, { answers: { [single.id]: ['a'] }, durationSec: 60 });
      expect(incomplete.status).toBe(400);
      const submitted = await ana.post(`/me/exams/${examId}/submit`, { answers: { [single.id]: ['a'], [multiple.id]: ['a', 'b'] }, durationSec: 60 });
      expect(submitted.status, submitted.body.message).toBe(201);
      expect(submitted.body).toMatchObject({ score: 100, passed: true, scaleMax: 100, correctCount: 2, gradingRule: 'proporcional' });

      // RN-07: un solo intento.
      expect((await ana.post(`/me/exams/${examId}/submit`, { answers: { [single.id]: ['a'], [multiple.id]: ['a', 'b'] }, durationSec: 60 })).status).toBe(409);
      expect((await ana.get(`/me/courses/${id}/exam/availability`)).body.reason).toBe('Ya aprobaste este examen.');

      // Certificado emitido y verificación pública sin datos privados.
      const certs = await ana.get('/me/certificates');
      expect(certs.body).toHaveLength(1);
      expect(certs.body[0]).toMatchObject({ courseName: 'Seguridad en altura', participantName: 'Ana Torres Quispe', score: 100, trainingHours: 4, status: 'vigente' });
      const code = certs.body[0].code as string;
      expect(code).toMatch(/^IMC-\d{4}-[0-9A-F]{10}$/);
      const verify = await request(t.http).get(`${API}/public/certificates/${code}`);
      expect(verify.status).toBe(200);
      expect(verify.body).toMatchObject({ code, courseName: 'Seguridad en altura', status: 'vigente' });
      expect(JSON.stringify(verify.body)).not.toContain('00000001'); // sin DNI
      expect((await request(t.http).get(`${API}/public/certificates/IMC-0000-NOEXISTE`)).status).toBe(404);

      // RN-15: la evaluación rendida no se puede modificar.
      const locked = await ins.post(`/exams/${examId}/questions`, { id: single.id, type: 'single', text: 'Cambio', options: [{ id: 'a', text: 'x' }, { id: 'b', text: 'y' }], correct: ['b'], points: 50 });
      expect(locked.status).toBe(409);
      expect(locked.body.message).toContain('ya existen intentos registrados');
      expect((await ins.put(`/exams/${examId}/config`, { timeMinutes: 30, passScore: 60, maxAttempts: 1, scaleMax: 100 })).status).toBe(409);

      // Resultados y panel del Instructor desde la base.
      expect((await ins.get(`/attempts?courseId=${id}`)).body).toHaveLength(1);
      expect((await ins.get('/certificates')).body).toHaveLength(1);
      const dash = await ins.get('/dashboard');
      expect(dash.body).toMatchObject({
        participants: { total: 2 },
        courses: { total: 1, published: 1 },
        evaluations: { total: 1, approved: 1, failed: 0 },
        certificates: { issued: 1 },
      });
      expect(dash.body.recent.length).toBeGreaterThan(0);

      // No se retira un curso con avance.
      expect((await ins.del(`/enrollments/u1/${id}`)).status).toBe(409);
    });

    it('desaprobado: sin certificado; calificación proporcional en selección múltiple', async () => {
      const { id, examId, questions } = await publishedCourse();
      await (await as(INSTRUCTOR)).post('/enrollments', { studentId: 'u2', courseId: id });
      const luis = await as(LUIS);
      const content = await luis.get(`/me/courses/${id}/content`);
      for (const m of content.body.modules) for (const v of m.videos) await luis.post(`/me/courses/${id}/videos/${v.id}/complete`);
      await luis.post(`/me/courses/${id}/exam/start`);
      const [single, multiple] = questions;
      // Única incorrecta (0) y múltiple con 1 de 2 correctas + 1 incorrecta (25 de 50): 25/100 → desaprobado.
      const res = await luis.post(`/me/exams/${examId}/submit`, { answers: { [single.id]: ['b'], [multiple.id]: ['a', 'c'] }, durationSec: 90 });
      expect(res.body).toMatchObject({ score: 25, passed: false });
      expect((await luis.get('/me/certificates')).body).toEqual([]);
      expect((await luis.get('/me/enrollments')).body[0].status).toBe('desaprobado');
    });

    it('el tiempo lo controla el servidor: un examen vencido se entrega solo con las respuestas guardadas', async () => {
      const { id, examId, questions } = await publishedCourse();
      await (await as(INSTRUCTOR)).post('/enrollments', { studentId: 'u1', courseId: id });
      const ana = await as(ANA);
      const content = await ana.get(`/me/courses/${id}/content`);
      for (const m of content.body.modules) for (const v of m.videos) await ana.post(`/me/courses/${id}/videos/${v.id}/complete`);
      await ana.post(`/me/courses/${id}/exam/start`);
      expect((await ana.put(`/me/courses/${id}/exam/answers`, { answers: { [questions[0].id]: ['a'] } })).status).toBe(200);
      // Simula que pasó el tiempo.
      db.examStarts[0].endsAt = new Date(Date.now() - 60_000);
      const attempts = await ana.get(`/me/attempts?examId=${examId}`);
      expect(attempts.body).toHaveLength(1);
      expect(attempts.body[0]).toMatchObject({ autoSubmitted: true, score: 50, passed: false });
      expect(db.examStarts[0].closedAt).toBeInstanceOf(Date);
    });

    it('un estudiante no ve cursos que no tiene asignados ni datos de otros', async () => {
      const { id } = await publishedCourse();
      const luis = await as(LUIS);
      expect((await luis.get('/me/courses')).body).toEqual([]);
      expect((await luis.get(`/me/courses/${id}/content`)).status).toBe(404);
      expect((await luis.get('/attempts')).status).toBe(403);
    });
  });
});
