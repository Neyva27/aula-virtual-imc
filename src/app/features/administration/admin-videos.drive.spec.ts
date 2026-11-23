import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { firstValueFrom } from 'rxjs';
import { AdminVideos } from './admin-videos';
import { DataRepository } from '../../core/services/data-repository';
import { MockDataRepository } from '../../core/services/mock-data-repository';

/** M4: fuente del video (YouTube o Google Drive) en Administración › Videos. Identificadores ficticios. */
const ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz012345';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
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

async function setup() {
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
  await harness.navigateByUrl('/admin/videos?curso=c-ia', AdminVideos);
  const el = harness.routeNativeElement as HTMLElement;
  await until(harness, () => el.querySelectorAll('tbody tr').length === 1);
  button(el, 'Agregar video').click();
  await until(harness, () => !!el.querySelector('#v-title'));
  return { harness, el, repo };
}

function type(el: HTMLElement, selector: string, value: string): void {
  const input = el.querySelector<HTMLInputElement>(selector)!;
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function choose(el: HTMLElement, label: string): void {
  const radio = [...el.querySelectorAll<HTMLLabelElement>('fieldset.source label.check')].find((l) => text(l) === label)!.querySelector('input')!;
  radio.click();
}

const chosen = (el: HTMLElement) => text(el.querySelector<HTMLInputElement>('fieldset.source input:checked')!.closest('label'));

describe('Fuente del video: YouTube o Google Drive (M4)', () => {
  it('ofrece las fuentes y cambia la ayuda según la elegida', async () => {
    const { el, harness } = await setup();
    expect([...el.querySelectorAll('fieldset.source label.check')].map((l) => text(l))).toEqual([
      'YouTube',
      'Google Drive',
      'Otro enlace https',
    ]); // 21/11/2026: sin «Sin archivo»
    expect(chosen(el)).toBe('YouTube');
    choose(el, 'Google Drive');
    await harness.fixture.whenStable();
    expect(text(el.querySelector('label[for="v-url"]'))).toBe('Enlace compartido de Google Drive');
    expect(text(el.querySelector('#v-url-help'))).toContain('Cualquier persona con el enlace');
    // El campo de enlace está siempre presente (un video nuevo necesita fuente).
    expect(el.querySelector('#v-url')).not.toBeNull();
  });

  it('con Google Drive elegido valida el enlace y muestra la vista previa con el visor de Drive', async () => {
    const { el, harness } = await setup();
    choose(el, 'Google Drive');
    type(el, '#v-url', `https://drive.google.com/drive/folders/${ID}`);
    await harness.fixture.whenStable();
    expect(text(el.querySelector('#v-url-error'))).toContain('No es un enlace de archivo de Google Drive válido');
    expect(el.querySelector('#v-url')!.getAttribute('aria-invalid')).toBe('true');
    expect(el.querySelector('.preview')).toBeNull();

    type(el, '#v-url', `https://drive.google.com/file/d/${ID}/view?usp=sharing`);
    await harness.fixture.whenStable();
    expect(el.querySelector('#v-url-error')).toBeNull();
    expect(el.querySelector('.preview iframe')!.getAttribute('src')).toBe(`https://drive.google.com/file/d/${ID}/preview`);
  });

  it('pegar un enlace de Drive sin elegir fuente selecciona Google Drive, y se guarda con esa fuente', async () => {
    const { el, harness, repo } = await setup();
    type(el, '#v-title', 'Clase en Drive');
    type(el, '#v-dur', '6:00');
    type(el, '#v-url', `https://drive.google.com/file/d/${ID}/view`);
    await harness.fixture.whenStable();
    expect(chosen(el)).toBe('Google Drive');
    button(el, 'Guardar').click();
    await until(harness, () => el.querySelectorAll('tbody tr').length === 2);
    const videos = (await firstValueFrom(repo.getCourseContent('c-ia'))).modules[0].videos;
    expect(videos[1].source).toEqual({ kind: 'drive', fileId: ID });
    expect(text(el.querySelectorAll('tbody tr')[1].querySelector('[data-label="Enlace"]'))).toBe('Google Drive');
  });

  it('si la fuente elegida no corresponde al enlace, el repositorio lo rechaza y no guarda', async () => {
    const { el, harness, repo } = await setup();
    choose(el, 'YouTube');
    type(el, '#v-title', 'Enlace cruzado');
    type(el, '#v-dur', '6:00');
    type(el, '#v-url', `https://drive.google.com/file/d/${ID}/view`);
    await harness.fixture.whenStable();
    expect(chosen(el)).toBe('YouTube'); // la elección explícita no cambia
    expect(text(el.querySelector('#v-url-error'))).toContain('No es un enlace de video de YouTube válido');
    button(el, 'Guardar').click();
    await until(harness, () => !!el.querySelector('.alert-danger'));
    expect(text(el.querySelector('.alert-danger'))).toContain('no es un video de YouTube válido');
    expect((await firstValueFrom(repo.getCourseContent('c-ia'))).modules[0].videos.length).toBe(1);
  });

  it('editar un video de YouTube existente muestra YouTube elegido y conserva su fuente', async () => {
    const { el, harness, repo } = await setup();
    button(el, 'Cancelar').click();
    await until(harness, () => !el.querySelector('form'));
    button(el, 'Editar ¿Qué es y cómo funciona la Inteligencia Artificial?').click();
    await until(harness, () => !!el.querySelector('#v-url'));
    expect(chosen(el)).toBe('YouTube');
    button(el, 'Guardar').click();
    await until(harness, () => !el.querySelector('form'));
    expect((await firstValueFrom(repo.getCourseContent('c-ia'))).modules[0].videos[0].source).toEqual({ kind: 'youtube', videoId: '_tA5cinv0U8' });
  });
});
