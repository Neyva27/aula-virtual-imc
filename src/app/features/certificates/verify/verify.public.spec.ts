import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../../app.routes';
import { Login } from '../../auth/login/login';
import { DataRepository } from '../../../core/services/data-repository';
import { MockDataRepository, STORAGE_KEY } from '../../../core/services/mock-data-repository';
import { DemoState } from '../../../core/data/demo-state';

/**
 * Validación pública de certificados (20/11/2026): sección en /login que abre /validar-certificado en una pestaña
 * nueva, y la página pública (sin sesión) que consulta por DNI con el mismo componente y repositorio que /verificar,
 * mostrando solo titular, curso, código, emisión, estado y resultado. Datos ficticios de la demostración.
 */
@Component({ template: '' })
class Stub {}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const stored = (): DemoState => JSON.parse(localStorage.getItem(STORAGE_KEY)!);

async function until(harness: RouterTestingHarness, cond: () => boolean, timeout = 8000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    await harness.fixture.whenStable();
    if (cond()) return;
    await sleep(50);
  }
  throw new Error('La condición no se cumplió a tiempo');
}

/** Ana (00000001) tiene IMC-DEMO-0001 vigente; se agrega uno anulado de otro curso para el mismo DNI. */
function prepare(): void {
  localStorage.clear();
  sessionStorage.clear();
  new MockDataRepository().resetDemo();
  const s = stored();
  const base = s.certificates[0];
  s.certificates.push({ ...base, id: 'cert-old', code: 'IMC-2025-0099', attemptId: 'att-old', courseName: 'Curso anterior', issueDate: '2025-06-10', approvalDate: '2025-06-10', status: 'revocado' });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

async function openPublic() {
  prepare();
  TestBed.configureTestingModule({
    providers: [provideRouter(routes, withComponentInputBinding()), { provide: DataRepository, useClass: MockDataRepository }],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl('/validar-certificado');
  const el = harness.fixture.nativeElement as HTMLElement;
  await until(harness, () => !!el.querySelector('app-verify h1'));
  const consult = async (dni: string) => {
    const input = el.querySelector<HTMLInputElement>('#query')!;
    input.value = dni;
    input.dispatchEvent(new Event('input'));
    await harness.fixture.whenStable();
    [...el.querySelectorAll<HTMLButtonElement>('button[type="submit"]')].find((b) => text(b) === 'Consultar certificado')!.click();
    await until(harness, () => !text(el).includes('Verificando…'));
  };
  return { harness, el, consult, router: TestBed.inject(Router) };
}

describe('Validación pública de certificados (20/11/2026)', () => {
  it('/login muestra «¿Necesitas verificar un certificado?» y «Validar certificado» abre /validar-certificado en otra pestaña', async () => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: 'panel', component: Stub }]), { provide: DataRepository, useClass: MockDataRepository }],
    });
    const fixture = TestBed.createComponent(Login);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const cta = el.querySelector('[data-verify-cta]')!;
    expect(text(cta.querySelector('h2'))).toBe('¿Necesitas verificar un certificado?');
    const link = cta.querySelector<HTMLAnchorElement>('a[data-test="validate-certificate"]')!;
    expect(text(link)).toBe('Validar certificado (se abre en una pestaña nueva)');
    // Pestaña nueva: el navegador la abre (target), la página de inicio de sesión no navega ni se reemplaza.
    expect(link.getAttribute('href')).toBe('/validar-certificado');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
  });

  it('la ruta es pública (sin sesión) y solo consulta por DNI, con la identidad de Aula Virtual IMC', async () => {
    const { el, router } = await openPublic();
    expect(router.url).toBe('/validar-certificado'); // sin redirección al inicio de sesión
    expect(text(el.querySelector('app-verify h1'))).toBe('Validación de certificados');
    expect(el.querySelector('app-logo-placeholder')).not.toBeNull();
    expect(el.querySelector('app-verify .modes')).toBeNull(); // sin búsqueda por código ni por nombre
    expect(text(el.querySelector('label[for="query"]'))).toBe('DNI del participante');
    expect(el.querySelector('#query')!.getAttribute('maxlength')).toBe('8');
  });

  it('valida el DNI peruano de 8 dígitos', async () => {
    const { el, consult } = await openPublic();
    await consult('1234');
    expect(text(el.querySelector('#query-error'))).toBe('Ingresa un DNI peruano válido: 8 dígitos numéricos.');
    expect(el.querySelector('[data-public-result], [data-public-empty]')).toBeNull();
  });

  it('un DNI con varios certificados: todos, con su resultado; vigente y anulado, sin datos privados', async () => {
    const { el, consult } = await openPublic();
    await consult('00000001');
    const results = [...el.querySelectorAll('[data-public-result]')];
    expect(results.map((r) => r.getAttribute('data-public-result')).sort()).toEqual(['IMC-2025-0099', 'IMC-DEMO-0001']);
    const valid = el.querySelector('[data-public-result="IMC-DEMO-0001"]')!;
    expect(text(valid.querySelector('.badge'))).toBe('Certificado válido');
    const data = (r: Element) => Object.fromEntries([...r.querySelectorAll('dl > div')].map((d) => [text(d.querySelector('dt')), text(d.querySelector('dd'))]));
    expect(data(valid)).toEqual({
      Titular: 'Ana Torres Quispe',
      Curso: 'Curso de demostración (nombre provisional)',
      Código: 'IMC-DEMO-0001',
      'Fecha de emisión': '12/10/2026',
      Estado: 'Vigente',
      'Resultado de la validación': 'Certificado válido',
    });
    const revoked = el.querySelector('[data-public-result="IMC-2025-0099"]')!;
    expect(text(revoked.querySelector('.badge'))).toBe('Este certificado no se encuentra vigente');
    expect(data(revoked)).toMatchObject({ Estado: 'Anulado', 'Resultado de la validación': 'Este certificado no se encuentra vigente' });
    // Solo los datos indispensables: ni DNI, ni nota, ni horas, ni correo.
    const all = results.map(text).join(' ');
    expect(all).not.toContain('00000001');
    expect(all).not.toMatch(/Nota|Horas|@|Puntaje/);
    expect([...valid.querySelectorAll('dt')].map(text)).toEqual(['Titular', 'Curso', 'Código', 'Fecha de emisión', 'Estado', 'Resultado de la validación']);
  });

  it('un DNI sin certificados muestra el mensaje acordado', async () => {
    const { el, consult } = await openPublic();
    await consult('00000006');
    expect(text(el.querySelector('[data-public-empty] h2'))).toBe('No se encontraron certificados asociados al DNI ingresado');
  });

  it('la verificación anterior (/verificar) sigue igual: por código y por DNI', async () => {
    prepare();
    TestBed.configureTestingModule({
      providers: [provideRouter(routes, withComponentInputBinding()), { provide: DataRepository, useClass: MockDataRepository }],
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/verificar/IMC-DEMO-0001');
    const el = harness.fixture.nativeElement as HTMLElement;
    await until(harness, () => !!el.querySelector('.result'));
    expect(text(el.querySelector('app-verify h1'))).toBe('Verificar certificado');
    expect(el.querySelectorAll('app-verify .modes button')).toHaveLength(2);
    expect(text(el.querySelector('.result .badge'))).toBe('Certificado válido');
    expect(el.querySelector('[data-public-result]')).toBeNull();
  });
});
