import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Verify } from './verify';
import { DataRepository } from '../../../core/services/data-repository';
import { MockDataRepository } from '../../../core/services/mock-data-repository';

/** V4: página pública de verificación (presentación y accesibilidad), con el repositorio simulado real. */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

async function until(harness: RouterTestingHarness, cond: () => boolean, timeout = 8000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    await harness.fixture.whenStable();
    if (cond()) return;
    await sleep(50);
  }
  throw new Error('La condición no se cumplió a tiempo');
}

async function open(url: string) {
  localStorage.clear();
  sessionStorage.clear();
  TestBed.configureTestingModule({
    providers: [
      provideRouter(
        [
          { path: 'verificar', component: Verify },
          { path: 'verificar/:codigo', component: Verify },
        ],
        withComponentInputBinding(),
      ),
      { provide: DataRepository, useClass: MockDataRepository },
    ],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url, Verify);
  return { harness, el: harness.routeNativeElement as HTMLElement };
}

const modeButton = (el: HTMLElement, label: string) =>
  [...el.querySelectorAll<HTMLButtonElement>('.modes button')].find((b) => text(b) === label)!;

describe('Verificación pública (V4)', () => {
  it('con un código válido muestra el resultado vigente con su estado y sus datos', async () => {
    const { harness, el } = await open('/verificar/IMC-DEMO-0001');
    await until(harness, () => !!el.querySelector('.result'));
    const result = el.querySelector('.result')!;
    expect(result.classList).toContain('result--ok');
    expect(text(result.querySelector('.badge'))).toBe('Certificado válido');
    expect(text(result.querySelector('.code'))).toBe('IMC-DEMO-0001');
    expect(text(result)).toContain('Ana Torres Quispe');
    expect(text(result)).toMatch(/Estado de la verificación\s*Vigente/);
    expect(result.querySelector('.result__icon')!.getAttribute('aria-hidden')).toBe('true');
    // Se mantiene el aviso de que es una verificación de demostración.
    expect(text(el)).toContain('Verificación de demostración');
  }, 20_000);

  it('el selector de modo indica el modo activo con aria-pressed y cambia la etiqueta del campo', async () => {
    const { harness, el } = await open('/verificar');
    expect(modeButton(el, 'Por código').getAttribute('aria-pressed')).toBe('true');
    expect(modeButton(el, 'Por DNI').getAttribute('aria-pressed')).toBe('false');
    modeButton(el, 'Por DNI').click();
    await harness.fixture.whenStable();
    expect(modeButton(el, 'Por DNI').getAttribute('aria-pressed')).toBe('true');
    expect(text(el.querySelector('label[for="query"]'))).toBe('DNI del participante');
  }, 20_000);

  it('sin valor muestra el error asociado al campo', async () => {
    const { harness, el } = await open('/verificar');
    el.querySelector<HTMLButtonElement>('form button[type=submit]')!.click();
    await harness.fixture.whenStable();
    const input = el.querySelector<HTMLInputElement>('#query')!;
    expect(text(el.querySelector('#query-error'))).toBe('Ingresa un valor para verificar.');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe('query-error');
  }, 20_000);

  it('un código inexistente muestra «No encontrado» sin inventar datos', async () => {
    const { harness, el } = await open('/verificar/IMC-NO-EXISTE');
    await until(harness, () => !!el.querySelector('.result'));
    const result = el.querySelector('.result')!;
    expect(result.classList).toContain('result--missing');
    expect(text(result.querySelector('.badge'))).toBe('No encontrado');
    expect(result.querySelector('dl')).toBeNull();
  }, 20_000);
});
