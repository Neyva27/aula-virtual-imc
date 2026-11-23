import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { AdminResults } from './admin-results';
import { DataRepository } from '../../core/services/data-repository';
import { MockDataRepository, STORAGE_KEY } from '../../core/services/mock-data-repository';
import { DemoState } from '../../core/data/demo-state';
import { Attempt } from '../../core/models/exam.model';
import { Recovery } from '../../core/models/recovery.model';
import { readSheet } from '../../core/utils/testing/read-xlsx';

/**
 * R8: «Exportar a Excel» en «Evaluaciones rendidas». Se descarga el archivo real desde la pantalla y se lee su ZIP y su
 * hoja: siete columnas exactas (DNI y Empresa desde el 23/11/2026), solo resultados definitivos (nota vigente de R4), certificación desde los
 * certificados existentes y los mismos filtros de R7. Datos ficticios.
 *
 * Escenario (c1 = «Curso de demostración (nombre provisional)», c-mkt = Marketing, c-ia = IA):
 * - Ana c1: aprobada 80, certificado vigente → incluida. Ana c-ia: ausente que no rindió su recuperación → incluida sin nota.
 * - Carla c1: regular 50 → recuperación 70 aprobada con certificado → incluida con 70.
 * - Jorge c1: aprobado 90 sin certificado vigente (uno revocado) → «Pendiente».
 * - Luis c-mkt: regular 40 → recuperación 20 (menor) → incluida con 20. Luis c1: no rindió → excluido.
 * - Pedro c-mkt: regular 30 y no rindió la recuperación → incluida con 30. Pedro c1: recuperación en curso → excluido.
 *   Pedro c-ia: no rindió → excluido.
 * - Rosa c1: pendiente de calificación → excluida.
 */
const H = 3_600_000;
const C1 = 'Curso de demostración (nombre provisional)';
const MKT = 'Fundamentos del Marketing Digital';
const IA = 'Introducción a la Inteligencia Artificial';
const HEADERS = ['Estudiante', 'DNI', 'Empresa', 'Curso', 'Nota final', 'Estado', 'Certificación'];
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

const ROWS = {
  ana: ['Ana Torres Quispe', C1, '80 / 100', 'Aprobado', 'Certificado emitido'],
  carla: ['Carla Vega Soto', C1, '70 / 100', 'Aprobado', 'Certificado emitido'],
  jorge: ['Jorge Salas León', C1, '90 / 100', 'Aprobado', 'Pendiente'],
  luisMkt: ['Luis Mendoza Rojas', MKT, '20 / 100', 'Desaprobado', 'Pendiente'],
  pedroMkt: ['Pedro Ramos Díaz', MKT, '30 / 100', 'Desaprobado', 'Pendiente'],
  anaIa: ['Ana Torres Quispe', IA, '', 'Desaprobado', 'Pendiente'],
};

function scenario(extra: (s: DemoState) => void = () => undefined): void {
  localStorage.clear();
  sessionStorage.clear();
  new MockDataRepository().resetDemo();
  const s = stored();
  const base = s.attempts.find((a) => a.id === 'att2')!;
  const att = (over: Partial<Attempt>): Attempt => ({ ...base, date: new Date(Date.now() - 3 * H).toISOString(), ...over });
  const rec = (over: Partial<Recovery>): Recovery => ({
    id: 'r', userId: 'u3', courseId: 'c1', regularExamId: 'c1-e1', examId: 'c1-e1', reason: 'desaprobado', mode: 'original',
    opensAt: new Date(Date.now() - 6 * H).toISOString(), closesAt: new Date(Date.now() - 4 * H).toISOString(),
    authorizedBy: 'a1', authorizedAt: new Date(Date.now() - 7 * H).toISOString(), ...over,
  });
  const cert = s.certificates[0];
  // Carla: recuperación aprobada (70) con su certificado.
  s.recoveries.push(rec({ id: 'r-carla', startedAt: new Date(Date.now() - 5 * H).toISOString(), attemptId: 'att-carla' }));
  s.attempts.push(att({ id: 'att-carla', kind: 'recuperacion', recoveryId: 'r-carla', score: 70, passed: true, date: new Date(Date.now() - 2 * H).toISOString() }));
  s.certificates.push({ ...cert, id: 'cert-carla', code: 'IMC-DEMO-0050', userId: 'u3', attemptId: 'att-carla', score: 70 });
  s.enrollments.find((e) => e.userId === 'u3' && e.courseId === 'c1')!.status = 'aprobado';
  // Jorge: solo un certificado revocado.
  s.certificates.push({ ...cert, id: 'cert-jorge', code: 'IMC-DEMO-0051', userId: 'u6', attemptId: 'att3', status: 'revocado' });
  // Rosa: evaluación con una pregunta abierta sin calificar.
  s.attempts.push(att({ id: 'att-rosa', userId: 'u5', score: 0, passed: false, review: { status: 'en_revision', manualScores: {} } }));
  // Pedro c1 (sin intento): recuperación autorizada con la ventana abierta.
  s.recoveries.push(rec({ id: 'r-pedro-c1', userId: 'u4', reason: 'ausente', closesAt: new Date(Date.now() + 3 * H).toISOString() }));
  // Luis c-mkt: regular 40 y recuperación 20.
  s.attempts.push(att({ id: 'att-luis', userId: 'u2', courseId: 'c-mkt', examId: 'c-mkt-e1', score: 40 }));
  s.recoveries.push(rec({ id: 'r-luis', userId: 'u2', courseId: 'c-mkt', regularExamId: 'c-mkt-e1', examId: 'c-mkt-e1', startedAt: new Date(Date.now() - 5 * H).toISOString(), attemptId: 'att-luis-r' }));
  s.attempts.push(att({ id: 'att-luis-r', userId: 'u2', courseId: 'c-mkt', examId: 'c-mkt-e1', kind: 'recuperacion', recoveryId: 'r-luis', score: 20, date: new Date(Date.now() - H).toISOString() }));
  // Pedro c-mkt: regular 30 y no rindió la recuperación (vencida sin iniciar).
  s.attempts.push(att({ id: 'att-pedro', userId: 'u4', courseId: 'c-mkt', examId: 'c-mkt-e1', score: 30 }));
  s.recoveries.push(rec({ id: 'r-pedro-mkt', userId: 'u4', courseId: 'c-mkt', regularExamId: 'c-mkt-e1', examId: 'c-mkt-e1' }));
  // Ana c-ia: ausente que no rindió su recuperación.
  s.recoveries.push(rec({ id: 'r-ana-ia', userId: 'u1', courseId: 'c-ia', regularExamId: 'c-ia-e1', examId: 'c-ia-e1', reason: 'ausente' }));
  extra(s);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
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

async function page(query = '') {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: 'instructor/evaluaciones-rendidas', component: AdminResults }], withComponentInputBinding()),
      { provide: DataRepository, useClass: MockDataRepository },
    ],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(`/instructor/evaluaciones-rendidas${query}`, AdminResults);
  const el = harness.routeNativeElement as HTMLElement;
  await until(harness, () => !!el.querySelector('[data-export]') && !!el.querySelector('[data-recoveries][data-loaded]'));
  const exportButton = () => [...el.querySelectorAll<HTMLButtonElement>('[data-export] button')].find((b) => text(b) === 'Exportar a Excel')!;
  /** Pulsa «Exportar a Excel» y lee el archivo descargado. */
  const download = async () => {
    exportButton().click();
    await harness.fixture.whenStable();
    const file = downloads.at(-1)!;
    const bytes = new Uint8Array(await file.blob.arrayBuffer());
    return { name: file.name, type: file.blob.type, ...readSheet(bytes) };
  };
  const excluded = (key: string) => text(el.querySelector(`[data-excluded="${key}"]`));
  return { harness, el, exportButton, download, excluded };
}

/** Fila esperada con el DNI y la empresa REALES del estudiante en los datos guardados (sin empresa: se indica). */
const withIdentity = (r: readonly string[]): string[] => {
  const s = stored();
  const u = s.users.find((x) => x.fullName === r[0])!;
  return [r[0], u.dni ?? 'No registrado', s.companies.find((c) => c.id === u.companyId)?.name ?? 'Sin empresa', ...r.slice(1)];
};
const sortRows = (rows: string[][]) => [...rows].sort((a, b) => a.join('|').localeCompare(b.join('|')));

describe('R8: exportar Evaluaciones rendidas a Excel', () => {
  it('sin filtros: siete columnas exactas, solo resultados definitivos y exclusiones informadas', async () => {
    scenario();
    const before = { attempts: stored().attempts, certificates: stored().certificates };
    const p = await page();
    expect(text(p.el.querySelector('[data-export-summary]'))).toBe('Se exportarán 6 resultados definitivos.');
    expect(p.excluded('pendientes')).toBe('1 excluido: pendiente de calificación.');
    expect(p.excluded('sin-rendir')).toBe('2 excluidos: todavía no rindió.');
    expect(p.excluded('recuperacion')).toBe('1 excluido: recuperación en curso.');

    const file = await p.download();
    const today = new Date(Date.now() - 5 * H).toISOString().slice(0, 10);
    expect(file.name).toBe(`evaluaciones-rendidas-${today}.xlsx`);
    expect(file.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(file.rows[0]).toEqual(HEADERS); // exactamente, en orden
    expect(file.rows[0]).not.toContain('Recuperación');
    expect(file.rows.every((r) => r.length === 7)).toBe(true);
    expect(file.formulas).toBe(0);
    expect(sortRows(file.rows.slice(1))).toEqual(sortRows(Object.values(ROWS).map(withIdentity)));
    expect(file.rows.slice(1).every((r) => /^\d{8}$/.test(r[1]) && r[2] !== '')).toBe(true);
    // Un resultado por estudiante y curso (sin duplicar por varios intentos).
    expect(new Set(file.rows.slice(1).map((r) => `${r[0]}|${r[3]}`)).size).toBe(file.rows.length - 1);
    expect(new Set(file.rows.slice(1).map((r) => r[5]))).toEqual(new Set(['Aprobado', 'Desaprobado']));
    expect(new Set(file.rows.slice(1).map((r) => r[6]))).toEqual(new Set(['Certificado emitido', 'Pendiente']));
    expect(text(p.el.querySelector('[data-export-message]'))).toBe(`Se descargó «evaluaciones-rendidas-${today}.xlsx» con 6 resultados.`);
    // Exportar no cambia intentos ni certificados (tampoco el revocado).
    expect(stored().attempts).toEqual(before.attempts);
    expect(stored().certificates).toEqual(before.certificates);
  }, 40_000);

  it('valores: recuperación que reemplaza (mayor y menor), no rendida, revocado y ausente sin nota', async () => {
    scenario();
    const rows = (await (await page()).download()).rows.slice(1);
    const find = (name: string, course: string) => rows.find((r) => r[0] === name && r[3] === course);
    expect(find('Carla Vega Soto', C1)).toEqual(withIdentity(ROWS.carla)); // 70 reemplaza a 50
    expect(find('Luis Mendoza Rojas', MKT)).toEqual(withIdentity(ROWS.luisMkt)); // 20 (menor) reemplaza a 40
    expect(find('Pedro Ramos Díaz', MKT)).toEqual(withIdentity(ROWS.pedroMkt)); // no rindió: conserva su nota regular
    expect(find('Jorge Salas León', C1)).toEqual(withIdentity(ROWS.jorge)); // certificado revocado = «Pendiente»
    expect(find('Ana Torres Quispe', IA)).toEqual(withIdentity(ROWS.anaIa)); // sin nota inventada
    expect(find('Rosa Cruz Huamán', C1)).toBeUndefined(); // pendiente de calificación
    expect(find('Luis Mendoza Rojas', C1)).toBeUndefined(); // todavía no rindió
    expect(find('Pedro Ramos Díaz', C1)).toBeUndefined(); // recuperación en curso
    expect(rows.some((r) => r.includes('50 / 100') || r.includes('40 / 100'))).toBe(false); // notas reemplazadas
  }, 40_000);

  it.each([
    ['curso', '?curso=c1', [ROWS.ana, ROWS.carla, ROWS.jorge], { pendientes: 1, 'sin-rendir': 1, recuperacion: 1 }],
    ['estudiante', '?estudiante=u4', [ROWS.pedroMkt], { pendientes: 0, 'sin-rendir': 1, recuperacion: 1 }],
    ['empresa', '?empresa=emp-a', [ROWS.ana, ROWS.carla, ROWS.luisMkt, ROWS.anaIa], { pendientes: 0, 'sin-rendir': 1, recuperacion: 0 }],
    ['curso y empresa', '?curso=c1&empresa=emp-b', [ROWS.jorge], { pendientes: 1, 'sin-rendir': 0, recuperacion: 1 }],
    ['estudiante y curso', '?curso=c-mkt&estudiante=u2', [ROWS.luisMkt], { pendientes: 0, 'sin-rendir': 0, recuperacion: 0 }],
  ] as const)('filtro por %s: el archivo coincide con la pantalla', async (_label, query, expected, counts) => {
    scenario();
    const p = await page(query);
    const file = await p.download();
    expect(file.rows[0]).toEqual(HEADERS);
    expect(sortRows(file.rows.slice(1))).toEqual(sortRows(expected.map(withIdentity)));
    // Coincide con la tabla «Estado por inscripción» de la pantalla (mismos estudiantes y cursos).
    const shown = [...p.el.querySelectorAll('tr[data-row]')].map((r) => `${text(r.querySelector('[data-label="Participante"]'))}|${text(r.querySelector('[data-label="Curso"]'))}`);
    for (const r of file.rows.slice(1)) expect(shown).toContain(`${r[0]}|${r[3]}`);
    for (const [key, n] of Object.entries(counts)) {
      if (n === 0) expect(p.el.querySelector(`[data-excluded="${key}"]`)).toBeNull();
      else expect(p.excluded(key)).toMatch(new RegExp(`^${n} excluidos?:`));
    }
  }, 40_000);

  it('filtro «Sin empresa»: solo los estudiantes sin empresa', async () => {
    scenario((s) => delete s.users.find((u) => u.id === 'u2')!.companyId);
    const file = await (await page('?empresa=sin-empresa')).download();
    expect(file.rows.slice(1)).toEqual([withIdentity(ROWS.luisMkt)]);
    expect(file.rows[1][2]).toBe('Sin empresa'); // dato faltante: se indica, no se inventa
  }, 40_000);

  it('caracteres especiales y valores que parecen fórmulas se exportan como texto', async () => {
    scenario((s) => (s.users.find((u) => u.id === 'u6')!.fullName = '=HIPERVINCULO("x") Ñúñez & <Jorge> "J"'));
    const file = await (await page('?estudiante=u6')).download();
    expect(file.rows.slice(1)).toEqual([['=HIPERVINCULO("x") Ñúñez & <Jorge> "J"', stored().users.find((u) => u.id === 'u6')!.dni!, 'Empresa de Demostración B', C1, '90 / 100', 'Aprobado', 'Pendiente']]);
    expect(file.formulas).toBe(0);
  }, 40_000);

  it('sin resultados exportables: lo informa y no descarga nada', async () => {
    scenario();
    const p = await page('?estudiante=u5'); // Rosa: solo una evaluación pendiente de calificación
    expect(text(p.el.querySelector('[data-export-summary]'))).toBe('No hay resultados definitivos para exportar con estos filtros.');
    expect(p.exportButton().disabled).toBe(true);
    expect(p.excluded('pendientes')).toBe('1 excluido: pendiente de calificación.');
    const component = p.harness.routeDebugElement!.componentInstance as AdminResults;
    component.exportExcel(); // aunque se invoque igual
    await p.harness.fixture.whenStable();
    expect(downloads).toEqual([]);
    expect(text(p.el.querySelector('[data-export-message]'))).toBe('No hay resultados definitivos para exportar con estos filtros: no se generó ningún archivo.');
  }, 30_000);
});
