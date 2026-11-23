import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AdminCourseContent } from './admin-course-content';
import { DataRepository } from '../../core/services/data-repository';
import { MockDataRepository, STORAGE_KEY } from '../../core/services/mock-data-repository';

/** M2: sección «Contenido del curso» con el repositorio simulado real. Datos ficticios. */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const button = (scope: Element, label: string) =>
  [...scope.querySelectorAll<HTMLButtonElement>('button')].find((b) => text(b) === label || b.getAttribute('aria-label') === label);

/** `prepare` deja datos guardados antes de crear el componente (con otra instancia del repositorio simulado). */
async function setup(courseId = 'c1', prepare?: (repo: DataRepository) => Promise<unknown>) {
  localStorage.clear();
  sessionStorage.clear();
  if (prepare) await prepare(new MockDataRepository());
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: DataRepository, useClass: MockDataRepository }],
  });
  const fixture = TestBed.createComponent(AdminCourseContent);
  fixture.componentRef.setInput('courseId', courseId);
  const el = fixture.nativeElement as HTMLElement;
  const repo = TestBed.inject(DataRepository);
  const until = async (cond: () => boolean) => {
    for (let i = 0; i < 160; i++) {
      await fixture.whenStable();
      if (cond()) return;
      await sleep(50);
    }
    throw new Error('La condición no se cumplió a tiempo');
  };
  await until(() => el.querySelectorAll('.module').length > 0);
  return { fixture, el, repo, until };
}

const modules = (el: HTMLElement) => [...el.querySelectorAll<HTMLElement>('li.module')];
const toggleOf = (m: HTMLElement) => m.querySelector<HTMLButtonElement>('.module__toggle')!;
const setValue = (input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string, event = 'input') => {
  input.value = value;
  input.dispatchEvent(new Event(event, { bubbles: true }));
};

describe('Contenido del curso (M2)', () => {
  it('muestra los módulos en acordeón, el primero desplegado, con aria-expanded', async () => {
    const { el, until } = await setup();
    const [m] = modules(el);
    expect(text(toggleOf(m))).toContain('Módulo 1: Contenido del curso');
    expect(toggleOf(m).getAttribute('aria-expanded')).toBe('true');
    expect(m.querySelectorAll('li.video').length).toBe(6);
    toggleOf(m).click();
    await until(() => toggleOf(m).getAttribute('aria-expanded') === 'false');
    expect(m.querySelector('.module__body')).toBeNull();
  });

  it('crea un módulo desde el formulario y lo muestra desplegado', async () => {
    const { el, until } = await setup();
    button(el, 'Agregar módulo')!.click();
    await until(() => !!el.querySelector('#m-title'));
    setValue(el.querySelector<HTMLInputElement>('#m-title')!, 'Fundamentos');
    setValue(el.querySelector<HTMLTextAreaElement>('#m-desc')!, 'Conceptos base');
    button(el, 'Crear módulo')!.click();
    await until(() => modules(el).length === 2);
    const second = modules(el)[1];
    expect(text(toggleOf(second))).toContain('Módulo 2: Fundamentos');
    expect(toggleOf(second).getAttribute('aria-expanded')).toBe('true');
    expect(text(second)).toContain('Conceptos base');
    expect(text(el.querySelector('[role=status]'))).toBe('Módulo creado (demostración).');
  });

  it('no crea un módulo sin nombre', async () => {
    const { el, until, repo } = await setup();
    const spy = vi.spyOn(repo, 'saveCourseModule');
    button(el, 'Agregar módulo')!.click();
    await until(() => !!el.querySelector('#m-title'));
    button(el, 'Crear módulo')!.click();
    await until(() => !!el.querySelector('#m-title-error'));
    expect(spy).not.toHaveBeenCalled();
    expect(el.querySelector('#m-title')!.getAttribute('aria-invalid')).toBe('true');
  });

  it('mueve un video a otro módulo con «Mover a…»', async () => {
    let target = '';
    const { el, until } = await setup('c1', async (r) => {
      target = (await firstValueFrom(r.saveCourseModule('c1', { title: 'Aplicaciones' }))).modules[1].id;
    });
    const select = el.querySelector<HTMLSelectElement>('li.video[data-video="v6"] select')!;
    setValue(select, target, 'change');
    await until(() => el.querySelectorAll(`li.module[data-module="${target}"] li.video`).length === 1);
    expect(el.querySelector(`li.module[data-module="${target}"] li.video`)!.getAttribute('data-video')).toBe('v6');
    expect(text(el.querySelector('[role=status]'))).toContain('pasó a «Aplicaciones»');
  });

  it('eliminar pide confirmación: «Cancelar» no cambia nada y confirmar mueve los videos', async () => {
    let target = '';
    const { el, until, repo } = await setup('c1', async (r) => {
      target = (await firstValueFrom(r.saveCourseModule('c1', { title: 'Aplicaciones' }))).modules[1].id;
      await firstValueFrom(r.assignCourseVideoToModule('c1', 'v6', target));
    });
    const saved = localStorage.getItem(STORAGE_KEY);
    const spy = vi.spyOn(repo, 'deleteCourseModule');

    button(modules(el)[1], 'Eliminar módulo Aplicaciones')!.click();
    await until(() => !!el.querySelector('[role=alertdialog]'));
    const dialog = el.querySelector('[role=alertdialog]')!;
    expect(text(dialog)).toContain('¿Eliminar el módulo «Aplicaciones»?');
    expect(text(dialog)).toContain('Sus 1 video no se elimina');
    button(dialog, 'Cancelar')!.click();
    await until(() => !el.querySelector('[role=alertdialog]'));
    expect(spy).not.toHaveBeenCalled();
    expect(localStorage.getItem(STORAGE_KEY)).toBe(saved);

    button(modules(el)[1], 'Eliminar módulo Aplicaciones')!.click();
    await until(() => !!el.querySelector('[role=alertdialog]'));
    button(el.querySelector('[role=alertdialog]')!, 'Sí, eliminar módulo')!.click();
    await until(() => modules(el).length === 1);
    expect(spy).toHaveBeenCalledWith('c1', target, 'c1-m1');
    expect(modules(el)[0].querySelectorAll('li.video').length).toBe(6);
  });

  it('el último módulo no se puede eliminar', async () => {
    const { el } = await setup('c-ia');
    expect(button(modules(el)[0], 'Eliminar módulo Contenido del curso')!.disabled).toBe(true);
  });

  it('«Crear video en este módulo» lleva a Videos con el curso y el módulo', async () => {
    const { el } = await setup('c-ia');
    const link = [...el.querySelectorAll<HTMLAnchorElement>('a')].find((a) => text(a) === 'Crear video en este módulo')!;
    const href = link.getAttribute('href')!;
    expect(href).toContain('/instructor/videos?');
    expect(href).toContain('curso=c-ia');
    expect(href).toContain('modulo=c-ia-m1');
    expect(href).toContain('nuevo=1');
  });

  it('RN-03 por módulo (21/11/2026): cada módulo muestra sus publicados (basta 1) y siempre permite crear videos', async () => {
    const { el } = await setup('c1', async (repo) => {
      const c = await firstValueFrom(repo.saveCourseModule('c1', { title: 'Práctica' }));
      for (let i = 0; i < 3; i++) {
        await firstValueFrom(repo.saveCourseVideo('c1', { title: `P${i}`, durationSec: 360, published: true, url: 'https://videos.ejemplo.test/clase.mp4', moduleId: c.modules[1].id }));
      }
    });
    const [m1, m2] = modules(el);
    expect(text(m1.querySelector('[data-published]'))).toBe('6 publicados');
    expect(text(m2.querySelector('[data-published]'))).toBe('3 publicados');
    expect(m2.querySelector('[data-published]')!.classList.contains('badge--success')).toBe(true);
    // 9 videos en el curso: ya no aparece el máximo de 7 y se puede crear un video en el módulo.
    expect(text(el)).toContain('No hay máximo de videos. El curso tiene 9 videos (9 publicados).');
    expect(text(el)).not.toContain('el máximo de RN-03');
    expect(text(m1)).toContain('Crear video en este módulo');
  });
});

