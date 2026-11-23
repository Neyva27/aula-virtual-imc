import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { firstValueFrom } from 'rxjs';
import { routes } from '../../app.routes';
import { AuthService } from '../../core/services/auth.service';
import { DataRepository } from '../../core/services/data-repository';
import { MockDataRepository } from '../../core/services/mock-data-repository';
import { DEMO_CONFIG } from '../../core/config/demo.config';

/** V5: control del foco del cajón del menú de administración (móvil). Datos ficticios. */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

async function setup() {
  localStorage.clear();
  sessionStorage.clear();
  TestBed.configureTestingModule({
    providers: [provideRouter(routes, withComponentInputBinding()), { provide: DataRepository, useClass: MockDataRepository }],
  });
  await firstValueFrom(TestBed.inject(AuthService).login('admin@ejemplo.test', DEMO_CONFIG.demoPassword));
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl('/admin');
  const root = harness.fixture.nativeElement as HTMLElement;
  document.body.appendChild(root); // focus() solo funciona en elementos del documento
  attached.push(root);
  // jsdom no aplica las media queries (trabaja a 1024 px): se muestran los botones del menú como en móvil,
  // porque jsdom no permite enfocar elementos con display: none.
  const mobile = document.createElement('style');
  mobile.textContent = '.side__close, .bar__menu { display: inline-flex !important; }';
  document.head.appendChild(mobile);
  attached.push(mobile);
  for (let i = 0; i < 40 && !root.querySelector('.side__nav a'); i++) {
    await harness.fixture.whenStable();
    await sleep(25);
  }
  const toggle = [...root.querySelectorAll<HTMLButtonElement>('.bar button')].find((b) => text(b) === 'Menú')!;
  return { harness, root, toggle };
}

const attached: HTMLElement[] = [];
afterEach(() => attached.splice(0).forEach((e) => e.remove()));

async function settle(harness: RouterTestingHarness): Promise<void> {
  await harness.fixture.whenStable();
  await sleep(10);
}

describe('Cajón del menú de administración: foco (V5)', () => {
  it('al abrir, el foco pasa a «Cerrar menú» y el resto del panel queda inerte', async () => {
    const { harness, root, toggle } = await setup();
    const body = root.querySelector<HTMLElement>('.admin__body')!;
    const skip = root.querySelector<HTMLElement>('a.skip')!;
    expect(body.inert).toBe(false);
    toggle.click();
    await settle(harness);
    expect(document.activeElement).toBe(root.querySelector('.side__close'));
    expect(body.inert).toBe(true);
    expect(skip.inert).toBe(true);
  }, 20_000);

  it('al cerrar con el botón, el fondo o Escape, el foco vuelve a «Menú» y el panel deja de estar inerte', async () => {
    const { harness, root, toggle } = await setup();
    const body = root.querySelector<HTMLElement>('.admin__body')!;
    for (const close of [
      () => root.querySelector<HTMLButtonElement>('.side__close')!.click(),
      () => root.querySelector<HTMLElement>('.backdrop')!.click(),
      () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })),
    ]) {
      toggle.click();
      await settle(harness);
      expect(body.inert).toBe(true);
      close();
      await settle(harness);
      expect(root.querySelector('.side')!.classList).not.toContain('is-open');
      expect(body.inert).toBe(false);
      expect(document.activeElement).toBe(toggle);
    }
  }, 20_000);

  it('Escape con el cajón cerrado no mueve el foco', async () => {
    const { harness, root } = await setup();
    const link = root.querySelector<HTMLAnchorElement>('.side__nav a')!;
    link.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await settle(harness);
    expect(document.activeElement).toBe(link);
  }, 20_000);
});
