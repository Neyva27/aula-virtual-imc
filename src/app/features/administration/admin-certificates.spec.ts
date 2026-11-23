import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AdminCertificates } from './admin-certificates';
import { DataRepository } from '../../core/services/data-repository';
import { MockDataRepository } from '../../core/services/mock-data-repository';
import { CertificateService } from '../../core/services/certificate.service';

/** V5: vista previa del certificado en administración (foco, Escape y tabulación). Datos ficticios. */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

async function until(fixture: ComponentFixture<unknown>, cond: () => boolean, timeout = 8000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    await fixture.whenStable();
    if (cond()) return;
    await sleep(25);
  }
  throw new Error('La condición no se cumplió a tiempo');
}

const attached: HTMLElement[] = [];
afterEach(() => attached.splice(0).forEach((e) => e.remove()));

async function setup() {
  localStorage.clear();
  sessionStorage.clear();
  TestBed.configureTestingModule({
    providers: [
      { provide: DataRepository, useClass: MockDataRepository },
      // El QR real no hace falta para probar el foco del diálogo.
      { provide: CertificateService, useValue: { qrDataUrl: () => Promise.resolve(null), downloadPdf: () => Promise.resolve() } },
    ],
  });
  const fixture = TestBed.createComponent(AdminCertificates);
  document.body.appendChild(fixture.nativeElement); // focus() solo funciona en elementos del documento
  attached.push(fixture.nativeElement);
  const el = fixture.nativeElement as HTMLElement;
  await until(fixture, () => el.querySelectorAll('tr[data-certificate]').length > 0);
  const view = [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => text(b) === 'Visualizar')!;
  return { fixture, el, view };
}

const key = (target: Element, k: string, shift = false) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { key: k, shiftKey: shift, bubbles: true, cancelable: true }));

describe('Vista previa del certificado: foco (V5)', () => {
  it('al abrir, el foco va a «Cerrar»; Escape cierra y devuelve el foco a «Visualizar»', async () => {
    const { fixture, el, view } = await setup();
    view.focus();
    view.click();
    await until(fixture, () => !!el.querySelector('[role="dialog"]'));
    await sleep(10);
    const close = [...el.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find((b) => text(b) === 'Cerrar')!;
    expect(document.activeElement).toBe(close);
    key(el.querySelector('[role="dialog"]')!, 'Escape');
    await fixture.whenStable();
    await sleep(10);
    expect(el.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(view);
  });

  it('el tabulador no sale del diálogo', async () => {
    const { fixture, el, view } = await setup();
    view.click();
    await until(fixture, () => !!el.querySelector('[role="dialog"]'));
    await sleep(10);
    const dialog = el.querySelector<HTMLElement>('[role="dialog"]')!;
    const close = dialog.querySelector<HTMLButtonElement>('button')!;
    // «Cerrar» es el único control: Tab y Mayús+Tab lo mantienen enfocado.
    close.focus();
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    close.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(close);
    const back = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
    close.dispatchEvent(back);
    expect(back.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(close);
  });
});
