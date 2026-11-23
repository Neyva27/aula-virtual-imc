import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { firstValueFrom } from 'rxjs';
import { AdminVideos } from './admin-videos';
import { DataRepository } from '../../core/services/data-repository';
import { MockDataRepository } from '../../core/services/mock-data-repository';

/** E5.3: videos por curso con el repositorio simulado real y el router real (?curso=). Datos ficticios. */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Ctx {
  harness: RouterTestingHarness;
  el: HTMLElement;
  repo: DataRepository;
}

async function until(harness: RouterTestingHarness, cond: () => boolean, timeout = 8000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    await harness.fixture.whenStable();
    if (cond()) return;
    await sleep(50);
  }
  throw new Error('La condición no se cumplió a tiempo');
}

const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const rows = (el: HTMLElement) => [...el.querySelectorAll<HTMLTableRowElement>('tbody tr')];
const rowIds = (el: HTMLElement) => rows(el).map((r) => r.getAttribute('data-video'));
const row = (el: HTMLElement, id: string) => el.querySelector<HTMLTableRowElement>(`tr[data-video="${id}"]`)!;
const button = (scope: Element, label: string) =>
  [...scope.querySelectorAll<HTMLButtonElement>('button')].find((b) => text(b) === label || b.getAttribute('aria-label') === label)!;

async function setup(url = '/admin/videos'): Promise<Ctx> {
  localStorage.clear();
  sessionStorage.clear();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: 'admin/videos', component: AdminVideos }], withComponentInputBinding()),
      { provide: DataRepository, useClass: MockDataRepository },
    ],
  });
  const repo = TestBed.inject(DataRepository);
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url, AdminVideos);
  const el = harness.routeNativeElement as HTMLElement;
  await until(harness, () => rows(el).length > 0 || text(el).includes('aún no tiene videos'));
  return { harness, el, repo };
}

async function selectCourse(ctx: Ctx, courseId: string, firstVideo: string | null): Promise<void> {
  const select = ctx.el.querySelector<HTMLSelectElement>('#admin-course-select')!;
  select.value = courseId;
  select.dispatchEvent(new Event('change'));
  await until(ctx.harness, () => (firstVideo ? rowIds(ctx.el)[0] === firstVideo : text(ctx.el).includes('aún no tiene videos')));
}

function type(el: HTMLElement, selector: string, value: string): void {
  const input = el.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!;
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('blur'));
}

function setPublished(el: HTMLElement, value: boolean): void {
  const box = el.querySelector<HTMLInputElement>('form input[type=checkbox]')!;
  if (box.checked !== value) box.click();
}

async function fillAndSave(ctx: Ctx, data: { title?: string; duration?: string; url?: string; published?: boolean }): Promise<void> {
  if (data.title !== undefined) type(ctx.el, '#v-title', data.title);
  if (data.duration !== undefined) type(ctx.el, '#v-dur', data.duration);
  if (data.url !== undefined) type(ctx.el, '#v-url', data.url);
  if (data.published !== undefined) setPublished(ctx.el, data.published);
  await ctx.harness.fixture.whenStable();
  button(ctx.el, 'Guardar').click();
  await until(ctx.harness, () => !ctx.el.querySelector('form') || !!ctx.el.querySelector('.alert-danger') || !!ctx.el.querySelector('.error-text'));
}

async function openNew(ctx: Ctx): Promise<void> {
  button(ctx.el, 'Agregar video').click();
  await until(ctx.harness, () => text(ctx.el.querySelector('#video-form-title')) === 'Nuevo video');
}

async function openEdit(ctx: Ctx, videoId: string): Promise<void> {
  button(row(ctx.el, videoId), 'Editar').click();
  await until(ctx.harness, () => text(ctx.el.querySelector('#video-form-title')) === 'Editar video');
}

/** Estado de todos los cursos menos el indicado, para comprobar el aislamiento. */
async function othersSnapshot(repo: DataRepository, except: string) {
  const courses = await firstValueFrom(repo.getCourses());
  const out: Record<string, unknown> = {};
  for (const c of courses.filter((x) => x.id !== except)) out[c.id] = await firstValueFrom(repo.getCourseContent(c.id));
  out['enrollments'] = await firstValueFrom(repo.listEnrollments());
  out['attempts'] = await firstValueFrom(repo.listAttempts());
  out['certificates'] = await firstValueFrom(repo.listCertificates());
  return out;
}

describe('AdminVideos (E5.3)', () => {
  it('muestra el selector con nombre y estado, y por defecto los videos de c1', async () => {
    const { el } = await setup();
    const options = [...el.querySelectorAll('#admin-course-select option')].map(text);
    expect(options).toEqual([
      'Curso de demostración (nombre provisional) · Publicado',
      'Introducción a la Inteligencia Artificial · Borrador',
      'Fundamentos del Marketing Digital · Borrador',
    ]);
    expect(rowIds(el)).toEqual(['v1', 'v2', 'v3', 'v4', 'v5', 'v6']);
    expect(text(row(el, 'v1'))).toContain('6:00');
    expect(text(row(el, 'v1'))).toContain('Sin fuente'); // video de demostración anterior, sin fuente: se conserva
    expect(text(el)).toContain('Este curso está publicado');
  }, 20_000);

  it('cambia de curso y carga solo sus videos (también desde ?curso=)', async () => {
    const ctx = await setup();
    await selectCourse(ctx, 'c-ia', 'c-ia-v1');
    expect(rowIds(ctx.el)).toEqual(['c-ia-v1']);
    expect(text(row(ctx.el, 'c-ia-v1'))).toContain('YouTube');
    expect(text(row(ctx.el, 'c-ia-v1'))).toContain('8:33');
    expect(TestBed.inject(Router).url).toBe('/admin/videos?curso=c-ia'); // la selección queda en la URL
    await selectCourse(ctx, 'c-mkt', 'c-mkt-v1');
    expect(rowIds(ctx.el)).toEqual(['c-mkt-v1']);
    // Marketing conserva su duración real; sin límite de duración (20/11/2026) ya no se marca.
    expect(text(row(ctx.el, 'c-mkt-v1'))).toContain('10:03');
    expect(text(row(ctx.el, 'c-mkt-v1'))).not.toContain('Fuera de RN-03');
  }, 30_000);

  it('abre el curso indicado en ?curso=', async () => {
    const { el } = await setup('/admin/videos?curso=c-ia');
    expect(rowIds(el)).toEqual(['c-ia-v1']);
    expect(el.querySelector<HTMLSelectElement>('#admin-course-select')!.value).toBe('c-ia');
  }, 20_000);

  it('con un ?curso= inexistente avisa y muestra el curso principal', async () => {
    const { el } = await setup('/admin/videos?curso=no-existe');
    expect(rowIds(el)[0]).toBe('v1');
    expect(text(el)).toContain('No se encontró el curso indicado');
  }, 20_000);

  it('agregar, editar, ordenar, publicar y eliminar en un curso no afecta a los demás', async () => {
    const ctx = await setup('/admin/videos?curso=c-ia');
    const before = await othersSnapshot(ctx.repo, 'c-ia');

    await openNew(ctx);
    await fillAndSave(ctx, { title: 'Video agregado en la prueba', duration: '6:30', url: 'https://youtu.be/_tA5cinv0U8' });
    await until(ctx.harness, () => rows(ctx.el).length === 2);
    const added = rowIds(ctx.el)[1]!;
    expect(text(row(ctx.el, added))).toContain('6:30');

    await openEdit(ctx, added);
    await fillAndSave(ctx, { title: 'Video editado en la prueba' });
    await until(ctx.harness, () => text(row(ctx.el, added)).includes('Video editado en la prueba'));

    button(row(ctx.el, added), 'Subir Video editado en la prueba').click();
    await until(ctx.harness, () => rowIds(ctx.el)[0] === added);

    button(row(ctx.el, added), 'Despublicar').click();
    await until(ctx.harness, () => text(row(ctx.el, added)).includes('No publicado'));

    button(row(ctx.el, added), 'Eliminar Video editado en la prueba').click();
    await ctx.harness.fixture.whenStable();
    button(row(ctx.el, added), 'Confirmar').click();
    await until(ctx.harness, () => rows(ctx.el).length === 1);

    expect(await othersSnapshot(ctx.repo, 'c-ia')).toEqual(before);
    const ia = await firstValueFrom(ctx.repo.getCourseContent('c-ia'));
    expect(ia.modules[0].videos.map((v) => [v.id, v.order])).toEqual([['c-ia-v1', 1]]);
  }, 40_000);

  it('valida la duración mm:ss: rechaza formatos inválidos sin guardar', async () => {
    const ctx = await setup('/admin/videos?curso=c-ia');
    await openNew(ctx);
    for (const bad of ['0:00', '5:60', 'abc', '-1:00', '5']) {
      await fillAndSave(ctx, { title: 'Prueba', duration: bad });
      expect(text(ctx.el)).toContain('Ingresa una duración válida mayor que 0');
    }
    expect((await firstValueFrom(ctx.repo.getCourseContent('c-ia'))).modules[0].videos.length).toBe(1);
  }, 30_000);

  it('sin límite de duración (20/11/2026): en c1 (publicado) acepta videos de 15, 30, 45 y 60 minutos y de 2 horas', async () => {
    const ctx = await setup();
    const cases: [string, string][] = [
      ['15:00', '15:00'],
      ['30:00', '30:00'],
      ['45:00', '45:00'],
      ['60:00', '1:00:00'],
      ['2:05:09', '2:05:09'],
    ];
    for (const [i, [typed, shown]] of cases.entries()) {
      await openNew(ctx);
      await fillAndSave(ctx, { title: `Duración ${typed}`, duration: typed, published: true, url: 'https://videos.ejemplo.test/clase.mp4' });
      await until(ctx.harness, () => rows(ctx.el).length === 7 + i);
      const id = rowIds(ctx.el)[6 + i]!;
      expect(text(row(ctx.el, id))).toContain(shown);
      expect(text(row(ctx.el, id))).not.toContain('Fuera de RN-03');
    }
    const videos = (await firstValueFrom(ctx.repo.getCourseContent('c1'))).modules[0].videos;
    expect(videos.slice(6).map((v) => [v.durationSec, v.published])).toEqual([
      [900, true],
      [1800, true],
      [2700, true],
      [3600, true],
      [7509, true],
    ]);
    // Solo se rechaza una duración no válida.
    await openNew(ctx);
    await fillAndSave(ctx, { title: 'Sin duración', duration: '0:00', published: true, url: 'https://videos.ejemplo.test/clase.mp4' });
    expect(text(ctx.el)).toContain('Ingresa una duración válida mayor que 0');
  }, 60_000);

  it('en un curso publicado sigue protegido el mínimo de 1 video publicado (21/11/2026)', async () => {
    const ctx = await setup();
    // v1 no tiene fuente (dato de demostración anterior): se puede editar sin agregarle enlace y se conserva así.
    await openEdit(ctx, 'v1');
    expect(ctx.el.querySelector('[data-test="no-source-note"]')).not.toBeNull();
    await fillAndSave(ctx, { duration: '1:30:00' });
    await until(ctx.harness, () => !ctx.el.querySelector('form'));
    expect(text(row(ctx.el, 'v1'))).toContain('1:30:00');
    expect((await firstValueFrom(ctx.repo.getCourseContent('c1'))).modules[0].videos[0].source).toEqual({ kind: 'placeholder' });
    for (const id of ['v6', 'v5', 'v4', 'v3']) {
      button(row(ctx.el, id), 'Despublicar').click();
      await until(ctx.harness, () => text(row(ctx.el, id)).includes('No publicado'));
    }
    button(row(ctx.el, 'v2'), 'Despublicar').click();
    await until(ctx.harness, () => text(row(ctx.el, 'v2')).includes('No publicado'));
    // Queda 1 publicado: despublicarlo se rechaza.
    button(row(ctx.el, 'v1'), 'Despublicar').click();
    await until(ctx.harness, () => text(ctx.el.querySelector('.alert-danger')).includes('al menos 1 video publicado'));
    const c1 = await firstValueFrom(ctx.repo.getCourseContent('c1'));
    expect(c1.modules[0].videos.filter((v) => v.published).length).toBe(1);
    expect(c1.course.status).toBe('publicado');
  }, 60_000);

  it('21/11/2026: no se puede agregar un video nuevo sin enlace (no existe «Sin archivo»)', async () => {
    const ctx = await setup('/admin/videos?curso=c-ia');
    await openNew(ctx);
    expect([...ctx.el.querySelectorAll('fieldset.source label.check')].map((l) => text(l))).not.toContain('Sin archivo');
    await fillAndSave(ctx, { title: 'Sin enlace', duration: '6:00' });
    expect(text(ctx.el)).toContain('Ingresa el enlace del video: YouTube, Google Drive u otro enlace https.');
    expect((await firstValueFrom(ctx.repo.getCourseContent('c-ia'))).modules[0].videos.length).toBe(1);
  }, 30_000);

  it('rechaza enlaces inseguros y no guarda', async () => {
    const ctx = await setup('/admin/videos?curso=c-mkt');
    await openNew(ctx);
    for (const url of ['http://ejemplo.test/video.mp4', 'javascript:alert(1)', 'ftp://ejemplo.test/v']) {
      await fillAndSave(ctx, { title: 'Enlace inseguro', duration: '6:00', url });
      expect(text(ctx.el.querySelector('.alert-danger'))).toContain('El enlace del video no es válido');
    }
    expect((await firstValueFrom(ctx.repo.getCourseContent('c-mkt'))).modules[0].videos.length).toBe(1);
  }, 30_000);

  it('editar Marketing conserva 603 s y su fuente de YouTube; la vista previa usa el reproductor', async () => {
    const ctx = await setup('/admin/videos?curso=c-mkt');
    await openEdit(ctx, 'c-mkt-v1');
    expect(ctx.el.querySelector<HTMLInputElement>('#v-dur')!.value).toBe('10:03');
    expect(ctx.el.querySelector<HTMLInputElement>('#v-url')!.value).toBe('https://www.youtube.com/watch?v=Ctd6BTuZmjA');
    expect(text(ctx.el)).not.toContain('Fuera de RN-03');
    expect(ctx.el.querySelector('.preview iframe')!.getAttribute('src')).toContain('/embed/Ctd6BTuZmjA');

    await fillAndSave(ctx, { title: 'Aprende Marketing paso a paso (editado)' });
    await until(ctx.harness, () => !ctx.el.querySelector('form'));
    const video = (await firstValueFrom(ctx.repo.getCourseContent('c-mkt'))).modules[0].videos[0];
    expect(video).toMatchObject({ durationSec: 603, source: { kind: 'youtube', videoId: 'Ctd6BTuZmjA' }, published: true });

    // Un enlace https que no es de YouTube no tiene vista previa integrada.
    await openNew(ctx);
    type(ctx.el, '#v-url', 'https://ejemplo.test/clase.mp4');
    await ctx.harness.fixture.whenStable();
    expect(ctx.el.querySelector('.preview')).toBeNull();
    // M4: el aviso menciona también Google Drive, que ahora tiene vista previa.
    expect(text(ctx.el)).toContain('La vista previa solo está disponible para enlaces de YouTube y de Google Drive.');
  }, 30_000);

  it('sin máximo (19/11/2026): con 8 videos «Agregar video» sigue habilitado y muestra el conteo del módulo', async () => {
    const ctx = await setup('/admin/videos?curso=c-ia');
    for (let i = 1; i <= 7; i++) {
      await openNew(ctx);
      await fillAndSave(ctx, { title: `Video ${i}`, duration: '6:00', url: 'https://videos.ejemplo.test/clase.mp4' });
      await until(ctx.harness, () => rows(ctx.el).length === i + 1);
    }
    expect(button(ctx.el, 'Agregar video').disabled).toBe(false);
    expect(text(ctx.el)).toContain('8 videos en 1 módulo. No hay máximo de videos.');
    expect(text(ctx.el)).not.toContain('de 7 videos');
    await openNew(ctx);
    expect(text(ctx.el.querySelector('[data-test="module-count"]'))).toBe(
      'Este módulo tiene 8 videos (8 publicados; para publicar el curso basta con 1).',
    );
  }, 90_000);
});
