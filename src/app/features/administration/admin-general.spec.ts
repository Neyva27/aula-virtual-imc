import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { APP_ENVIRONMENT } from '../../core/config/app-environment';
import { authInterceptor } from '../../core/http/auth.interceptor';
import { DashboardStats } from '../../core/models/admin.model';
import { buildPdfReport } from '../../core/utils/pdf-report';
import { AdminCompanies } from './admin-companies';
import { DashboardCharts } from './dashboard-charts';

/** Administración general (empresas), gráficos del panel y reporte PDF. Solo HttpTestingController. */
const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

function configure() {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([authInterceptor])),
      provideHttpClientTesting(),
      { provide: APP_ENVIRONMENT, useValue: { authMode: 'api', apiUrl: '/api/v1', sessionRestoreTimeoutMs: 5000 } },
    ],
  });
  return TestBed.inject(HttpTestingController);
}

async function render<T>(fixture: ComponentFixture<T>) {
  await fixture.whenStable();
  fixture.detectChanges();
}

const button = (scope: Element, label: string) =>
  [...scope.querySelectorAll<HTMLButtonElement>('button')].find((b) => text(b) === label || b.getAttribute('aria-label') === label)!;

function type(el: HTMLElement, selector: string, value: string): void {
  const input = el.querySelector<HTMLInputElement>(selector)!;
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

const COMPANY = { id: 'emp-1', name: 'Constructora Uno', ruc: '20123456789', contactEmail: null, active: true, createdAt: '', updatedAt: '' };

describe('Empresas (administración general)', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('lista, crea (POST) y desactiva (POST deactivate) con mensajes del servidor', async () => {
    const ctrl = configure();
    const fixture = TestBed.createComponent(AdminCompanies);
    const el = fixture.nativeElement as HTMLElement;
    ctrl.expectOne((r) => r.url === '/api/v1/admin/companies').flush([COMPANY]);
    await render(fixture);
    expect(text(el.querySelector('tr[data-company="emp-1"]'))).toContain('Constructora Uno');

    button(el, 'Nueva empresa').click();
    await render(fixture);
    type(el, '#c-name', 'Minera Dos');
    type(el, '#c-ruc', '20999999999');
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    const create = ctrl.expectOne((r) => r.url === '/api/v1/admin/companies' && r.method === 'POST');
    expect(create.request.body).toEqual({ name: 'Minera Dos', ruc: '20999999999', contactEmail: null });
    create.flush({ ...COMPANY, id: 'emp-2', name: 'Minera Dos' });
    ctrl.expectOne((r) => r.url === '/api/v1/admin/companies' && r.method === 'GET').flush([COMPANY]);
    await render(fixture);
    expect(text(el.querySelector('[data-test="message"]'))).toBe('Empresa «Minera Dos» creada.');

    button(el, 'Desactivar Constructora Uno').click();
    ctrl.expectOne('/api/v1/admin/companies/emp-1/deactivate').flush({ ...COMPANY, active: false });
    ctrl.expectOne((r) => r.url === '/api/v1/admin/companies' && r.method === 'GET').flush([{ ...COMPANY, active: false }]);
    await render(fixture);
    expect(text(el.querySelector('tr[data-company="emp-1"]'))).toContain('Desactivada');
  });

  it('RUC repetido (409): mensaje del servidor', async () => {
    const ctrl = configure();
    const fixture = TestBed.createComponent(AdminCompanies);
    const el = fixture.nativeElement as HTMLElement;
    ctrl.expectOne((r) => r.url === '/api/v1/admin/companies').flush([]);
    await render(fixture);
    button(el, 'Nueva empresa').click();
    await render(fixture);
    type(el, '#c-name', 'X');
    type(el, '#c-ruc', '20123456789');
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    ctrl
      .expectOne((r) => r.method === 'POST')
      .flush({ statusCode: 409, message: 'Ya existe una empresa con ese RUC.' }, { status: 409, statusText: 'Conflict' });
    await render(fixture);
    expect(text(el.querySelector('[data-test="error"]'))).toBe('Ya existe una empresa con ese RUC.');
  });
});

describe('Gráficos del Dashboard (GET /dashboard)', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  const STATS: DashboardStats = {
    participants: { total: 5, active: 3, pendingActivation: 2, inactive: 0 },
    courses: { total: 2, published: 1, active: 2 },
    enrollments: { total: 4, byStatus: { pendiente: 1, en_progreso: 1, listo_examen: 0, en_revision: 0, aprobado: 1, desaprobado: 1 } },
    evaluations: { total: 2, approved: 1, failed: 1, inReview: 0 },
    certificates: { issued: 1 },
    activity: Array.from({ length: 14 }, (_, i) => ({ date: `2026-11-${String(4 + i).padStart(2, '0')}`, attempts: i === 13 ? 2 : 0, certificates: i === 13 ? 1 : 0 })),
    recent: [{ type: 'certificado', date: '2026-11-17T15:00:00.000Z', courseName: 'Seguridad', studentId: 'u1', passed: true, inReview: false }],
  };

  it('indicadores, columnas por serie con leyenda, tabla equivalente y actividad reciente con nombres', async () => {
    const ctrl = configure();
    const fixture = TestBed.createComponent(DashboardCharts);
    const el = fixture.nativeElement as HTMLElement;
    ctrl.expectOne('/api/v1/dashboard').flush(STATS);
    ctrl.expectOne((r) => r.url === '/api/v1/students').flush({ items: [{ id: 'u1', email: 'a@b.pe', firstNames: 'Ana', lastNames: 'T', fullName: 'Ana T', dni: '12345678', active: true, companies: [] }], total: 1, page: 1, pageSize: 100 });
    await render(fixture);
    expect(text(el.querySelector('[data-test="kpis"]'))).toContain('2 pendientes de activación');
    const chart = el.querySelector('svg[role="img"]')!;
    expect(chart.querySelectorAll('path')).toHaveLength(2); // solo los días con valores: 2 columnas
    expect([...el.querySelectorAll('.legend li')].map(text)).toEqual(['Evaluaciones rendidas', 'Certificados emitidos']);
    expect(chart.getAttribute('aria-label')).toContain('2 evaluaciones rendidas y 1 certificados');
    expect(el.querySelectorAll('details tbody tr')).toHaveLength(14);
    expect(text(el.querySelector('.recent'))).toContain('Ana T');
    expect(text(el.querySelector('.hbars'))).toContain('Aprobadas');
  });

  it('si falla el servidor, informa el error (sin cifras inventadas)', async () => {
    const ctrl = configure();
    const fixture = TestBed.createComponent(DashboardCharts);
    const el = fixture.nativeElement as HTMLElement;
    ctrl.expectOne('/api/v1/dashboard').flush({ statusCode: 500, message: 'x' }, { status: 500, statusText: 'Error' });
    // forkJoin cancela la consulta de estudiantes al fallar la de indicadores.
    ctrl.match((r) => r.url === '/api/v1/students').filter((r) => !r.cancelled).forEach((r) => r.flush({ items: [], total: 0, page: 1, pageSize: 100 }));
    await render(fixture);
    expect(text(el)).toContain('No se pudieron cargar los indicadores del servidor');
    expect(el.querySelector('[data-test="kpis"]')).toBeNull();
  });
});

describe('Reporte PDF', () => {
  it('pagina las filas, repite el encabezado y numera las páginas', () => {
    const rows = Array.from({ length: 60 }, (_, i) => [`Participante ${i}`, 'Curso', '80 / 100']);
    const doc = buildPdfReport({ title: 'Reporte', headers: ['Participante', 'Curso', 'Nota'], rows });
    expect(doc.getNumberOfPages()).toBeGreaterThan(1);
    const empty = buildPdfReport({ title: 'Vacío', headers: ['A'], rows: [] });
    expect(empty.getNumberOfPages()).toBe(1);
  });
});
