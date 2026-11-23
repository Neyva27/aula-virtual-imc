import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { firstValueFrom } from 'rxjs';
import { AdminVideos } from './admin-videos';
import { DataRepository } from '../../core/services/data-repository';
import { MockDataRepository } from '../../core/services/mock-data-repository';

/** M2: módulo de cada video en Administración › Videos. Datos ficticios en el almacenamiento aislado de la prueba. */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const row = (el: HTMLElement, id: string) => el.querySelector<HTMLTableRowElement>(`tr[data-video="${id}"]`)!;
const button = (scope: Element, label: string) =>
  [...scope.querySelectorAll<HTMLButtonElement>('button')].find((b) => text(b) === label || b.getAttribute('aria-label') === label)!;

async function until(harness: RouterTestingHarness, cond: () => boolean, timeout = 8000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    await harness.fixture.whenStable();
    if (cond()) return;
    await sleep(50);
  }
  throw new Error('La condición no se cumplió a tiempo');
}

/** c1 con un segundo módulo «Aplicaciones» que contiene v5 y v6. */
async function setup(url: string) {
  localStorage.clear();
  sessionStorage.clear();
  const prep = new MockDataRepository();
  const module = (await firstValueFrom(prep.saveCourseModule('c1', { title: 'Aplicaciones' }))).modules[1].id;
  for (const v of ['v5', 'v6']) await firstValueFrom(prep.assignCourseVideoToModule('c1', v, module));
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: 'admin/videos', component: AdminVideos }], withComponentInputBinding()),
      { provide: DataRepository, useClass: MockDataRepository },
    ],
  });
  const repo = TestBed.inject(DataRepository);
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url.replace('{m}', module), AdminVideos);
  const el = harness.routeNativeElement as HTMLElement;
  await until(harness, () => el.querySelectorAll('tbody tr').length === 6);
  return { harness, el, repo, module };
}

describe('Videos y módulos (M2)', () => {
  it('cada video muestra su módulo', async () => {
    const { el } = await setup('/admin/videos?curso=c1');
    expect(text(row(el, 'v1').querySelector('[data-label="Módulo"]'))).toBe('1. Contenido del curso');
    expect(text(row(el, 'v6').querySelector('[data-label="Módulo"]'))).toBe('2. Aplicaciones');
  });

  it('subir y bajar solo dentro del mismo módulo', async () => {
    const { el } = await setup('/admin/videos?curso=c1');
    expect(button(row(el, 'v4'), 'Bajar Video 4 · Contenido de demostración').disabled).toBe(true); // último del módulo 1
    expect(button(row(el, 'v5'), 'Subir Video 5 · Contenido de demostración').disabled).toBe(true); // primero del módulo 2
    expect(button(row(el, 'v5'), 'Bajar Video 5 · Contenido de demostración').disabled).toBe(false);
  });

  it('?modulo=&nuevo=1 abre un video nuevo en ese módulo, y al guardar queda en él', async () => {
    const { el, harness, repo, module } = await setup('/admin/videos?curso=c1&modulo={m}&nuevo=1');
    await until(harness, () => !!el.querySelector('#v-module'));
    expect(text(el.querySelector('#video-form-title'))).toBe('Nuevo video');
    expect(el.querySelector<HTMLSelectElement>('#v-module')!.value).toBe(module);
    const set = (sel: string, v: string) => {
      const i = el.querySelector<HTMLInputElement>(sel)!;
      i.value = v;
      i.dispatchEvent(new Event('input', { bubbles: true }));
    };
    set('#v-title', 'Video del módulo 2');
    set('#v-dur', '6:00');
    set('#v-url', 'https://videos.ejemplo.test/modulo2.mp4'); // 21/11/2026: un video nuevo necesita enlace
    const box = el.querySelector<HTMLInputElement>('form input[type=checkbox]')!;
    if (box.checked) box.click(); // sin publicar: c1 está publicado y ya tiene 6 videos publicados
    button(el, 'Guardar').click();
    await until(harness, () => el.querySelectorAll('tbody tr').length === 7);
    const content = await firstValueFrom(repo.getCourseContent('c1'));
    expect(content.modules[1].videos.map((v) => v.title)).toEqual([
      'Video 5 · Contenido de demostración',
      'Video 6 · Contenido de demostración',
      'Video del módulo 2',
    ]);
  });

  it('editar el módulo de un video lo pasa al final del otro módulo', async () => {
    const { el, harness, repo } = await setup('/admin/videos?curso=c1');
    button(row(el, 'v1'), 'Editar Video 1 · Contenido de demostración').click();
    await until(harness, () => !!el.querySelector('#v-module'));
    const select = el.querySelector<HTMLSelectElement>('#v-module')!;
    select.value = select.options[1].value;
    select.dispatchEvent(new Event('change'));
    button(el, 'Guardar').click();
    await until(harness, () => text(el).includes('Video actualizado'));
    const content = await firstValueFrom(repo.getCourseContent('c1'));
    expect(content.modules.map((m) => m.videos.map((v) => v.id))).toEqual([['v2', 'v3', 'v4'], ['v5', 'v6', 'v1']]);
  });
});
