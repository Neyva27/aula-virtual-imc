/**
 * Portadas de curso (19/11/2026), integración HTTP con la aplicación completa y la base simulada (sin MySQL):
 * subida protegida (JPG, PNG o WebP; máximo 2 MB; firma binaria), entrega pública, reemplazo y borrado seguro del
 * archivo anterior, y rechazo de rutas maliciosas. Cada prueba usa su propia carpeta temporal (UPLOADS_DIR).
 */
import { existsSync, readdirSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDemo } from '../prisma/seed-data.js';
import { FakePrisma } from './support/fake-prisma.js';
import { createTestApp, DEMO_PASSWORD, type TestApp } from './support/test-app.js';

const API = '/api/v1';
const INSTRUCTOR = 'admin@ejemplo.test';
const ANA = 'ana@ejemplo.test';
const PREFIX = '/api/v1/public/course-covers/';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]), Buffer.from('JFIF\0datos de prueba'), Buffer.from([0xff, 0xd9])]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x1a, 0, 0, 0]), Buffer.from('WEBPVP8 '), Buffer.alloc(14, 1)]);

describe('Portadas de curso (HTTP, base simulada)', () => {
  let db: FakePrisma;
  let t: TestApp;
  let uploads: string;
  const tokens = new Map<string, string>();
  const token = async (email: string) => {
    if (!tokens.has(email)) {
      const res = await request(t.http).post(`${API}/auth/login`).send({ email, password: DEMO_PASSWORD });
      tokens.set(email, res.body.accessToken as string);
    }
    return tokens.get(email)!;
  };
  const coversDir = () => join(uploads, 'course-covers');
  const files = () => (existsSync(coversDir()) ? readdirSync(coversDir()) : []);
  const fileOf = (url: string) => url.slice(PREFIX.length);

  async function upload(courseId: string, data: Buffer, contentType: string, email = INSTRUCTOR, filename = 'portada.png') {
    const bearer = await token(email);
    return request(t.http)
      .put(`${API}/courses/${courseId}/cover`)
      .set('Authorization', `Bearer ${bearer}`)
      .attach('file', data, { filename, contentType });
  }

  async function createCourse(email = INSTRUCTOR, coverImage: string | null = null) {
    const bearer = await token(email);
    return request(t.http)
      .post(`${API}/courses`)
      .set('Authorization', `Bearer ${bearer}`)
      .send({ name: 'Curso con portada', description: 'Descripción', trainingHours: null, coverImage });
  }

  async function editCourse(id: string, coverImage: string | null) {
    const bearer = await token(INSTRUCTOR);
    return request(t.http)
      .put(`${API}/courses/${id}`)
      .set('Authorization', `Bearer ${bearer}`)
      .send({ name: 'Curso con portada', description: 'Descripción', trainingHours: null, coverImage, status: 'borrador' });
  }

  beforeEach(async () => {
    db = new FakePrisma();
    await seedDemo(db as never, DEMO_PASSWORD);
    const passwordHash = db.userByEmail(ANA).passwordHash;
    await db.user.create({ data: { id: 'i2', email: 'i2@prueba.test', role: 'INSTRUCTOR', firstNames: 'Otro', lastNames: 'Instructor', passwordHash } });
    await db.instructor.create({ data: { userId: 'i2' } });
    tokens.clear();
    uploads = await mkdtemp(join(tmpdir(), 'aula-imc-portadas-'));
    t = await createTestApp(db, { UPLOADS_DIR: uploads });
  });
  afterEach(async () => {
    await t.close();
    await rm(uploads, { recursive: true, force: true });
  });

  it('sube una imagen PNG: se guarda en disco con nombre UUID, en la base solo la ruta, y se sirve públicamente', async () => {
    const id = (await createCourse()).body.id as string;
    const res = await upload(id, PNG, 'image/png', INSTRUCTOR, 'mi foto (1).png');
    expect(res.status, res.body.message).toBe(200);
    const url = res.body.coverImage as string;
    expect(url).toMatch(/^\/api\/v1\/public\/course-covers\/[0-9a-f-]{36}\.png$/);
    expect(url).not.toContain('mi foto');
    expect(db.courses.find((c) => c.id === id)!.coverImage).toBe(url);
    expect(files()).toEqual([fileOf(url)]);

    // Sin sesión: la etiqueta <img> no envía el token.
    const img = await request(t.http).get(url);
    expect(img.status).toBe(200);
    expect(img.headers['content-type']).toBe('image/png');
    expect(img.headers['x-content-type-options']).toBe('nosniff');
    expect(img.headers['cross-origin-resource-policy']).toBe('cross-origin');
    expect(img.headers['cache-control']).toContain('immutable');
    expect(Buffer.compare(img.body as Buffer, PNG)).toBe(0);

    // Persistencia: la lista de cursos devuelve la misma ruta (lo que ve Angular al recargar).
    const bearer = await token(INSTRUCTOR);
    const list = await request(t.http).get(`${API}/courses`).set('Authorization', `Bearer ${bearer}`);
    expect(list.body.find((c: { id: string }) => c.id === id).coverImage).toBe(url);
  });

  it('acepta JPG y WebP con su tipo correcto', async () => {
    const id = (await createCourse()).body.id as string;
    const jpg = await upload(id, JPG, 'image/jpeg', INSTRUCTOR, 'foto.jpeg');
    expect(jpg.status, jpg.body.message).toBe(200);
    expect(jpg.body.coverImage).toMatch(/\.jpg$/);
    expect((await request(t.http).get(jpg.body.coverImage)).headers['content-type']).toBe('image/jpeg');
    const webp = await upload(id, WEBP, 'image/webp', INSTRUCTOR, 'foto.webp');
    expect(webp.status, webp.body.message).toBe(200);
    expect(webp.body.coverImage).toMatch(/\.webp$/);
    expect((await request(t.http).get(webp.body.coverImage)).headers['content-type']).toBe('image/webp');
  });

  it('rechaza archivos falsos, ejecutables, tipos que no coinciden con la firma y envíos sin archivo', async () => {
    const id = (await createCourse()).body.id as string;
    const cases: [Buffer, string, string][] = [
      [Buffer.from('esto no es una imagen'), 'image/png', 'falsa.png'],
      [Buffer.from('MZ\x90\0ejecutable'), 'image/jpeg', 'virus.jpg'],
      [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), 'image/svg+xml', 'x.svg'],
      [PNG, 'image/jpeg', 'png-disfrazado.jpg'], // firma PNG declarada como JPEG
      [Buffer.from('GIF89a......'), 'image/gif', 'animada.gif'],
    ];
    for (const [data, type, name] of cases) {
      const res = await upload(id, data, type, INSTRUCTOR, name);
      expect(res.status, name).toBe(400);
      expect(res.body.message).toBe('El archivo no es una imagen válida. Usa una imagen JPG, PNG o WebP.');
    }
    const bearer = await token(INSTRUCTOR);
    const empty = await request(t.http).put(`${API}/courses/${id}/cover`).set('Authorization', `Bearer ${bearer}`).send({});
    expect(empty.status).toBe(400);
    expect(empty.body.message).toBe('Selecciona una imagen JPG, PNG o WebP (campo «file»).');
    const otherField = await request(t.http)
      .put(`${API}/courses/${id}/cover`)
      .set('Authorization', `Bearer ${bearer}`)
      .attach('imagen', PNG, { filename: 'p.png', contentType: 'image/png' });
    expect(otherField.status).toBe(400);
    expect(otherField.body.message).toBe('Selecciona una imagen JPG, PNG o WebP (campo «file»).');
    expect(files()).toEqual([]);
    expect(db.courses.find((c) => c.id === id)!.coverImage).toBeNull();
  });

  it('rechaza imágenes de más de 2 MB con un mensaje en español', async () => {
    const id = (await createCourse()).body.id as string;
    const big = Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024)]);
    const res = await upload(id, big, 'image/png');
    expect(res.status).toBe(413);
    expect(res.body.message).toBe('La imagen supera el tamaño máximo de 2 MB.');
    expect(files()).toEqual([]);
    // Exactamente 2 MB sí se acepta.
    const limit = Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024 - PNG.length)]);
    expect((await upload(id, limit, 'image/png')).status).toBe(200);
  });

  it('protege la subida: sin sesión 401, estudiante 403 y otro instructor 404 (sin cambios)', async () => {
    const id = (await createCourse()).body.id as string;
    const anon = await request(t.http).put(`${API}/courses/${id}/cover`).attach('file', PNG, { filename: 'p.png', contentType: 'image/png' });
    expect(anon.status).toBe(401);
    expect((await upload(id, PNG, 'image/png', ANA)).status).toBe(403);
    const other = await upload(id, PNG, 'image/png', 'i2@prueba.test');
    expect(other.status).toBe(404);
    expect((await upload('no-existe', PNG, 'image/png')).status).toBe(404);
    expect(files()).toEqual([]);
    expect(db.courses.find((c) => c.id === id)!.coverImage).toBeNull();
  });

  it('reemplaza la portada y borra el archivo anterior solo después de guardar', async () => {
    const id = (await createCourse()).body.id as string;
    const first = (await upload(id, PNG, 'image/png')).body.coverImage as string;
    const second = (await upload(id, JPG, 'image/jpeg')).body.coverImage as string;
    expect(second).not.toBe(first);
    expect(files()).toEqual([fileOf(second)]);
    expect((await request(t.http).get(first)).status).toBe(404);

    // Guardar el curso sin cambiar la portada la conserva (publicar y editar envían la ruta actual).
    const same = await editCourse(id, second);
    expect(same.status, same.body.message).toBe(200);
    expect(files()).toEqual([fileOf(second)]);

    // Una edición rechazada no borra nada.
    const bad = await editCourse(id, 'https://' + 'x'.repeat(500));
    expect(bad.status).toBe(400);
    expect(bad.body.message).toEqual(['La dirección de la portada no puede superar los 500 caracteres.']);
    expect(files()).toEqual([fileOf(second)]);

    // Cambiar a una portada de demostración borra la imagen subida.
    const demo = await editCourse(id, 'demo/covers/marketing-digital.svg');
    expect(demo.status).toBe(200);
    expect(demo.body.coverImage).toBe('demo/covers/marketing-digital.svg');
    expect(files()).toEqual([]);
  });

  it('quitar la portada o usar una dirección https borra la imagen subida; no se puede apuntar a la de otro curso', async () => {
    const a = (await createCourse()).body.id as string;
    const b = (await createCourse()).body.id as string;
    const coverA = (await upload(a, PNG, 'image/png')).body.coverImage as string;
    const coverB = (await upload(b, PNG, 'image/png')).body.coverImage as string;

    // El curso B no puede tomar la imagen del curso A (ni crearse con ella).
    const steal = await editCourse(b, coverA);
    expect(steal.status).toBe(400);
    expect(steal.body.message).toContain('no corresponde a este curso');
    expect((await createCourse(INSTRUCTOR, coverA)).status).toBe(400);
    expect(files().sort()).toEqual([fileOf(coverA), fileOf(coverB)].sort());

    expect((await editCourse(a, null)).body.coverImage).toBeNull();
    expect((await editCourse(b, 'https://imagenes.ejemplo.test/portada.webp')).body.coverImage).toBe('https://imagenes.ejemplo.test/portada.webp');
    expect(files()).toEqual([]);
  });

  it('no sirve rutas maliciosas ni nombres no administrados y no revela rutas del servidor', async () => {
    const id = (await createCourse()).body.id as string;
    const url = (await upload(id, PNG, 'image/png')).body.coverImage as string;
    const name = fileOf(url);
    const bad = [
      '..%2F..%2Fpackage.json',
      '..%5C..%5Cpackage.json',
      '%2e%2e%2f.env',
      name.toUpperCase(),
      name.replace('.png', '.svg'),
      `${name}.exe`,
      `x${name}`,
      '00000000-0000-4000-8000-000000000000.png', // formato válido, no existe
    ];
    for (const path of bad) {
      const res = await request(t.http).get(`${PREFIX}${path}`);
      expect(res.status, path).toBe(404);
      expect(JSON.stringify(res.body)).not.toContain(uploads);
      expect(res.body.message).toBe('No se encontró la imagen.');
    }
    expect((await request(t.http).get(`${PREFIX}../../auth/me`)).status).not.toBe(200);
    // Una ruta relativa disfrazada en el curso tampoco se acepta.
    expect((await editCourse(id, `${PREFIX}../../../package.json`)).status).toBe(400);
  });
});
