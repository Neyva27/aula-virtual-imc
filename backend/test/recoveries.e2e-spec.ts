/**
 * Recuperación de exámenes (21/11/2026), integración HTTP con la base simulada (sin MySQL): autorización exclusiva del
 * Instructor y solo para desaprobados, solo con el examen original (la modalidad independiente ya no se admite), inicio, respuestas guardadas,
 * entrega, calificación, historial (el intento regular no se toca), un solo intento (RN-07), anulación, vencimiento y
 * aislamiento entre estudiantes e Instructores.
 */
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDemo } from '../prisma/seed-data.js';
import { FakePrisma } from './support/fake-prisma.js';
import { createTestApp, DEMO_PASSWORD, type TestApp } from './support/test-app.js';

const API = '/api/v1';
const INSTRUCTOR = 'admin@ejemplo.test';
const ANA = 'ana@ejemplo.test'; // u1: desaprueba el regular
const LUIS = 'luis@ejemplo.test'; // u2: aprueba el regular
const hours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

describe('Recuperación de exámenes (HTTP, base simulada)', () => {
  let db: FakePrisma;
  let t: TestApp;
  const tokens = new Map<string, string>();
  const as = async (email: string) => {
    if (!tokens.has(email)) {
      const res = await request(t.http).post(`${API}/auth/login`).send({ email, password: DEMO_PASSWORD });
      tokens.set(email, res.body.accessToken as string);
    }
    const bearer = tokens.get(email)!;
    return {
      get: (path: string) => request(t.http).get(`${API}${path}`).set('Authorization', `Bearer ${bearer}`),
      post: (path: string, body: object = {}) => request(t.http).post(`${API}${path}`).set('Authorization', `Bearer ${bearer}`).send(body),
      put: (path: string, body: object = {}) => request(t.http).put(`${API}${path}`).set('Authorization', `Bearer ${bearer}`).send(body),
    };
  };
  type Client = Awaited<ReturnType<typeof as>>;

  /** Curso publicado con 1 video (21/11/2026: basta uno) y un examen de una pregunta de 100 puntos (correcta: «a»). */
  async function setupCourse() {
    const ins = await as(INSTRUCTOR);
    const id = (await ins.post('/courses', { name: 'Curso con recuperación', description: 'Prueba', trainingHours: 2, coverImage: null })).body.id as string;
    const video = await ins.post(`/courses/${id}/videos`, { title: 'Único video', durationSec: 2700, published: true, url: 'https://videos.ejemplo.test/1.mp4', sourceKind: 'url' });
    expect(video.status, video.body.message).toBe(201);
    const exam = (await ins.get(`/courses/${id}/exams/active`)).body;
    const q = await ins.post(`/exams/${exam.id}/questions`, {
      id: 'nueva-1',
      type: 'single',
      text: '¿Cuál es la respuesta correcta?',
      options: [
        { id: 'a', text: 'Correcta' },
        { id: 'b', text: 'Incorrecta' },
      ],
      correct: ['a'],
      points: 100,
    });
    expect(q.status, q.body.message).toBe(201);
    const pub = await ins.put(`/courses/${id}`, { name: 'Curso con recuperación', description: 'Prueba', trainingHours: 2, coverImage: null, status: 'publicado' });
    expect(pub.status, pub.body.message).toBe(200);
    for (const studentId of ['u1', 'u2']) expect((await ins.post('/enrollments', { studentId, courseId: id })).status).toBe(201);
    const questionId = q.body[0].id as string;
    return { id, examId: exam.id as string, questionId, videoId: (await ins.get(`/courses/${id}/content`)).body.modules[0].videos[0].id as string };
  }

  /** El estudiante ve el video, inicia y entrega el examen que tenga habilitado (regular o recuperación). */
  async function takeExam(student: Client, courseId: string, videoId: string, questionId: string, option: 'a' | 'b') {
    await student.post(`/me/courses/${courseId}/videos/${videoId}/complete`);
    const started = await student.post(`/me/courses/${courseId}/exam/start`);
    expect(started.status, started.body.message).toBe(200);
    const examId = started.body.exam.id as string;
    const qid = (await student.get(`/me/exams/${examId}/questions`)).body[0]?.id ?? questionId;
    const saved = await student.put(`/me/courses/${courseId}/exam/answers`, { answers: { [qid]: [option] } });
    expect(saved.status, saved.body.message).toBe(200);
    return student.post(`/me/exams/${examId}/submit`, { answers: { [qid]: [option] }, durationSec: 60 });
  }

  beforeEach(async () => {
    db = new FakePrisma();
    await seedDemo(db as never, DEMO_PASSWORD);
    const passwordHash = db.userByEmail(ANA).passwordHash;
    await db.user.create({ data: { id: 'i2', email: 'i2@prueba.test', role: 'INSTRUCTOR', firstNames: 'Otro', lastNames: 'Instructor', passwordHash } });
    await db.instructor.create({ data: { userId: 'i2' } });
    db.registeredBy('a1', ['u1', 'u2', 'u3']);
    tokens.clear();
    t = await createTestApp(db);
  });
  afterEach(() => t.close());

  it('solo se autoriza a desaprobados, solo el Instructor dueño, y una sola vez', async () => {
    const { id, videoId, questionId } = await setupCourse();
    const ins = await as(INSTRUCTOR);
    const ana = await as(ANA);
    const luis = await as(LUIS);
    const window = { opensAt: hours(-1), closesAt: hours(48) };
    // Antes de rendir: no corresponde (no se habilita sola ni a quien no rindió).
    const early = await ins.post('/recoveries', { userId: 'u1', courseId: id, mode: 'original', ...window });
    expect(early.status).toBe(409);
    expect(early.body.message).toContain('no ha rendido el examen regular');

    expect((await takeExam(ana, id, videoId, questionId, 'b')).body).toMatchObject({ passed: false, score: 0 });
    expect((await takeExam(luis, id, videoId, questionId, 'a')).body).toMatchObject({ passed: true, score: 100 });

    const states = (await ins.get(`/recovery-states?courseId=${id}`)).body as { userId: string; status: string | null; reason: string }[];
    expect(states.find((s) => s.userId === 'u1')).toMatchObject({ status: 'pendiente', reason: 'Desaprobó el examen regular.' });
    expect(states.find((s) => s.userId === 'u2')).toMatchObject({ status: null });

    const approved = await ins.post('/recoveries', { userId: 'u2', courseId: id, mode: 'original', ...window });
    expect(approved.status).toBe(409);
    expect(approved.body.message).toBe('El estudiante aprobó el examen regular: no corresponde una recuperación.');
    expect((await ins.post('/recoveries', { userId: 'u3', courseId: id, mode: 'original', ...window })).status).toBe(404); // no inscrito
    expect((await (await as('i2@prueba.test')).post('/recoveries', { userId: 'u1', courseId: id, mode: 'original', ...window })).status).toBe(404);
    expect((await ana.post('/recoveries', { userId: 'u1', courseId: id, mode: 'original', ...window })).status).toBe(403); // no se autoriza sola
    expect((await ins.post('/recoveries', { userId: 'u1', courseId: id, mode: 'otra', ...window })).status).toBe(400);
    expect((await ins.post('/recoveries', { userId: 'u1', courseId: id, mode: 'original', opensAt: hours(-3), closesAt: hours(-2) })).status).toBe(400);

    const ok = await ins.post('/recoveries', { userId: 'u1', courseId: id, mode: 'original', ...window });
    expect(ok.status, ok.body.message).toBe(201);
    expect(ok.body).toMatchObject({ userId: 'u1', courseId: id, mode: 'original', reason: 'desaprobado', authorizedBy: 'a1' });
    const again = await ins.post('/recoveries', { userId: 'u1', courseId: id, mode: 'original', ...window });
    expect(again.status).toBe(409);
    expect(again.body.message).toContain('solo se permite una oportunidad');
    // El estudiante ve solo la suya.
    expect((await ana.get(`/me/courses/${id}/recovery`)).body).toMatchObject({ status: 'autorizada', recovery: { id: ok.body.id } });
    expect((await luis.get(`/me/courses/${id}/recovery`)).body).toMatchObject({ status: null, recovery: null });
    expect((await (await as('i2@prueba.test')).get(`/recoveries?courseId=${id}`)).status).toBe(404);
  });

  it('modalidad examen original: se reabre el examen, se rinde una vez y la nota de recuperación queda vigente; el regular se conserva', async () => {
    const { id, examId, videoId, questionId } = await setupCourse();
    const ins = await as(INSTRUCTOR);
    const ana = await as(ANA);
    await takeExam(ana, id, videoId, questionId, 'b');
    const regularBefore = { ...db.examAttempts.find((a) => a.studentId === 'u1')! };
    await ins.post('/recoveries', { userId: 'u1', courseId: id, mode: 'original', opensAt: hours(-1), closesAt: hours(24) });

    const availability = await ana.get(`/me/courses/${id}/exam/availability`);
    if (availability.status === 200) expect(availability.body).toMatchObject({ available: true, examId });
    const submitted = await takeExam(ana, id, videoId, questionId, 'a');
    expect(submitted.status, submitted.body.message).toBe(201);
    expect(submitted.body).toMatchObject({ kind: 'recuperacion', examId, passed: true, score: 100 });
    // Historial: dos intentos; el regular no cambió.
    const mine = (await ana.get(`/me/attempts?courseId=${id}`)).body as { kind?: string; score: number }[];
    expect(mine.map((a) => [a.kind ?? 'regular', a.score])).toEqual([
      ['regular', 0],
      ['recuperacion', 100],
    ]);
    expect(db.examAttempts.find((a) => a.id === regularBefore.id)).toMatchObject({ score: 0, passed: false, kind: 'REGULAR' });
    // Matrícula aprobada y certificado con la nota de la recuperación (R4).
    expect(db.enrollments.find((e) => e.studentId === 'u1' && e.courseId === id)!.status).toBe('APROBADO');
    expect(db.certificates.find((c) => c.studentId === 'u1')).toMatchObject({ attemptId: submitted.body.id, score: 100 });
    // Un solo intento de recuperación (RN-07).
    expect((await ana.post(`/me/exams/${examId}/submit`, { answers: { [questionId]: ['a'] }, durationSec: 30 })).status).toBe(409);
    expect((await ana.get(`/me/courses/${id}/recovery`)).body.status).toBe('rendida');
    // El Instructor consulta ambos resultados.
    const all = (await ins.get(`/attempts?courseId=${id}&userId=u1`)).body as { kind?: string }[];
    expect(all.map((a) => a.kind ?? 'regular').sort()).toEqual(['recuperacion', 'regular']);
  });

  it('solo examen original (20/11/2026): «independiente» y la creación de exámenes de recuperación ya no existen; lo histórico se sigue leyendo', async () => {
    const { id, examId, videoId, questionId } = await setupCourse();
    const ins = await as(INSTRUCTOR);
    const ana = await as(ANA);
    await takeExam(ana, id, videoId, questionId, 'b');

    // Ya no se crean exámenes de recuperación independientes (la ruta no existe).
    expect((await ins.post(`/courses/${id}/recovery-exams`, { questionIds: [questionId] })).status).toBe(404);
    // La modalidad independiente se rechaza, con o sin examen; también otro examen distinto del original.
    const indep = await ins.post('/recoveries', { userId: 'u1', courseId: id, mode: 'independiente', opensAt: hours(-1), closesAt: hours(24) });
    expect(indep.status).toBe(400);
    expect(String(indep.body.message)).toContain('examen original');
    expect((await ins.post('/recoveries', { userId: 'u1', courseId: id, recoveryExamId: 'otro-examen', opensAt: hours(-1), closesAt: hours(24) })).status).toBe(400);
    expect(db.examRecoveries).toHaveLength(0);

    // Sin «mode» también vale: siempre el examen original, sin duplicar exámenes ni preguntas.
    const examsBefore = db.exams.length;
    const ok = await ins.post('/recoveries', { userId: 'u1', courseId: id, opensAt: hours(-1), closesAt: hours(24) });
    expect(ok.status, ok.body.message).toBe(201);
    expect(ok.body).toMatchObject({ mode: 'original', examId, regularExamId: examId, reason: 'desaprobado' });
    expect(db.exams.length).toBe(examsBefore);

    // Una fila histórica con modalidad INDEPENDIENTE se sigue leyendo sin errores.
    await db.examRecovery.create({
      data: { id: 'hist-1', studentId: 'u2', courseId: id, regularExamId: examId, examId, reason: 'DESAPROBADO', mode: 'INDEPENDIENTE', opensAt: new Date(Date.now() - 48 * 3_600_000), closesAt: new Date(Date.now() - 24 * 3_600_000), authorizedById: null, cancelledAt: new Date(Date.now() - 47 * 3_600_000) },
    });
    const list = (await ins.get(`/recoveries?courseId=${id}`)).body as { id: string; mode: string }[];
    expect(list.find((r) => r.id === 'hist-1')?.mode).toBe('independiente');
  });

  it('aislamiento: no autoriza a aprobados, a quien no rindió ni a participantes de otro Instructor', async () => {
    const { id, videoId, questionId } = await setupCourse();
    const ins = await as(INSTRUCTOR);
    const luis = await as(LUIS);
    // Ana no rindió el regular: no corresponde.
    const none = await ins.post('/recoveries', { userId: 'u1', courseId: id, opensAt: hours(-1), closesAt: hours(24) });
    expect(none.status).toBe(409);
    expect(none.body.message).toContain('no ha rendido');
    // Luis aprobó: no corresponde.
    await takeExam(luis, id, videoId, questionId, 'a');
    expect((await ins.post('/recoveries', { userId: 'u2', courseId: id, opensAt: hours(-1), closesAt: hours(24) })).status).toBe(409);
    // Un participante registrado por otro Instructor no existe para este (404), aunque esté matriculado.
    db.students.find((s) => s.userId === 'u2')!.registeredById = 'i2';
    expect((await ins.post('/recoveries', { userId: 'u2', courseId: id, opensAt: hours(-1), closesAt: hours(24) })).status).toBe(404);
    expect(((await ins.get(`/recovery-states?courseId=${id}`)).body as { userId: string }[]).some((s) => s.userId === 'u2')).toBe(false);
    expect(db.examRecoveries).toHaveLength(0);
  });

  it('anular antes del inicio libera la oportunidad; después del inicio no se puede; vencida sin inicio queda «no rindió»', async () => {
    const { id, videoId, questionId } = await setupCourse();
    const ins = await as(INSTRUCTOR);
    const ana = await as(ANA);
    await takeExam(ana, id, videoId, questionId, 'b');
    const first = (await ins.post('/recoveries', { userId: 'u1', courseId: id, mode: 'original', opensAt: hours(1), closesAt: hours(24) })).body;
    // Aún no abre: el estudiante no puede iniciarla.
    const notYet = await ana.post(`/me/courses/${id}/exam/start`);
    expect(notYet.status).toBe(409);
    expect(notYet.body.message).toContain('estará disponible desde');
    const cancelled = await ins.put(`/recoveries/${first.id}/cancel`);
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.cancelledAt).toBeTruthy();
    expect((await ins.get(`/recovery-states?courseId=${id}&userId=u1`)).body[0].status).toBe('anulada');
    expect((await ins.put(`/recoveries/${first.id}/cancel`)).status).toBe(409);

    // Nueva autorización, se inicia y ya no se puede anular.
    const second = (await ins.post('/recoveries', { userId: 'u1', courseId: id, mode: 'original', opensAt: hours(-1), closesAt: hours(24) })).body;
    expect((await ana.post(`/me/courses/${id}/exam/start`)).status).toBe(200);
    const blocked = await ins.put(`/recoveries/${second.id}/cancel`);
    expect(blocked.status).toBe(409);
    expect(blocked.body.message).toContain('ya inició');

    // El tiempo termina sin entrega: se entrega sola con las respuestas guardadas.
    await ana.put(`/me/courses/${id}/exam/answers`, { answers: { [questionId]: ['a'] } });
    const row = db.examRecoveries.find((r) => r.id === second.id)!;
    row.startedAt = new Date(Date.now() - 3 * 3_600_000);
    row.endsAt = new Date(Date.now() - 2 * 3_600_000);
    const attempts = (await ana.get(`/me/attempts?courseId=${id}`)).body as { kind?: string; autoSubmitted?: boolean; passed: boolean }[];
    expect(attempts.find((a) => a.kind === 'recuperacion')).toMatchObject({ autoSubmitted: true, passed: true });
  });

  it('una autorización que vence sin inicio queda «no rindió» y no crea intento ni nota', async () => {
    const { id, videoId, questionId } = await setupCourse();
    const ins = await as(INSTRUCTOR);
    const ana = await as(ANA);
    await takeExam(ana, id, videoId, questionId, 'b');
    const rec = (await ins.post('/recoveries', { userId: 'u1', courseId: id, mode: 'original', opensAt: hours(-1), closesAt: hours(2) })).body;
    db.examRecoveries.find((r) => r.id === rec.id)!.closesAt = new Date(Date.now() - 60_000);
    expect((await ana.get(`/me/courses/${id}/recovery`)).body.status).toBe('no_rindio');
    expect((await ana.post(`/me/courses/${id}/exam/start`)).status).toBe(409);
    expect(db.examAttempts.filter((a) => a.studentId === 'u1')).toHaveLength(1);
    expect((await ins.put(`/recoveries/${rec.id}/cancel`)).status).toBe(409);
  });
});
