import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AdminCertificates } from './admin-certificates';
import { DataRepository } from '../../core/services/data-repository';
import { MockDataRepository, STORAGE_KEY } from '../../core/services/mock-data-repository';
import { CertificateService } from '../../core/services/certificate.service';
import { DemoState } from '../../core/data/demo-state';
import { readSheet } from '../../core/utils/testing/read-xlsx';

/**
 * Certificados del Instructor (20/11/2026): filtros combinables por estudiante, código, empresa y fechas; «Limpiar
 * filtros», contador de resultados y exportaciones con TODOS los resultados filtrados. Datos ficticios de la demo:
 * Ana (u1) y Luis (u2) son de «Empresa de Demostración A»; Pedro (u4), de la B.
 */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const stored = (): DemoState => JSON.parse(localStorage.getItem(STORAGE_KEY)!);

async function until(fixture: ComponentFixture<unknown>, cond: () => boolean, timeout = 8000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    await fixture.whenStable();
    if (cond()) return;
    await sleep(25);
  }
  throw new Error('La condición no se cumplió a tiempo');
}

let downloads: { name: string; blob: Blob }[] = [];
let lastBlob: Blob | null = null;

beforeEach(() => {
  downloads = [];
  lastBlob = null;
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, writable: true, value: vi.fn((b: Blob) => ((lastBlob = b), 'blob:prueba')) });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, writable: true, value: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    downloads.push({ name: this.download, blob: lastBlob! });
  });
});
afterEach(() => vi.restoreAllMocks());

async function setup() {
  localStorage.clear();
  sessionStorage.clear();
  new MockDataRepository().resetDemo();
  const s = stored();
  const base = s.certificates[0]; // IMC-DEMO-0001 · Ana Torres Quispe · 12/10/2026
  s.certificates.push(
    { ...base, id: 'cert2', code: 'IMC-2026-0002', userId: 'u4', attemptId: 'att-x2', participantName: 'Pedro Ramos Díaz', participantDni: '00000004', issueDate: '2026-11-05', approvalDate: '2026-11-05' },
    { ...base, id: 'cert3', code: 'IMC-2026-0003', userId: 'u2', attemptId: 'att-x3', participantName: 'Luis Mendoza Rojas', participantDni: '00000002', issueDate: '2026-11-20', approvalDate: '2026-11-20', status: 'revocado' },
  );
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  TestBed.configureTestingModule({
    providers: [
      { provide: DataRepository, useClass: MockDataRepository },
      { provide: CertificateService, useValue: { qrDataUrl: () => Promise.resolve(null), downloadPdf: () => Promise.resolve() } },
    ],
  });
  const fixture = TestBed.createComponent(AdminCertificates);
  const el = fixture.nativeElement as HTMLElement;
  await until(fixture, () => el.querySelectorAll('tr[data-certificate]').length > 0);
  const codes = () => [...el.querySelectorAll('tr[data-certificate] .code')].map(text).sort();
  const type = async (selector: string, value: string, event = 'input') => {
    const input = el.querySelector<HTMLInputElement | HTMLSelectElement>(selector)!;
    input.value = value;
    input.dispatchEvent(new Event(event));
    await fixture.whenStable();
  };
  const button = (label: string) => [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => text(b) === label)!;
  const search = async () => {
    button('Buscar').click();
    await until(fixture, () => !fixture.componentInstance.searching());
  };
  return { fixture, el, codes, type, button, search };
}

describe('Certificados del Instructor: filtros (20/11/2026)', () => {
  it('muestra la empresa, el selector de empresas, el estado y el número de resultados', async () => {
    const { el, codes } = await setup();
    expect(codes()).toEqual(['IMC-2026-0002', 'IMC-2026-0003', 'IMC-DEMO-0001']);
    expect([...el.querySelectorAll('#cert-company option')].map(text)).toEqual(['Todas las empresas', 'Empresa de Demostración A', 'Empresa de Demostración B']);
    const pedro = el.querySelector('tr[data-certificate="cert2"]')!;
    expect(text(pedro.querySelector('[data-label="Empresa"]'))).toBe('Empresa de Demostración B');
    expect(text(el.querySelector('tr[data-certificate="cert3"] [data-label="Estado"]'))).toBe('Revocado');
    expect(text(el.querySelector('[data-test="result-count"]'))).toBe('3 certificados encontrados · 2 vigentes, 1 revocado');
    expect([...el.querySelectorAll('thead th')].map(text)).toEqual(['Código', 'Participante', 'Empresa', 'Curso', 'Fecha de emisión', 'Estado', 'Acciones']);
  });

  it('por estudiante: nombre, apellido, nombre completo, parcial, sin mayúsculas ni tildes', async () => {
    const { codes, type, search } = await setup();
    await type('#cert-student', 'mendoza');
    await search();
    expect(codes()).toEqual(['IMC-2026-0003']);
    await type('#cert-student', 'PEDRO ramos');
    await search();
    expect(codes()).toEqual(['IMC-2026-0002']);
    await type('#cert-student', 'diaz');
    await search();
    expect(codes()).toEqual(['IMC-2026-0002']);
    await type('#cert-student', 'tor');
    await search();
    expect(codes()).toEqual(['IMC-DEMO-0001']);
  });

  it('por código, empresa y fechas; se combinan; «Limpiar filtros» vuelve a todos', async () => {
    const { fixture, el, codes, type, search, button } = await setup();
    await type('#cert-code', '2026');
    await search();
    expect(codes()).toEqual(['IMC-2026-0002', 'IMC-2026-0003']);
    expect(text(el.querySelector('[data-test="result-count"]'))).toContain('2 certificados encontrados con los filtros aplicados');
    await type('#cert-code', '');
    await type('#cert-company', 'emp-b', 'change');
    await search();
    expect(codes()).toEqual(['IMC-2026-0002']);
    // Empresa A + estudiante + código + rango de fechas.
    await type('#cert-company', 'emp-a', 'change');
    await type('#cert-student', 'ana');
    await type('#cert-code', 'imc-demo');
    await type('#cert-from', '2026-10-01', 'change');
    await type('#cert-to', '2026-10-31', 'change');
    await search();
    expect(codes()).toEqual(['IMC-DEMO-0001']);
    await type('#cert-from', '2026-11-01', 'change');
    await search();
    expect(text(el.querySelector('.alert-danger'))).toContain('no puede ser posterior');
    await type('#cert-student', '');
    await type('#cert-code', '');
    await type('#cert-company', '', 'change');
    await type('#cert-to', '', 'change');
    await search();
    expect(codes()).toEqual(['IMC-2026-0002', 'IMC-2026-0003']); // emitidos desde el 01/11/2026
    await type('#cert-from', '2026-12-01', 'change');
    await search();
    expect(codes()).toEqual([]);
    expect(text(el.querySelector('[data-test="no-match"]'))).toContain('No hay certificados que coincidan');
    button('Limpiar filtros').click();
    await fixture.whenStable();
    expect(codes()).toEqual(['IMC-2026-0002', 'IMC-2026-0003', 'IMC-DEMO-0001']);
  });

  it('«Limpiar filtros» deja todos los campos vacíos y muestra todos los certificados', async () => {
    const { fixture, el, codes, type, search, button } = await setup();
    await type('#cert-student', 'luis');
    await type('#cert-company', 'emp-a', 'change');
    await search();
    expect(codes()).toEqual(['IMC-2026-0003']);
    button('Limpiar filtros').click();
    await fixture.whenStable();
    expect(codes()).toEqual(['IMC-2026-0002', 'IMC-2026-0003', 'IMC-DEMO-0001']);
    expect(el.querySelector<HTMLInputElement>('#cert-student')!.value).toBe('');
    expect(el.querySelector<HTMLSelectElement>('#cert-company')!.value).toBe('');
  });

  it('las exportaciones respetan los filtros e incluyen todos los resultados filtrados', async () => {
    const { fixture, el, type, search, button } = await setup();
    await type('#cert-company', 'emp-a', 'change');
    await search();
    button('Exportar a Excel').click();
    const file = downloads.at(-1)!;
    expect(file.name).toMatch(/^certificados-\d{4}-\d{2}-\d{2}\.xlsx$/);
    const { rows } = readSheet(new Uint8Array(await file.blob.arrayBuffer()));
    expect(rows[0]).toEqual(['Código', 'Participante', 'DNI', 'Empresa', 'Curso', 'Nota', 'Fecha de emisión', 'Estado']);
    expect(rows.slice(1).map((r) => [r[0], r[3], r[7]]).sort()).toEqual([
      ['IMC-2026-0003', 'Empresa de Demostración A', 'Revocado'],
      ['IMC-DEMO-0001', 'Empresa de Demostración A', 'Vigente'],
    ]);
    await fixture.whenStable();
    expect(text(el)).toContain('con 2 certificados');
    button('Exportar a PDF').click();
    await fixture.whenStable();
    expect(text(el)).toContain('.pdf» con 2 certificados');
  });
});
