import { ComponentFixture, TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { provideRouter } from '@angular/router';
import { AdminCourses, DEMO_COVERS } from './admin-courses';
import { DataRepository } from '../../core/services/data-repository';
import { MockDataRepository } from '../../core/services/mock-data-repository';
import { SEED_QUESTIONS } from '../../core/data/seed';

/** E5.2: pantalla de cursos con el repositorio simulado real. Todos los datos son ficticios. */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Ctx {
  fixture: ComponentFixture<AdminCourses>;
  el: HTMLElement;
  repo: DataRepository;
  cmp: AdminCourses;
}

async function until(fixture: ComponentFixture<unknown>, cond: () => boolean, timeout = 8000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    await fixture.whenStable();
    if (cond()) return;
    await sleep(50);
  }
  throw new Error('La condición no se cumplió a tiempo');
}

async function setup(prepare?: (repo: DataRepository) => Promise<void>): Promise<Ctx> {
  localStorage.clear();
  sessionStorage.clear();
  // M2: «Contenido del curso» enlaza a Videos (RouterLink), así que la pantalla necesita el router, como en la aplicación.
  TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: DataRepository, useClass: MockDataRepository }] });
  const repo = TestBed.inject(DataRepository);
  if (prepare) await prepare(repo);
  const fixture = TestBed.createComponent(AdminCourses);
  const el = fixture.nativeElement as HTMLElement;
  await until(fixture, () => el.querySelectorAll('tbody tr').length > 0);
  return { fixture, el, repo, cmp: fixture.componentInstance };
}

const row = (el: HTMLElement, id: string) => el.querySelector<HTMLTableRowElement>(`tr[data-course="${id}"]`)!;
const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const buttonByText = (el: HTMLElement, label: string) =>
  [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => text(b).includes(label))!;

function type(el: HTMLElement, selector: string, value: string): void {
  const input = el.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!;
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('blur'));
}

function choose(el: HTMLElement, value: 'none' | 'demo' | 'url'): void {
  el.querySelector<HTMLInputElement>(`input[type=radio][value="${value}"]`)!.click();
}

async function courses(repo: DataRepository) {
  return firstValueFrom(repo.getCourses());
}

async function openEdit(ctx: Ctx, courseId: string): Promise<void> {
  row(ctx.el, courseId).querySelector('button')!.click();
  await until(ctx.fixture, () => text(ctx.el.querySelector('#course-form-title')) === 'Editar curso');
}

describe('AdminCourses (E5.2)', () => {
  it('lista todos los cursos con estado, videos, horas y requisitos', async () => {
    const { el } = await setup();
    expect([...el.querySelectorAll('tbody tr')].map((r) => r.getAttribute('data-course'))).toEqual(['c1', 'c-ia', 'c-mkt']);
    expect(text(row(el, 'c1'))).toContain('Publicado');
    expect(text(row(el, 'c1'))).toContain('6 de 6');
    expect(text(row(el, 'c1'))).toContain('8 h');
    expect(text(row(el, 'c1'))).toContain('Cumple los obligatorios');
    expect(text(row(el, 'c-ia'))).toContain('Borrador');
    expect(text(row(el, 'c-ia'))).toContain('Por definir');
    expect(text(row(el, 'c-ia'))).toContain('1 pendiente'); // 21/11/2026: con 1 video el módulo cumple; falta el examen
    expect(text(row(el, 'c-mkt'))).toContain('Demo');
    // Las portadas se muestran desde los datos de cada curso.
    expect(row(el, 'c-ia').querySelector('img')!.getAttribute('src')).toBe('demo/covers/inteligencia-artificial.svg');
  }, 20_000);

  it('crea un curso en borrador con horas opcionales y portada de demostración', async () => {
    const ctx = await setup();
    const { el, repo, fixture } = ctx;
    buttonByText(el, 'Registrar nuevo curso').click();
    await until(fixture, () => text(el.querySelector('#course-form-title')) === 'Nuevo curso');

    // Sin datos obligatorios no se crea.
    buttonByText(el, 'Crear curso').click();
    await fixture.whenStable();
    expect(text(el)).toContain('Ingresa el nombre del curso.');
    expect((await courses(repo)).length).toBe(3);

    type(el, '#c-name', 'Curso creado en la prueba');
    type(el, '#c-desc', 'Descripción ficticia para la prueba.');
    choose(el, 'demo');
    await fixture.whenStable();
    const select = el.querySelector<HTMLSelectElement>('#c-demo-cover')!;
    select.value = DEMO_COVERS[1].path;
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    expect(el.querySelector('.preview img')!.getAttribute('src')).toBe(DEMO_COVERS[1].path);

    buttonByText(el, 'Crear curso').click();
    await until(fixture, () => el.querySelectorAll('tbody tr').length === 4);
    const created = (await courses(repo)).find((c) => c.name === 'Curso creado en la prueba')!;
    expect(created).toMatchObject({ status: 'borrador', trainingHours: null, coverImage: DEMO_COVERS[1].path, isDemo: false });
    expect(text(row(el, created.id))).toContain('Borrador');
    expect(text(el)).toContain('Curso creado en borrador');
  }, 20_000);

  it('edita los datos básicos de un curso sin alterar los demás', async () => {
    const ctx = await setup();
    const { el, repo, fixture } = ctx;
    const c1Before = await firstValueFrom(repo.getCourse());
    const mktBefore = (await courses(repo)).find((c) => c.id === 'c-mkt');

    await openEdit(ctx, 'c-ia');
    expect(el.querySelector<HTMLInputElement>('#c-name')!.value).toBe('Introducción a la Inteligencia Artificial');
    type(el, '#c-desc', 'Descripción editada en la prueba.');
    type(el, '#c-hours', '12');
    choose(el, 'url');
    await fixture.whenStable();

    // Una dirección que no es https no se guarda.
    type(el, '#c-cover-url', 'http://ejemplo.test/portada.png');
    buttonByText(el, 'Guardar cambios').click();
    await fixture.whenStable();
    expect(text(el)).toContain('Ingresa una dirección que empiece con https://');
    expect((await courses(repo)).find((c) => c.id === 'c-ia')!.description).not.toBe('Descripción editada en la prueba.');

    type(el, '#c-cover-url', 'https://ejemplo.test/portada.png');
    buttonByText(el, 'Guardar cambios').click();
    await until(fixture, () => text(el).includes('Cambios guardados'));
    expect((await courses(repo)).find((c) => c.id === 'c-ia')).toMatchObject({
      description: 'Descripción editada en la prueba.',
      trainingHours: 12,
      coverImage: 'https://ejemplo.test/portada.png',
      status: 'borrador',
    });
    expect(await firstValueFrom(repo.getCourse())).toEqual(c1Before);
    expect((await courses(repo)).find((c) => c.id === 'c-mkt')).toEqual(mktBefore);
  }, 20_000);

  it('valida las horas: vacías es válido; 0 o decimales, no', async () => {
    const ctx = await setup();
    const { el, repo, fixture } = ctx;
    await openEdit(ctx, 'c1');
    for (const bad of ['0', '2.5']) {
      type(el, '#c-hours', bad);
      buttonByText(el, 'Guardar cambios').click();
      await fixture.whenStable();
      expect(text(el)).toContain('Ingresa un número entero de horas');
    }
    expect((await courses(repo)).find((c) => c.id === 'c1')!.trainingHours).toBe(8);
  }, 20_000);

  it('muestra los requisitos que bloquean la publicación y las advertencias', async () => {
    const ctx = await setup();
    const { el } = ctx;
    await openEdit(ctx, 'c-mkt');
    const reqs = [...el.querySelectorAll('.reqs li')].map(text);
    expect(reqs.some((r) => r.includes('Módulo 1'))).toBe(false); // 21/11/2026: con 1 video publicado el módulo cumple
    expect(reqs.some((r) => r.includes('dura'))).toBe(false); // sin límite de duración (20/11/2026)
    expect(reqs.some((r) => r.includes('El examen activo no tiene preguntas.'))).toBe(true);
    expect([...el.querySelectorAll('.warns li')].map(text)).toEqual([
      'Las horas de formación están sin definir: el certificado mostrará «Por definir».',
    ]);
    expect(buttonByText(el, 'Publicar curso').disabled).toBe(true);
  }, 20_000);

  it('no publica un curso que incumple los requisitos obligatorios', async () => {
    const ctx = await setup();
    const { el, repo, cmp, fixture } = ctx;
    await openEdit(ctx, 'c-ia');
    expect(buttonByText(el, 'Publicar curso').disabled).toBe(true);
    cmp.publish(); // aunque se invoque directamente, no se publica
    await fixture.whenStable();
    expect(text(el)).toContain('El curso no cumple los requisitos obligatorios para publicarse.');
    expect((await courses(repo)).find((c) => c.id === 'c-ia')!.status).toBe('borrador');
  }, 20_000);

  it('publica cuando cumple los requisitos y permite volver a borrador con confirmación', async () => {
    const ctx = await setup(async (repo) => {
      for (let i = 1; i <= 4; i++) {
        await firstValueFrom(repo.saveCourseVideo('c-ia', { title: `Video de prueba ${i}`, durationSec: 360, published: true, url: 'https://videos.ejemplo.test/clase.mp4' }));
      }
      for (const q of SEED_QUESTIONS) await firstValueFrom(repo.saveExamQuestion('c-ia-e1', structuredClone(q)));
    });
    const { el, repo, fixture } = ctx;
    expect(text(row(el, 'c-ia'))).toContain('Cumple los obligatorios');
    await openEdit(ctx, 'c-ia');
    expect(text(el.querySelector('.alert-success'))).toContain('Cumple los requisitos obligatorios.');

    // Con cambios sin guardar no se publica.
    type(el, '#c-desc', 'Cambio sin guardar');
    await fixture.whenStable();
    expect(buttonByText(el, 'Publicar curso').disabled).toBe(true);
    buttonByText(el, 'Cancelar').click();
    await fixture.whenStable();
    await openEdit(ctx, 'c-ia');

    buttonByText(el, 'Publicar curso').click();
    await until(fixture, () => text(row(el, 'c-ia')).includes('Publicado'));
    expect((await courses(repo)).find((c) => c.id === 'c-ia')!.status).toBe('publicado');

    buttonByText(el, 'Pasar a borrador').click();
    await fixture.whenStable();
    expect(text(el)).toContain('no podrán rendir el examen');
    el.querySelector<HTMLButtonElement>('button.btn-danger')!.click();
    await until(fixture, () => text(row(el, 'c-ia')).includes('Borrador'));
    expect((await courses(repo)).find((c) => c.id === 'c-ia')!.status).toBe('borrador');
  }, 30_000);
});
