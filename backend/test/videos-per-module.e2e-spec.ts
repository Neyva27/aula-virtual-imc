/**
 * RN-03 por módulo (19/11/2026), integración HTTP con la base simulada (sin MySQL):
 * - sin máximo de videos por curso ni por módulo (un curso puede tener más de 7 videos en varios módulos);
 * - para PUBLICAR, cada módulo necesita al menos 1 video publicado propio (21/11/2026; sin límite de duración);
 * - los cursos YA publicados conservan el acceso de sus estudiantes aunque un módulo no tenga videos publicados;
 * - en un curso publicado, un cambio no puede dejar el curso sin videos publicados;
 * - 21/11/2026: un video nuevo necesita fuente (sin «Sin archivo»); los existentes sin fuente se conservan.
 */
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDemo } from '../prisma/seed-data.js';
import { FakePrisma } from './support/fake-prisma.js';
import { createTestApp, DEMO_PASSWORD, type TestApp } from './support/test-app.js';

const API = '/api/v1';
const INSTRUCTOR = 'admin@ejemplo.test';
const ANA = 'ana@ejemplo.test';

describe('RN-03 por módulo (HTTP, base simulada)', () => {
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
  let n = 0;

  async function newCourse(ins: Client) {
    const res = await ins.post('/courses', { name: 'Curso por módulos', description: 'Prueba', trainingHours: 4, coverImage: null });
    expect(res.status).toBe(201);
    const id = res.body.id as string;
    const m1 = (await ins.get(`/courses/${id}/content`)).body.modules[0].id as string;
    const m2 = (await ins.post(`/courses/${id}/modules`, { title: 'Módulo práctico' })).body.modules[1].id as string;
    return { id, m1, m2 };
  }

  async function addVideos(ins: Client, courseId: string, moduleId: string, count: number, durationSec = 360, published = true) {
    for (let i = 0; i < count; i++) {
      n += 1;
      const res = await ins.post(`/courses/${courseId}/videos`, {
        title: `Video ${n}`,
        durationSec,
        published,
        url: `https://videos.ejemplo.test/v${n}.mp4`,
        sourceKind: 'url',
        moduleId,
      });
      expect(res.status, res.body.message).toBe(201);
    }
  }

  async function withExam(ins: Client, courseId: string) {
    const exam = (await ins.get(`/courses/${courseId}/exams/active`)).body;
    const q = await ins.post(`/exams/${exam.id}/questions`, {
      id: 'nueva-1',
      type: 'single',
      text: '¿Pregunta de prueba?',
      options: [
        { id: 'a', text: 'Sí' },
        { id: 'b', text: 'No' },
      ],
      correct: ['a'],
      points: 100,
    });
    expect(q.status, q.body.message).toBe(201);
  }

  const publish = (ins: Client, id: string) =>
    ins.put(`/courses/${id}`, { name: 'Curso por módulos', description: 'Prueba', trainingHours: 4, coverImage: null, status: 'publicado' });

  beforeEach(async () => {
    db = new FakePrisma();
    await seedDemo(db as never, DEMO_PASSWORD);
    db.registeredBy('a1', ['u1', 'u2']);
    tokens.clear();
    n = 0;
    t = await createTestApp(db);
  });
  afterEach(() => t.close());

  it('acepta más de 7 videos en un curso, repartidos entre módulos, sin límite por módulo', async () => {
    const ins = await as(INSTRUCTOR);
    const { id, m1, m2 } = await newCourse(ins);
    await addVideos(ins, id, m1, 9); // 9 en un solo módulo
    await addVideos(ins, id, m2, 6, 360, false); // y 6 más (borradores) en otro: 15 en total
    const content = (await ins.get(`/courses/${id}/content`)).body;
    expect(content.modules.map((m: { videos: unknown[] }) => m.videos.length)).toEqual([9, 6]);
    // Cada video conserva su módulo y su orden dentro de él.
    const [first, second] = content.modules as { id: string; videos: { moduleId: string; order: number }[] }[];
    expect(first.videos.every((v) => v.moduleId === m1)).toBe(true);
    expect(second.videos.map((v) => v.order)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(db.courseVideos.filter((v) => v.courseId === id)).toHaveLength(15);
  });

  it('21/11/2026: cada módulo se publica desde 1 video; se puede publicar con 1, 2, 3, 4 o 5 videos por módulo', async () => {
    const ins = await as(INSTRUCTOR);
    for (const count of [1, 2, 3, 4, 5]) {
      const { id, m1, m2 } = await newCourse(ins);
      await withExam(ins, id);
      await addVideos(ins, id, m1, count);
      await addVideos(ins, id, m2, count);
      expect((await ins.get(`/courses/${id}/publication-check`)).body.blocking, `${count} videos`).toEqual([]);
      const ok = await publish(ins, id);
      expect(ok.status, `${count} videos: ${ok.body.message}`).toBe(200);
    }
  });

  it('para publicar revisa módulo por módulo: un módulo sin videos publicados bloquea (los de otro módulo no cuentan)', async () => {
    const ins = await as(INSTRUCTOR);
    const { id, m1, m2 } = await newCourse(ins);
    await withExam(ins, id);
    await addVideos(ins, id, m1, 8);
    await addVideos(ins, id, m2, 2, 360, false); // solo borradores
    const check = (await ins.get(`/courses/${id}/publication-check`)).body;
    expect(check.canPublish).toBe(false);
    expect(check.blocking).toEqual(['Módulo 2 «Módulo práctico»: no tiene videos publicados; se requiere al menos 1 video publicado por módulo.']);
    const rejected = await publish(ins, id);
    expect(rejected.status).toBe(409);
    expect(rejected.body.message).toContain('Módulo 2 «Módulo práctico»: no tiene videos publicados');
    expect(rejected.body.message).not.toContain('Módulo 1');
    await addVideos(ins, id, m2, 1);
    const ok = await publish(ins, id);
    expect(ok.status, ok.body.message).toBe(200);
    expect(ok.body.status).toBe('publicado');
  });

  it('sin límite de duración (20/11/2026): videos de 15, 30, 45 y 60 minutos y de 2 horas se aceptan y se publican', async () => {
    const ins = await as(INSTRUCTOR);
    const { id, m1, m2 } = await newCourse(ins);
    await withExam(ins, id);
    for (const minutes of [15, 30, 45, 60, 120]) await addVideos(ins, id, m1, 1, minutes * 60);
    await addVideos(ins, id, m2, 4, 90); // y videos cortos de 1:30
    await addVideos(ins, id, m2, 1, 3 * 3600 + 25 * 60 + 9); // 3:25:09
    const content = (await ins.get(`/courses/${id}/content`)).body;
    expect(content.modules[0].videos.map((v: { durationSec: number }) => v.durationSec)).toEqual([900, 1800, 2700, 3600, 7200]);
    expect((await ins.get(`/courses/${id}/publication-check`)).body.blocking).toEqual([]);
    const ok = await publish(ins, id);
    expect(ok.status, ok.body.message).toBe(200);
    // En un curso publicado también se puede publicar un video largo, y solo se rechaza una duración no válida.
    await addVideos(ins, id, m1, 1, 5 * 3600);
    const zero = await ins.post(`/courses/${id}/videos`, { title: 'Cero', durationSec: 0, published: false, url: 'https://videos.ejemplo.test/0.mp4', sourceKind: 'url', moduleId: m1 });
    expect(zero.status).toBe(400);
    expect(zero.body.message).toBe('Ingresa la duración real del video en segundos (número entero mayor que 0).');
  });

  it('un curso ya publicado con un módulo sin videos publicados conserva el acceso de sus estudiantes', async () => {
    const ins = await as(INSTRUCTOR);
    const { id, m1, m2 } = await newCourse(ins);
    await withExam(ins, id);
    await addVideos(ins, id, m1, 3);
    await addVideos(ins, id, m2, 2, 360, false); // el módulo 2 solo tiene borradores
    // Datos existentes en MySQL: el curso ya estaba publicado.
    db.courses.find((c) => c.id === id)!.status = 'PUBLICADO';

    const check = (await ins.get(`/courses/${id}/publication-check`)).body;
    expect(check.blocking).toEqual([]);
    expect(check.warnings.filter((w: string) => w.startsWith('Para volver a publicarlo desde borrador'))).toHaveLength(1);
    expect((await ins.get(`/courses/${id}/content`)).body.ruleIssues).toEqual([]);
    // Editar sus datos (se envía status «publicado») sigue funcionando.
    expect((await publish(ins, id)).status).toBe(200);

    expect((await ins.post('/enrollments', { studentId: 'u1', courseId: id })).status).toBe(201);
    const ana = await as(ANA);
    const content = (await ana.get(`/me/courses/${id}/content`)).body;
    for (const m of content.modules) for (const v of m.videos) expect((await ana.post(`/me/courses/${id}/videos/${v.id}/complete`)).status).toBe(200);
    const started = await ana.post(`/me/courses/${id}/exam/start`);
    expect(started.status, started.body.message).toBe(200);
  });

  it('en un curso publicado se puede reorganizar en módulos; solo se exige al menos 1 video publicado en total', async () => {
    const ins = await as(INSTRUCTOR);
    const { id, m1, m2 } = await newCourse(ins);
    await withExam(ins, id);
    await addVideos(ins, id, m1, 1);
    await addVideos(ins, id, m2, 1);
    expect((await publish(ins, id)).status).toBe(200);
    const [m1Videos, m2Videos] = (await ins.get(`/courses/${id}/content`)).body.modules.map((m: { videos: { id: string }[] }) => m.videos) as {
      id: string;
    }[][];
    // Mover el video del módulo 2 al 1 no bloquea el curso publicado.
    expect((await ins.put(`/courses/${id}/videos/${m2Videos[0].id}/module`, { moduleId: m1 })).status).toBe(200);
    expect((await ins.get(`/courses/${id}/content`)).body.ruleIssues).toEqual([]);
    // Despublicar uno se permite; el último publicado, no.
    expect((await ins.put(`/courses/${id}/videos/${m1Videos[0].id}/published`, { published: false })).status).toBe(200);
    const blocked = await ins.put(`/courses/${id}/videos/${m2Videos[0].id}/published`, { published: false });
    expect(blocked.status).toBe(409);
    expect(blocked.body.message).toBe('El curso necesita al menos 1 video publicado.');
    expect(db.courseVideos.filter((v) => v.courseId === id)).toHaveLength(2);
  });

  it('21/11/2026: un video nuevo sin fuente se rechaza; YouTube, Google Drive y https siguen funcionando', async () => {
    const ins = await as(INSTRUCTOR);
    const { id, m1 } = await newCourse(ins);
    const post = (body: object) => ins.post(`/courses/${id}/videos`, { title: 'Video', durationSec: 600, published: false, moduleId: m1, ...body });
    const empty = await post({ url: '' });
    expect(empty.status).toBe(400);
    expect(empty.body.message).toBe('Ingresa el enlace del video: YouTube, Google Drive u otro enlace https.');
    expect((await post({})).status).toBe(400);
    expect((await post({ url: '', sourceKind: 'none' })).status).toBe(400); // la opción «Sin archivo» ya no existe
    expect((await post({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', sourceKind: 'youtube' })).status).toBe(201);
    expect((await post({ url: 'https://drive.google.com/file/d/1A2b3C4d5E6f7G8h9I0jKlMnOpQrStUvW/view', sourceKind: 'drive' })).status).toBe(201);
    expect((await post({ url: 'https://videos.ejemplo.test/clase.mp4', sourceKind: 'url' })).status).toBe(201);
    const kinds = db.courseVideos.filter((v) => v.courseId === id).map((v) => v.sourceKind);
    expect(kinds).toEqual(['YOUTUBE', 'DRIVE', 'URL']);
    // Un video que ya tenía fuente no se puede dejar sin ella.
    const yt = db.courseVideos.find((v) => v.courseId === id && v.sourceKind === 'YOUTUBE')!;
    expect((await post({ id: yt.id, url: '' })).status).toBe(400);
  });

  it('un video existente sin fuente (dato anterior) se conserva intacto y se puede editar sin agregarle enlace', async () => {
    const ins = await as(INSTRUCTOR);
    const { id, m1 } = await newCourse(ins);
    await db.courseVideo.create({ data: { id: 'legacy-v', courseId: id, moduleId: m1, position: 1, title: 'Anterior sin fuente', durationSec: 300, published: false, sourceKind: 'PLACEHOLDER', sourceRef: null } });
    const edited = await ins.post(`/courses/${id}/videos`, { id: 'legacy-v', title: 'Anterior (editado)', durationSec: 300, published: false, url: '', moduleId: m1 });
    expect(edited.status, edited.body.message).toBe(201);
    expect(db.courseVideos.find((v) => v.id === 'legacy-v')).toMatchObject({ title: 'Anterior (editado)', sourceKind: 'PLACEHOLDER', sourceRef: null });
  });
});
