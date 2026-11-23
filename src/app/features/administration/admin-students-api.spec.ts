import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { APP_ENVIRONMENT } from '../../core/config/app-environment';
import { authInterceptor } from '../../core/http/auth.interceptor';
import { Student, StudentCompany } from '../../core/models/student.model';
import { CourseRecord, Enrollment } from '../../core/models/course.model';
import { STORAGE_KEY } from '../../core/services/mock-data-repository';
import { AdminStudentsApi, SEARCH_DEBOUNCE_MS } from './admin-students-api';

/** Participantes conectados al servidor (modo API). Solo HttpTestingController: no se escribe en ninguna base. */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

const COMPANIES: StudentCompany[] = [
  { id: 'emp-1', name: 'Empresa Uno', ruc: '20123456789', active: true },
  { id: 'emp-2', name: 'Empresa Dos', ruc: '20987654321', active: true },
  { id: 'emp-off', name: 'Empresa Inactiva', ruc: '20555555555', active: false },
];

function student(id: string, overrides: Partial<Student> = {}): Student {
  return {
    id,
    email: `${id}@empresa.pe`,
    firstNames: `Nombre ${id}`,
    lastNames: 'Apellido',
    fullName: `Nombre ${id} Apellido`,
    dni: `1${id.replace(/\D/g, '').padStart(7, '0')}`,
    active: true,
    companies: [COMPANIES[0]],
    ...overrides,
  };
}

const page = (items: Student[], total = items.length, p = 1, pageSize = 20) => ({ items, total, page: p, pageSize });
const COURSES: CourseRecord[] = [
  { id: 'c-1', name: 'Seguridad en altura', description: 'D', status: 'publicado', trainingHours: 4, coverImage: null, isDemo: false },
  { id: 'c-2', name: 'Primeros auxilios', description: 'D', status: 'borrador', trainingHours: 2, coverImage: null, isDemo: false },
];

interface Ctx {
  fixture: ComponentFixture<AdminStudentsApi>;
  el: HTMLElement;
  ctrl: HttpTestingController;
}

async function render(ctx: Ctx): Promise<void> {
  await ctx.fixture.whenStable();
  ctx.fixture.detectChanges();
}

const listReq = (ctrl: HttpTestingController): TestRequest => ctrl.expectOne((r) => r.url === '/api/v1/students' && r.method === 'GET');

async function setup(
  options: { companies?: StudentCompany[]; students?: ReturnType<typeof page>; enrollments?: Enrollment[]; companiesError?: boolean } = {},
): Promise<Ctx> {
  localStorage.clear();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([authInterceptor])),
      provideHttpClientTesting(),
      { provide: APP_ENVIRONMENT, useValue: { authMode: 'api', apiUrl: '/api/v1', sessionRestoreTimeoutMs: 5000 } },
    ],
  });
  const fixture = TestBed.createComponent(AdminStudentsApi);
  const ctx = { fixture, el: fixture.nativeElement as HTMLElement, ctrl: TestBed.inject(HttpTestingController) };
  const companiesReq = ctx.ctrl.expectOne('/api/v1/students/companies');
  if (options.companiesError) companiesReq.flush({ statusCode: 500, message: 'Error interno.' }, { status: 500, statusText: 'Error' });
  else companiesReq.flush(options.companies ?? COMPANIES);
  ctx.ctrl.expectOne('/api/v1/courses').flush(COURSES);
  ctx.ctrl.expectOne('/api/v1/enrollments').flush(options.enrollments ?? []);
  const first = listReq(ctx.ctrl);
  expect(first.request.params.get('page')).toBe('1');
  expect(first.request.params.get('pageSize')).toBe('20');
  first.flush(options.students ?? page([student('u1'), student('u2', { companies: [COMPANIES[1]] })]));
  await render(ctx);
  return ctx;
}

const rows = (el: HTMLElement) => [...el.querySelectorAll<HTMLTableRowElement>('tr[data-student]')].map((r) => r.dataset['student']);
const button = (scope: Element, label: string) =>
  [...scope.querySelectorAll<HTMLButtonElement>('button')].find((b) => text(b) === label || b.getAttribute('aria-label') === label)!;

function type(el: HTMLElement, selector: string, value: string): void {
  const input = el.querySelector<HTMLInputElement>(selector)!;
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

async function openForm(ctx: Ctx, mode: 'none' | 'existing' | 'new' = 'existing'): Promise<void> {
  button(ctx.el, 'Registrar participante').click();
  await render(ctx);
  // 20/11/2026: la empresa se elige con «Sin empresa», «Empresa registrada» o «Empresa nueva».
  ctx.el.querySelector<HTMLInputElement>(`input[name="companyMode"][value="${mode}"]`)!.click();
  await render(ctx);
}

async function fillValid(ctx: Ctx, companyId = 'emp-1'): Promise<void> {
  type(ctx.el, '#p-first', 'Ana María');
  type(ctx.el, '#p-last', 'Torres Quispe');
  type(ctx.el, '#p-email', 'ana@empresa.pe');
  type(ctx.el, '#p-dni', '12345678');
  ctx.el.querySelector<HTMLInputElement>(`[data-company="${companyId}"] input`)!.click();
  await render(ctx);
}

async function submit(ctx: Ctx): Promise<void> {
  ctx.el.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
  await render(ctx);
}

describe('Participantes en modo API (datos reales del servidor)', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  describe('listado', () => {
    it('muestra los estudiantes del servidor, con DNI y empresas; sin datos ni avisos de demostración', async () => {
      const { el } = await setup();
      expect(rows(el)).toEqual(['u1', 'u2']);
      expect(text(el.querySelector('tr[data-student="u2"]'))).toContain('Empresa Dos');
      expect(text(el)).not.toMatch(/demostración|demo1234/i);
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull(); // no se creó el estado de la demostración
    });

    it('búsqueda: espera a que se deje de escribir y vuelve a la página 1', async () => {
      const ctx = await setup();
      type(ctx.el, '#filter', 'an');
      type(ctx.el, '#filter', 'ana');
      ctx.ctrl.expectNone((r) => r.url === '/api/v1/students'); // aún no
      await sleep(SEARCH_DEBOUNCE_MS + 50);
      const req = listReq(ctx.ctrl);
      expect(req.request.params.get('q')).toBe('ana');
      expect(req.request.params.get('page')).toBe('1');
      req.flush(page([]));
      await render(ctx);
      expect(text(ctx.el.querySelector('[data-test="empty"]'))).toBe('No hay participantes que coincidan.');
    });

    it('filtro por empresa: envía companyId', async () => {
      const ctx = await setup();
      const select = ctx.el.querySelector<HTMLSelectElement>('#company-filter')!;
      expect([...select.options].map((o) => o.textContent?.trim())).toEqual(['Todas las empresas', 'Empresa Uno', 'Empresa Dos', 'Empresa Inactiva']);
      select.value = 'emp-2';
      select.dispatchEvent(new Event('change'));
      const req = listReq(ctx.ctrl);
      expect(req.request.params.get('companyId')).toBe('emp-2');
      expect(req.request.params.get('page')).toBe('1');
      req.flush(page([student('u2', { companies: [COMPANIES[1]] })]));
      await render(ctx);
      expect(rows(ctx.el)).toEqual(['u2']);
    });

    it('paginación según el total del servidor', async () => {
      const first = Array.from({ length: 20 }, (_, i) => student(`u${i + 1}`));
      const ctx = await setup({ students: page(first, 45) });
      expect(text(ctx.el.querySelector('[data-test="range"]'))).toBe('Mostrando 1–20 de 45');
      expect(text(ctx.el.querySelector('[data-test="page"]'))).toBe('Página 1 de 3');
      expect(button(ctx.el, 'Anterior').disabled).toBe(true);

      button(ctx.el, 'Siguiente').click();
      const req = listReq(ctx.ctrl);
      expect(req.request.params.get('page')).toBe('2');
      req.flush(page([student('u21')], 45, 2));
      await render(ctx);
      expect(text(ctx.el.querySelector('[data-test="page"]'))).toBe('Página 2 de 3');
      expect(text(ctx.el.querySelector('[data-test="range"]'))).toBe('Mostrando 21–21 de 45');
      expect(rows(ctx.el)).toEqual(['u21']);
    });

    it('si falla el servidor se informa el error y NO se muestran datos de otra fuente', async () => {
      const ctx = await setup();
      type(ctx.el, '#filter', 'x');
      await sleep(SEARCH_DEBOUNCE_MS + 50);
      listReq(ctx.ctrl).flush({ statusCode: 500, message: 'Error interno' }, { status: 500, statusText: 'Server Error' });
      await render(ctx);
      expect(rows(ctx.el)).toEqual([]);
      expect(text(ctx.el.querySelector('[data-test="list-error"]'))).toContain('No se pudo cargar el listado');
      expect(text(ctx.el)).not.toMatch(/Ana Torres Quispe|ejemplo\.test/); // ningún dato de la semilla de demostración
    });

    it('detalle: GET /students/:id', async () => {
      const ctx = await setup();
      button(ctx.el, 'Ver detalle de Nombre u1 Apellido').click();
      const req = ctx.ctrl.expectOne('/api/v1/students/u1');
      req.flush(student('u1', { firstNames: 'Ana', lastNames: 'Torres', fullName: 'Ana Torres', companies: COMPANIES.slice(0, 2) }));
      await render(ctx);
      const detail = text(ctx.el.querySelector('[data-test="detail"]'));
      expect(detail).toContain('Ana Torres');
      expect(detail).toContain('Empresa Uno RUC 20123456789');
      expect(detail).toContain('Empresa Dos RUC 20987654321');
    });

    it('detalle fuera del alcance (404): mensaje del servidor', async () => {
      const ctx = await setup();
      button(ctx.el, 'Ver detalle de Nombre u1 Apellido').click();
      ctx.ctrl.expectOne('/api/v1/students/u1').flush({ statusCode: 404, message: 'No se encontró el estudiante.' }, { status: 404, statusText: 'Not Found' });
      await render(ctx);
      expect(text(ctx.el.querySelector('[data-test="error"]'))).toBe('No se pudo consultar el participante: No se encontró el estudiante.');
      expect(ctx.el.querySelector('[data-test="detail"]')).toBeNull();
    });
  });

  describe('registro', () => {
    it('selector (opción A, 20/11/2026): empresas activas registradas; las desactivadas no se ofrecen', async () => {
      const ctx = await setup();
      await openForm(ctx);
      const boxes = [...ctx.el.querySelectorAll<HTMLLabelElement>('[data-company]')];
      expect(boxes.map((b) => b.dataset['company'])).toEqual(['emp-1', 'emp-2']);
      expect(boxes.map((b) => b.querySelector('input')!.disabled)).toEqual([false, false]);
    });

    it('busca por razón social (sin tildes ni mayúsculas) o por RUC y permite elegir varias', async () => {
      const ctx = await setup({
        companies: [
          { id: 'emp-a', name: 'Construcción Andina S.A.C.', ruc: '20111111111', active: true },
          { id: 'emp-b', name: 'Minera del Sur S.A.', ruc: '20222222222', active: true },
          { id: 'emp-c', name: 'Transportes Lima E.I.R.L.', ruc: '20333333333', active: true },
        ],
      });
      await openForm(ctx);
      const search = (q: string) => {
        const input = ctx.el.querySelector<HTMLInputElement>('#company-search')!;
        input.value = q;
        input.dispatchEvent(new Event('input'));
      };
      const shown = () => [...ctx.el.querySelectorAll<HTMLLabelElement>('[data-company]')].map((b) => b.dataset['company']);
      search('construccion');
      await render(ctx);
      expect(shown()).toEqual(['emp-a']);
      ctx.el.querySelector<HTMLInputElement>('[data-company="emp-a"] input')!.click();
      search('2022');
      await render(ctx);
      expect(shown()).toEqual(['emp-b']);
      ctx.el.querySelector<HTMLInputElement>('[data-company="emp-b"] input')!.click();
      search('zzz');
      await render(ctx);
      expect(text(ctx.el.querySelector('[data-test="no-company-match"]'))).toBe('Ninguna empresa activa coincide con «zzz».');
      // Las elegidas se conservan aunque cambie la búsqueda.
      expect(text(ctx.el.querySelector('[data-test="selected-companies"]'))).toContain('Construcción Andina S.A.C.');
      expect(text(ctx.el.querySelector('[data-test="selected-companies"]'))).toContain('Minera del Sur S.A.');
      type(ctx.el, '#p-first', 'Ana');
      type(ctx.el, '#p-last', 'Prueba');
      type(ctx.el, '#p-email', 'ana.varias@prueba.test');
      type(ctx.el, '#p-dni', '44444444');
      await submit(ctx);
      const req = ctx.ctrl.expectOne((r) => r.method === 'POST' && r.url === '/api/v1/students');
      expect(req.request.body.companyIds).toEqual(['emp-a', 'emp-b']);
      req.flush({ student: student('u9', { companies: [] }), activation: { status: 'PENDING', emailDelivery: 'NOT_CONFIGURED', expiresAt: '2026-11-20T10:00:00.000Z' } });
      listReq(ctx.ctrl).flush(page([]));
      await render(ctx);
    });

    it('validaciones locales: no envía nada si faltan datos (la empresa es opcional)', async () => {
      const ctx = await setup();
      await openForm(ctx);
      await submit(ctx);
      expect(ctx.el.querySelectorAll('.error-text').length).toBe(4);
      expect(text(ctx.el)).not.toContain('Selecciona al menos una empresa');

      type(ctx.el, '#p-first', 'Ana');
      type(ctx.el, '#p-last', 'Torres');
      type(ctx.el, '#p-email', 'no-es-correo');
      type(ctx.el, '#p-dni', '1234');
      await submit(ctx);
      expect(text(ctx.el)).toContain('Ingresa un correo válido.');
      expect(text(ctx.el)).toContain('El DNI debe tener 8 dígitos.');
      ctx.ctrl.expectNone('/api/v1/students');
    });

    it('envía el contrato real y muestra NOT_CONFIGURED sin simular un envío; sin contraseñas', async () => {
      const ctx = await setup();
      await openForm(ctx);
      await fillValid(ctx);
      ctx.el.querySelector<HTMLInputElement>('[data-company="emp-2"] input')!.click();
      await submit(ctx);
      const req = ctx.ctrl.expectOne((r) => r.url === '/api/v1/students' && r.method === 'POST');
      expect(req.request.body).toEqual({
        firstNames: 'Ana María',
        lastNames: 'Torres Quispe',
        email: 'ana@empresa.pe',
        dni: '12345678',
        companyIds: ['emp-1', 'emp-2'],
      });
      const created = student('u9', { email: 'ana@empresa.pe', fullName: 'Ana María Torres Quispe' });
      req.flush(
        { student: created, activation: { status: 'PENDING', emailDelivery: 'NOT_CONFIGURED', expiresAt: '2026-11-20T10:00:00.000Z' } },
        { status: 201, statusText: 'Created' },
      );
      listReq(ctx.ctrl).flush(page([student('u1'), created])); // el listado se recarga desde el servidor
      await render(ctx);

      expect(text(ctx.el.querySelector('[data-test="registered"]'))).toContain('Ana María Torres Quispe');
      expect(text(ctx.el.querySelector('[data-test="registered"]'))).toContain('pendiente de activación');
      const delivery = text(ctx.el.querySelector('[data-test="delivery"]'));
      expect(delivery).toContain('NO se envió ningún enlace');
      expect(delivery).not.toMatch(/Se envió el enlace/);
      expect(text(ctx.el)).not.toMatch(/contraseña de demostración|demo1234/i);
      expect(ctx.el.querySelector('form')).toBeNull();
      expect(rows(ctx.el)).toEqual(['u1', 'u9']);
    });

    it('SENT: informa el envío y el vencimiento del enlace', async () => {
      const ctx = await setup();
      await openForm(ctx);
      await fillValid(ctx);
      await submit(ctx);
      ctx.ctrl
        .expectOne((r) => r.url === '/api/v1/students' && r.method === 'POST')
        .flush({ student: student('u9'), activation: { status: 'PENDING', emailDelivery: 'SENT', expiresAt: '2026-11-20T10:00:00.000Z' } });
      listReq(ctx.ctrl).flush(page([]));
      await render(ctx);
      const delivery = ctx.el.querySelector('[data-test="delivery"]')!;
      expect(delivery.classList).toContain('alert-success');
      expect(text(delivery)).toContain('Se envió el enlace de activación a u9@empresa.pe');
    });

    it.each([
      [409, 'Ya existe un usuario con ese correo electrónico.'],
      [409, 'Ya existe un participante con ese DNI.'],
      [409, 'La empresa «Empresa Uno» está desactivada y no admite nuevas asignaciones.'],
      [404, 'No se encontró una de las empresas indicadas.'],
    ])('error %i: mensaje comprensible y se conservan los datos', async (status, message) => {
      const ctx = await setup();
      await openForm(ctx);
      await fillValid(ctx);
      await submit(ctx);
      ctx.ctrl.expectOne((r) => r.url === '/api/v1/students' && r.method === 'POST').flush({ statusCode: status, message }, { status, statusText: 'Error' });
      await render(ctx);
      expect(text(ctx.el.querySelector('[data-test="error"]'))).toBe(`No se pudo registrar al participante: ${message}`);
      expect(ctx.el.querySelector<HTMLInputElement>('#p-email')!.value).toBe('ana@empresa.pe');
      expect(ctx.el.querySelector('[data-test="registered"]')).toBeNull();
    });

    it('sin empresa seleccionada: registra con companyIds vacío (empresa opcional, 17/11/2026)', async () => {
      const ctx = await setup();
      await openForm(ctx);
      type(ctx.el, '#p-first', 'Ana');
      type(ctx.el, '#p-last', 'Torres');
      type(ctx.el, '#p-email', 'ana@empresa.pe');
      type(ctx.el, '#p-dni', '12345678');
      await submit(ctx);
      const req = ctx.ctrl.expectOne((r) => r.url === '/api/v1/students' && r.method === 'POST');
      expect(req.request.body).toEqual({ firstNames: 'Ana', lastNames: 'Torres', email: 'ana@empresa.pe', dni: '12345678', companyIds: [] });
      req.flush({ student: student('u9', { companies: [] }), activation: { status: 'PENDING', emailDelivery: 'NOT_CONFIGURED', expiresAt: '2026-11-20T10:00:00.000Z' } });
      listReq(ctx.ctrl).flush(page([student('u9', { companies: [] })]));
      await render(ctx);
      expect(ctx.el.querySelector('[data-test="registered"]')).not.toBeNull();
    });

    it('sin empresas asignadas: el registro sigue disponible, sin avisos que lo bloqueen', async () => {
      const ctx = await setup({ companies: [], students: page([]) });
      expect(button(ctx.el, 'Registrar participante').disabled).toBe(false);
      expect(text(ctx.el.querySelector('[data-test="empty"]'))).toBe('Todavía no has registrado participantes.');
      await openForm(ctx);
      expect(text(ctx.el.querySelector('[data-test="no-active-companies"]'))).toContain('registra al participante sin empresa');
      expect(ctx.el.querySelectorAll('[data-company]')).toHaveLength(0);
    });

    it('solo empresas desactivadas: no se ofrecen, pero se puede registrar sin empresa', async () => {
      const ctx = await setup({ companies: [COMPANIES[2]] });
      expect(button(ctx.el, 'Registrar participante').disabled).toBe(false);
      await openForm(ctx);
      expect(ctx.el.querySelector('[data-company="emp-off"]')).toBeNull();
      expect(ctx.el.querySelector('[data-test="no-active-companies"]')).not.toBeNull();
    });

    it('empresa nueva (20/11/2026): envía razón social y RUC, valida el RUC y avisa que se registró la empresa', async () => {
      const ctx = await setup();
      await openForm(ctx, 'new');
      type(ctx.el, '#p-first', 'Juan');
      type(ctx.el, '#p-last', 'Pérez');
      type(ctx.el, '#p-email', 'juan@empresa.pe');
      type(ctx.el, '#p-dni', '12345678');
      const typeIn = (sel: string, value: string) => {
        const input = ctx.el.querySelector<HTMLInputElement>(sel)!;
        input.value = value;
        input.dispatchEvent(new Event('input'));
      };
      typeIn('#p-company-name', 'Gloria S.A.');
      typeIn('#p-company-ruc', '2010019079');
      await submit(ctx);
      expect(text(ctx.el)).toContain('El RUC debe tener 11 dígitos.');
      ctx.ctrl.expectNone((r) => r.method === 'POST');
      typeIn('#p-company-ruc', '20100190797');
      await submit(ctx);
      const req = ctx.ctrl.expectOne((r) => r.method === 'POST' && r.url === '/api/v1/students');
      expect(req.request.body.company).toEqual({ name: 'Gloria S.A.', ruc: '20100190797' });
      expect(req.request.body.companyIds).toEqual([]);
      const gloria = { id: 'emp-gloria', name: 'Gloria S.A.', ruc: '20100190797', active: true };
      req.flush({ student: student('u9', { companies: [gloria] }), companyOutcome: 'CREATED', activation: { status: 'PENDING', emailDelivery: 'NOT_CONFIGURED', expiresAt: '2026-11-20T10:00:00.000Z' } });
      ctx.ctrl.expectOne('/api/v1/students/companies').flush([...COMPANIES, gloria]); // se recargan para el buscador
      listReq(ctx.ctrl).flush(page([student('u9', { companies: [gloria] })]));
      await render(ctx);
      expect(text(ctx.el.querySelector('[data-test="company-note"]'))).toBe('Se registró la empresa «Gloria S.A.» (RUC 20100190797) y se asoció al participante.');
      const row = ctx.el.querySelector('tr[data-student="u9"]')!;
      expect(text(row)).toContain('Gloria S.A.');
      expect(text(row)).toContain('RUC 20100190797');
    });

    it('empresa nueva con un RUC ya registrado: avisa que se usará la existente y el servidor la reutiliza', async () => {
      const ctx = await setup();
      await openForm(ctx, 'new');
      const input = ctx.el.querySelector<HTMLInputElement>('#p-company-ruc')!;
      input.value = COMPANIES[0].ruc;
      input.dispatchEvent(new Event('input'));
      await render(ctx);
      expect(text(ctx.el.querySelector('[data-test="ruc-match"]'))).toContain(COMPANIES[0].name);
    });

    it('sin empresa: el listado lo indica claramente; error al cargar empresas → mensaje y «Reintentar»', async () => {
      const ctx = await setup({ students: page([student('u3', { companies: [] })]) });
      expect(text(ctx.el.querySelector('tr[data-student="u3"]'))).toContain('Sin empresa');
      TestBed.resetTestingModule();
      const failing = await setup({ companiesError: true });
      expect(text(failing.el.querySelector('[data-test="companies-error"]'))).toContain('No se pudieron cargar las empresas');
      button(failing.el, 'Reintentar').click();
      failing.ctrl.expectOne('/api/v1/students/companies').flush(COMPANIES);
      await render(failing);
      expect(failing.el.querySelector('[data-test="companies-error"]')).toBeNull();
    });

    it('DEV_CONSOLE: dice claramente que NO se envió correo y que el enlace está en la consola del servidor', async () => {
      const ctx = await setup();
      await openForm(ctx);
      await fillValid(ctx);
      await submit(ctx);
      ctx.ctrl
        .expectOne((r) => r.url === '/api/v1/students' && r.method === 'POST')
        .flush({ student: student('u9'), activation: { status: 'PENDING', emailDelivery: 'DEV_CONSOLE', expiresAt: '2026-11-20T10:00:00.000Z' } });
      listReq(ctx.ctrl).flush(page([]));
      await render(ctx);
      const delivery = text(ctx.el.querySelector('[data-test="delivery"]'));
      expect(delivery).toContain('NO se envió ningún correo');
      expect(delivery).toContain('consola del servidor');
      expect(delivery).not.toMatch(/Se envió el enlace/);
    });
  });

  describe('asignación de cursos (18/11/2026)', () => {
    it('muestra los cursos asignados y asigna uno nuevo con POST /enrollments', async () => {
      const enrolled: Enrollment = { userId: 'u1', courseId: 'c-1', completedVideoIds: [], status: 'pendiente' };
      const ctx = await setup({ enrollments: [enrolled] });
      const row = ctx.el.querySelector('tr[data-student="u1"]')!;
      expect(text(row.querySelector('[data-course="c-1"]'))).toContain('Seguridad en altura');
      const select = row.querySelector<HTMLSelectElement>('#assign-u1')!;
      expect([...select.options].map((o) => o.value)).toEqual(['', 'c-2']); // solo los no asignados
      select.value = 'c-2';
      select.dispatchEvent(new Event('change'));
      await render(ctx);
      button(row, 'Asignar').click();
      const req = ctx.ctrl.expectOne((r) => r.url === '/api/v1/enrollments' && r.method === 'POST');
      expect(req.request.body).toEqual({ studentId: 'u1', courseId: 'c-2' });
      req.flush({ userId: 'u1', courseId: 'c-2', completedVideoIds: [], status: 'pendiente' }, { status: 201, statusText: 'Created' });
      ctx.ctrl.expectOne((r) => r.url === '/api/v1/enrollments' && r.method === 'GET').flush([enrolled, { ...enrolled, courseId: 'c-2' }]);
      await render(ctx);
      expect(text(ctx.el.querySelector('[data-test="delivery"]'))).toContain('Curso «Primeros auxilios» asignado');
      expect(ctx.el.querySelectorAll('tr[data-student="u1"] [data-course]')).toHaveLength(2);
    });

    it('retirar sin avance: DELETE /enrollments; con error del servidor se muestra el mensaje', async () => {
      const ctx = await setup({ enrollments: [{ userId: 'u1', courseId: 'c-1', completedVideoIds: [], status: 'pendiente' }] });
      button(ctx.el, 'Retirar Seguridad en altura de Nombre u1 Apellido').click();
      ctx.ctrl
        .expectOne((r) => r.url === '/api/v1/enrollments/u1/c-1' && r.method === 'DELETE')
        .flush({ statusCode: 409, message: 'No se puede retirar el curso: el participante ya tiene avance, intentos o certificados en él.' }, { status: 409, statusText: 'Conflict' });
      await render(ctx);
      expect(text(ctx.el.querySelector('[data-test="error"]'))).toContain('ya tiene avance');
    });
  });

  describe('reenvío del enlace de activación', () => {
    it('muestra el resultado real del envío', async () => {
      const ctx = await setup();
      button(ctx.el, 'Reenviar enlace de activación a Nombre u1 Apellido').click();
      const req = ctx.ctrl.expectOne('/api/v1/students/u1/activation-email');
      expect(req.request.method).toBe('POST');
      req.flush({ activation: { status: 'PENDING', emailDelivery: 'FAILED', expiresAt: '2026-11-20T10:00:00.000Z' } });
      await render(ctx);
      expect(text(ctx.el.querySelector('[data-test="delivery"]'))).toContain('No se pudo enviar el correo de activación');
    });

    it('cuenta ya activada (409): mensaje del servidor', async () => {
      const ctx = await setup();
      button(ctx.el, 'Reenviar enlace de activación a Nombre u1 Apellido').click();
      ctx.ctrl
        .expectOne('/api/v1/students/u1/activation-email')
        .flush({ statusCode: 409, message: 'La cuenta del estudiante ya está activada.' }, { status: 409, statusText: 'Conflict' });
      await render(ctx);
      expect(text(ctx.el.querySelector('[data-test="error"]'))).toBe(
        'No se pudo reenviar el enlace a Nombre u1 Apellido: La cuenta del estudiante ya está activada.',
      );
    });
  });
});
