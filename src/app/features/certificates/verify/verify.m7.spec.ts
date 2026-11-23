import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../../app.routes';
import { AuthService } from '../../../core/services/auth.service';
import { CertificateService } from '../../../core/services/certificate.service';
import { DataRepository } from '../../../core/services/data-repository';
import { MockDataRepository, STORAGE_KEY } from '../../../core/services/mock-data-repository';
import { DemoState } from '../../../core/data/demo-state';

/**
 * M7: verificación pública de certificados con las rutas reales y SIN sesión. Se audita lo existente (no se
 * reconstruye): búsqueda por código y por DNI, estados, enlace del QR y protección de datos. Datos ficticios.
 */
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

async function open(url: string, edit?: (s: DemoState) => void) {
  localStorage.clear();
  sessionStorage.clear();
  if (edit) {
    new MockDataRepository().resetDemo();
    const s: DemoState = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    edit(s);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  }
  TestBed.configureTestingModule({
    providers: [provideRouter(routes, withComponentInputBinding()), { provide: DataRepository, useClass: MockDataRepository }],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url);
  const root = harness.fixture.nativeElement as HTMLElement;
  await until(harness, () => !!root.querySelector('app-verify'));
  return { harness, root, router: TestBed.inject(Router) };
}

async function searchFor(ctx: Awaited<ReturnType<typeof open>>, mode: 'Por código' | 'Por DNI', value: string) {
  const { root, harness } = ctx;
  [...root.querySelectorAll<HTMLButtonElement>('.modes button')].find((b) => text(b) === mode)!.click();
  await harness.fixture.whenStable();
  const input = root.querySelector<HTMLInputElement>('#query')!;
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  root.querySelector<HTMLFormElement>('app-verify form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await until(harness, () => !!root.querySelector('.result'));
}

const results = (root: HTMLElement) => [...root.querySelectorAll('.result')];

describe('Verificación pública de certificados (M7)', () => {
  it('es accesible sin iniciar sesión y el enlace del QR abre la verificación del certificado', async () => {
    const qr = TestBed.inject(CertificateService).verificationUrl('IMC-DEMO-0001');
    expect(qr).toBe(`${window.location.origin}/verificar/IMC-DEMO-0001`);
    TestBed.resetTestingModule();
    const ctx = await open(new URL(qr).pathname);
    expect(TestBed.inject(AuthService).user()).toBeNull();
    expect(ctx.router.url).toBe('/verificar/IMC-DEMO-0001');
    await until(ctx.harness, () => !!ctx.root.querySelector('.result'));
    expect(text(results(ctx.root)[0])).toContain('Certificado válido');
  });

  it('un certificado válido muestra solo los datos necesarios: sin DNI, sin nota ni datos internos', async () => {
    const { root, harness } = await open('/verificar/imc-demo-0001'); // sin distinguir mayúsculas
    await until(harness, () => !!root.querySelector('.result'));
    const shown = text(results(root)[0]);
    for (const expected of ['IMC-DEMO-0001', 'Ana Torres Quispe', 'Curso de demostración', '12/10/2026', 'Vigente']) {
      expect(shown).toContain(expected);
    }
    // Datos personales o internos que no deben exponerse.
    for (const hidden of ['00000001', 'ana@ejemplo.test', 'att1', 'cert1', 'u1', '80']) expect(shown).not.toContain(hidden);
    expect([...results(root)[0].querySelectorAll('dt')].map((d) => text(d))).toEqual([
      'Código',
      'Participante',
      'Curso',
      'Fecha de emisión',
      'Horas de formación',
      'Estado de la verificación',
    ]);
  });

  it('busca por DNI y muestra los certificados de esa persona', async () => {
    const ctx = await open('/verificar');
    await searchFor(ctx, 'Por DNI', '00000001');
    expect(results(ctx.root).length).toBe(1);
    expect(text(results(ctx.root)[0])).toContain('IMC-DEMO-0001');
    expect(text(results(ctx.root)[0])).not.toContain('00000001'); // el DNI buscado no se repite en el resultado
  });

  it('un certificado revocado se muestra como revocado', async () => {
    const { root, harness } = await open('/verificar/IMC-DEMO-0001', (s) => {
      s.certificates[0].status = 'revocado';
    });
    await until(harness, () => !!root.querySelector('.result'));
    expect(text(results(root)[0])).toContain('Certificado revocado');
    expect(text(results(root)[0])).toContain('Revocado');
    expect(results(root)[0].classList).toContain('result--bad');
  });

  it('el código o el nombre de un curso no demuestran una certificación', async () => {
    for (const value of ['c1', 'Curso de demostración (nombre provisional)', 'IMC-DEMO']) {
      TestBed.resetTestingModule();
      const ctx = await open('/verificar');
      await searchFor(ctx, 'Por código', value);
      expect(text(results(ctx.root)[0])).toContain('No encontrado');
      expect(ctx.root.querySelector('.result--ok')).toBeNull();
    }
  });

  it('un código inexistente o un DNI mal escrito muestran un estado claro', async () => {
    const ctx = await open('/verificar/IMC-DEMO-9999');
    await until(ctx.harness, () => !!ctx.root.querySelector('.result'));
    expect(text(results(ctx.root)[0])).toContain('No encontramos un certificado con “IMC-DEMO-9999”');
    [...ctx.root.querySelectorAll<HTMLButtonElement>('.modes button')].find((b) => text(b) === 'Por DNI')!.click();
    await ctx.harness.fixture.whenStable();
    const input = ctx.root.querySelector<HTMLInputElement>('#query')!;
    input.value = '1234';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    ctx.root.querySelector<HTMLFormElement>('app-verify form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await until(ctx.harness, () => text(ctx.root).includes('El DNI debe tener 8 dígitos numéricos.'));
  });

  it('un certificado emitido al aprobar en la demostración también se verifica', async () => {
    const { root, harness } = await open('/verificar/IMC-DEMO-0002', (s) => {
      s.certificates.push({ ...s.certificates[0], id: 'cert-m7', code: 'IMC-DEMO-0002', userId: 'u6', participantName: 'Jorge Ríos Salas', participantDni: '00000006', attemptId: 'att3' });
    });
    await until(harness, () => !!root.querySelector('.result'));
    expect(text(results(root)[0])).toContain('Jorge Ríos Salas');
    expect(text(results(root)[0])).toContain('Certificado válido');
  });
});
