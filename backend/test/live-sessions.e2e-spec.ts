/**
 * Sesiones en vivo con Google Meet (20/11/2026), integración HTTP con la base simulada (sin MySQL): el Instructor
 * programa, edita, cancela y reprograma sesiones en módulos de SUS cursos; el estudiante matriculado las ve (también
 * las canceladas) con el enlace de Meet; aislamiento entre Instructores y entre estudiantes.
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
const MEET = 'https://meet.google.com/abc-defg-hij';
const future = (days: number, hourUtc = 15) => {
  const d = new Date(Date.now() + days * 86_400_000);
  d.setUTCHours(hourUtc, 0, 0, 0);
  return d.toISOString();
};

describe('Sesiones en vivo con Google Meet (HTTP, base simulada)', () => {
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
      del: (path: string) => request(t.http).delete(`${API}${path}`).set('Authorization', `Bearer ${bearer}`),
    };
  };
  type Client = Awaited<ReturnType<typeof as>>;

  /** Curso con dos módulos; publicado si se pide (5 videos por módulo y examen de 100 puntos). */
  async function course(ins: Client, publish = true) {
    const created = await ins.post('/courses', { name: 'Curso con sesiones', description: 'Prueba', trainingHours: 2, coverImage: null });
    const id = created.body.id as string;
    const m1 = (await ins.get(`/courses/${id}/content`)).body.modules[0].id as string;
    const m2 = (await ins.post(`/courses/${id}/modules`, { title: 'Práctica en vivo' })).body.modules[1].id as string;
    if (publish) {
      let n = 0;
      for (const moduleId of [m1, m2]) {
        for (let i = 0; i < 5; i++) {
          n += 1;
          await ins.post(`/courses/${id}/videos`, {
            title: `Video ${n}`,
            durationSec: 1800,
            published: true,
            url: `https://videos.ejemplo.test/${n}.mp4`,
            sourceKind: 'url',
            moduleId,
          });
        }
      }
      const exam = (await ins.get(`/courses/${id}/exams/active`)).body;
      await ins.post(`/exams/${exam.id}/questions`, {
        id: 'nueva-1',
        type: 'single',
        text: '¿Pregunta?',
        options: [
          { id: 'a', text: 'Sí' },
          { id: 'b', text: 'No' },
        ],
        correct: ['a'],
        points: 100,
      });
      const pub = await ins.put(`/courses/${id}`, { name: 'Curso con sesiones', description: 'Prueba', trainingHours: 2, coverImage: null, status: 'publicado' });
      expect(pub.status, pub.body.message).toBe(200);
    }
    return { id, m1, m2 };
  }

  const session = (moduleId: string, over: object = {}) => ({
    moduleId,
    title: 'Resolución de casos en vivo',
    description: 'Traer las preguntas del módulo.',
    startsAt: future(3),
    meetUrl: MEET,
    ...over,
  });

  beforeEach(async () => {
    db = new FakePrisma();
    await seedDemo(db as never, DEMO_PASSWORD);
    const passwordHash = db.userByEmail(ANA).passwordHash;
    await db.user.create({ data: { id: 'i2', email: 'i2@prueba.test', role: 'INSTRUCTOR', firstNames: 'Otro', lastNames: 'Instructor', passwordHash } });
    await db.instructor.create({ data: { userId: 'i2' } });
    db.registeredBy('a1', ['u1', 'u2']);
    tokens.clear();
    t = await createTestApp(db);
  });
  afterEach(() => t.close());

  it('el Instructor programa una sesión en un módulo y la consulta; solo se guarda el enlace de Meet', async () => {
    const ins = await as(INSTRUCTOR);
    const { id, m2 } = await course(ins, false);
    const created = await ins.post(`/courses/${id}/live-sessions`, session(m2, { meetUrl: '  https://meet.google.com/ABC-DEFG-HIJ?authuser=0 ' }));
    expect(created.status, created.body.message).toBe(201);
    expect(created.body).toEqual([
      {
        id: expect.any(String),
        courseId: id,
        moduleId: m2,
        moduleTitle: 'Práctica en vivo',
        moduleOrder: 2,
        title: 'Resolución de casos en vivo',
        description: 'Traer las preguntas del módulo.',
        startsAt: future(3),
        meetUrl: 'https://meet.google.com/abc-defg-hij?authuser=0',
        status: 'programada',
      },
    ]);
    expect(db.liveSessions[0]).toMatchObject({ createdById: 'a1', status: 'PROGRAMADA' });
    // Se listan por fecha de inicio.
    await ins.post(`/courses/${id}/live-sessions`, session(m2, { title: 'Primera', startsAt: future(1) }));
    expect((await ins.get(`/courses/${id}/live-sessions`)).body.map((s: { title: string }) => s.title)).toEqual(['Primera', 'Resolución de casos en vivo']);
  });

  it('valida: solo enlaces https de Google Meet, fecha futura válida, título y módulo del curso', async () => {
    const ins = await as(INSTRUCTOR);
    const { id, m1 } = await course(ins, false);
    const other = await course(ins, false);
    const meetError = 'El enlace debe ser de Google Meet, con el formato https://meet.google.com/abc-defg-hij.';
    for (const meetUrl of [
      'http://meet.google.com/abc-defg-hij',
      'https://zoom.us/j/123456789',
      'https://meet.google.com.evil.test/abc-defg-hij',
      'https://meet.google.com/abcdefghij',
      'https://meet.google.com/abc-defg-hij/../x',
      'javascript:alert(1)',
      '',
    ]) {
      const res = await ins.post(`/courses/${id}/live-sessions`, session(m1, { meetUrl }));
      expect(res.status, meetUrl).toBe(400);
      expect(res.body.message).toBe(meetError);
    }
    expect((await ins.post(`/courses/${id}/live-sessions`, session(m1, { startsAt: 'mañana' }))).body.message).toBe('Ingresa una fecha y hora de inicio válidas.');
    expect((await ins.post(`/courses/${id}/live-sessions`, session(m1, { startsAt: future(-2) }))).body.message).toBe(
      'La fecha y hora de inicio ya pasaron. Elige una fecha futura.',
    );
    expect((await ins.post(`/courses/${id}/live-sessions`, session(m1, { title: '  ' }))).body.message).toBe('Ingresa el título de la sesión en vivo.');
    expect((await ins.post(`/courses/${id}/live-sessions`, session(other.m1))).status).toBe(404); // módulo de otro curso
    expect(db.liveSessions).toHaveLength(0);
  });

  it('edita, cancela (sin borrar) y vuelve a programar', async () => {
    const ins = await as(INSTRUCTOR);
    const { id, m1, m2 } = await course(ins, false);
    const [s] = (await ins.post(`/courses/${id}/live-sessions`, session(m1))).body;
    const edited = await ins.put(`/courses/${id}/live-sessions/${s.id}`, session(m2, { title: 'Sesión editada', startsAt: future(5), meetUrl: 'https://meet.google.com/xyz-abcd-efg' }));
    expect(edited.status, edited.body.message).toBe(200);
    expect(edited.body[0]).toMatchObject({ title: 'Sesión editada', moduleId: m2, startsAt: future(5), meetUrl: 'https://meet.google.com/xyz-abcd-efg' });
    const cancelled = await ins.put(`/courses/${id}/live-sessions/${s.id}/status`, { status: 'cancelada' });
    expect(cancelled.body[0].status).toBe('cancelada');
    expect(db.liveSessions).toHaveLength(1);
    expect((await ins.put(`/courses/${id}/live-sessions/${s.id}/status`, { status: 'programada' })).body[0].status).toBe('programada');
    expect((await ins.put(`/courses/${id}/live-sessions/${s.id}/status`, { status: 'borrada' })).status).toBe(400);
    expect((await ins.put(`/courses/${id}/live-sessions/no-existe`, session(m1))).status).toBe(404);
  });

  it('aislamiento: otro Instructor no ve ni modifica las sesiones (404); un estudiante no usa las rutas del Instructor (403)', async () => {
    const ins = await as(INSTRUCTOR);
    const { id, m1 } = await course(ins, false);
    const [s] = (await ins.post(`/courses/${id}/live-sessions`, session(m1))).body;
    const other = await as('i2@prueba.test');
    expect((await other.get(`/courses/${id}/live-sessions`)).status).toBe(404);
    expect((await other.post(`/courses/${id}/live-sessions`, session(m1))).status).toBe(404);
    expect((await other.put(`/courses/${id}/live-sessions/${s.id}`, session(m1, { title: 'Ajena' }))).status).toBe(404);
    expect((await other.put(`/courses/${id}/live-sessions/${s.id}/status`, { status: 'cancelada' })).status).toBe(404);
    // Una sesión de otro curso no se edita desde un curso propio.
    const own = await course(other, false);
    expect((await other.put(`/courses/${own.id}/live-sessions/${s.id}/status`, { status: 'cancelada' })).status).toBe(404);
    expect((await (await as(ANA)).get(`/courses/${id}/live-sessions`)).status).toBe(403);
    expect(db.liveSessions[0]).toMatchObject({ title: 'Resolución de casos en vivo', status: 'PROGRAMADA' });
  });

  it('el estudiante matriculado ve las sesiones (también canceladas) con el enlace directo de Meet; otros no', async () => {
    const ins = await as(INSTRUCTOR);
    const { id, m1, m2 } = await course(ins);
    await ins.post(`/courses/${id}/live-sessions`, session(m1, { title: 'Bienvenida', startsAt: future(1) }));
    const [, second] = (await ins.post(`/courses/${id}/live-sessions`, session(m2, { title: 'Taller', startsAt: future(2), meetUrl: 'https://meet.google.com/qwe-rtyu-iop' }))).body;
    await ins.put(`/courses/${id}/live-sessions/${second.id}/status`, { status: 'cancelada' });
    expect((await ins.post('/enrollments', { studentId: 'u1', courseId: id })).status).toBe(201);

    const ana = await as(ANA);
    const res = await ana.get(`/me/courses/${id}/live-sessions`);
    expect(res.status).toBe(200);
    expect(res.body.map((s: { title: string; status: string; meetUrl: string; moduleTitle: string }) => [s.title, s.status, s.meetUrl, s.moduleTitle])).toEqual([
      ['Bienvenida', 'programada', MEET, 'Contenido del curso'],
      ['Taller', 'cancelada', 'https://meet.google.com/qwe-rtyu-iop', 'Práctica en vivo'],
    ]);
    // Luis no está matriculado; ningún estudiante ve cursos ajenos.
    expect((await (await as(LUIS)).get(`/me/courses/${id}/live-sessions`)).status).toBe(404);
    expect((await ana.get('/me/courses/no-existe/live-sessions')).status).toBe(404);
  });

  it('un curso en borrador no muestra sus sesiones al estudiante', async () => {
    const ins = await as(INSTRUCTOR);
    const { id, m1 } = await course(ins, false);
    await ins.post(`/courses/${id}/live-sessions`, session(m1));
    await ins.post('/enrollments', { studentId: 'u1', courseId: id });
    const res = await (await as(ANA)).get(`/me/courses/${id}/live-sessions`);
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Este curso aún no está disponible.');
  });

  it('módulo opcional: una clase sin módulo es de todo el curso; al eliminar un módulo sus clases se mueven o quedan sin módulo', async () => {
    const ins = await as(INSTRUCTOR);
    const { id, m1, m2 } = await course(ins, false);
    const general = await ins.post(`/courses/${id}/live-sessions`, session(null as never, { moduleId: null, title: 'Clase general' }));
    expect(general.status, general.body.message).toBe(201);
    expect(general.body[0]).toMatchObject({ moduleId: null, moduleTitle: '', moduleOrder: 0 });
    await ins.post(`/courses/${id}/live-sessions`, session(m2, { title: 'Del módulo 2', startsAt: future(4) }));
    // Sin destino (el módulo no tiene videos): la clase queda sin módulo, nunca se borra.
    expect((await ins.del(`/courses/${id}/modules/${m2}`)).status).toBe(200);
    expect(db.liveSessions).toHaveLength(2);
    expect(db.liveSessions.find((s) => s.title === 'Del módulo 2')!.moduleId).toBeNull();
    // Con destino, pasa al módulo elegido.
    const m3 = (await ins.post(`/courses/${id}/modules`, { title: 'Tercero' })).body.modules[1].id as string;
    const [, , moved] = (await ins.post(`/courses/${id}/live-sessions`, session(m3, { title: 'Del tercero', startsAt: future(6) }))).body;
    expect(moved.moduleId).toBe(m3);
    expect((await ins.del(`/courses/${id}/modules/${m3}?targetModuleId=${m1}`)).status).toBe(200);
    expect(db.liveSessions.find((s) => s.title === 'Del tercero')!.moduleId).toBe(m1);
  });

  it('grabación: se agrega cuando la clase ya se realizó, solo https; el estudiante la ve; sin grabación no hay enlace', async () => {
    const ins = await as(INSTRUCTOR);
    const { id, m1 } = await course(ins);
    const [s] = (await ins.post(`/courses/${id}/live-sessions`, session(m1))).body;
    expect(s.recordingUrl).toBeUndefined();
    const early = await ins.put(`/courses/${id}/live-sessions/${s.id}/recording`, { recordingUrl: 'https://drive.google.com/file/d/1A2b3C4d5E6f7G8h9I0jKlMnOpQrStUvW/view' });
    expect(early.status).toBe(400);
    expect(early.body.message).toBe('La grabación se agrega cuando la clase ya se realizó.');
    db.liveSessions[0].startsAt = new Date(Date.now() - 2 * 3_600_000); // la clase ya pasó
    for (const bad of ['http://inseguro.test/v.mp4', 'javascript:alert(1)', 'grabacion']) {
      expect((await ins.put(`/courses/${id}/live-sessions/${s.id}/recording`, { recordingUrl: bad })).body.message).toBe(
        'El enlace de la grabación debe ser https (Google Drive, YouTube u otra fuente compatible).',
      );
    }
    const ok = await ins.put(`/courses/${id}/live-sessions/${s.id}/recording`, { recordingUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
    expect(ok.status, ok.body.message).toBe(200);
    expect(ok.body[0].recordingUrl).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    await ins.post('/enrollments', { studentId: 'u1', courseId: id });
    const seen = (await (await as(ANA)).get(`/me/courses/${id}/live-sessions`)).body[0];
    expect(seen.recordingUrl).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    // Quitarla: el estudiante deja de ver el enlace.
    await ins.put(`/courses/${id}/live-sessions/${s.id}/recording`, { recordingUrl: null });
    const after = (await (await as(ANA)).get(`/me/courses/${id}/live-sessions`)).body[0];
    expect('recordingUrl' in after).toBe(false);
    // Otro Instructor no puede agregarla; una clase cancelada tampoco la admite.
    expect((await (await as('i2@prueba.test')).put(`/courses/${id}/live-sessions/${s.id}/recording`, { recordingUrl: 'https://drive.google.com/file/d/1A2b3C4d5E6f7G8h9I0jKlMnOpQrStUvW/view' })).status).toBe(404);
    await ins.put(`/courses/${id}/live-sessions/${s.id}/status`, { status: 'cancelada' });
    expect((await ins.put(`/courses/${id}/live-sessions/${s.id}/recording`, { recordingUrl: 'https://drive.google.com/file/d/1A2b3C4d5E6f7G8h9I0jKlMnOpQrStUvW/view' })).status).toBe(400);
  });
});
