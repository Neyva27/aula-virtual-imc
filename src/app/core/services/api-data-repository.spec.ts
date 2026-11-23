import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Observable, firstValueFrom } from 'rxjs';
import { dataRepositoryFactory } from '../../app.config';
import { APP_ENVIRONMENT } from '../config/app-environment';
import { authInterceptor } from '../http/auth.interceptor';
import { SessionStore } from '../auth/session-store';
import { ApiDataRepository, ApiRequestError, FeatureUnavailableError } from './api-data-repository';
import { DataRepository } from './data-repository';
import { MockDataRepository, STORAGE_KEY } from './mock-data-repository';

/** Integración real de estudiantes (modo API). Solo HttpTestingController: ninguna solicitud sale del navegador. */
const env = (authMode: 'demo' | 'api') => ({ authMode, apiUrl: '/api/v1', sessionRestoreTimeoutMs: 5000 });

function setup(mode: 'demo' | 'api' = 'api') {
  localStorage.clear();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([authInterceptor])),
      provideHttpClientTesting(),
      { provide: APP_ENVIRONMENT, useValue: env(mode) },
      { provide: DataRepository, useFactory: dataRepositoryFactory },
    ],
  });
  return { api: TestBed.inject(ApiDataRepository), ctrl: TestBed.inject(HttpTestingController) };
}

const student = {
  id: 'u1',
  email: 'ana@empresa.pe',
  firstNames: 'Ana',
  lastNames: 'Torres',
  fullName: 'Ana Torres',
  dni: '12345678',
  active: true,
  companies: [{ id: 'emp-1', name: 'Empresa Uno', ruc: '20123456789', active: true }],
};

describe('ApiDataRepository (modo API)', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  describe('selección del repositorio', () => {
    it('modo API: DataRepository es ApiDataRepository y no se crea ni se toca el estado de la demostración', () => {
      const { api } = setup('api');
      const repo = TestBed.inject(DataRepository);
      expect(repo).toBe(api);
      expect(repo).not.toBeInstanceOf(MockDataRepository);
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
      expect(repo.getStorageStatus()).toEqual({ source: 'api', warning: '', migrationProblems: [], legacyStatePresent: false });
    });

    it('modo demostración: DataRepository sigue siendo MockDataRepository', () => {
      setup('demo');
      expect(TestBed.inject(DataRepository)).toBeInstanceOf(MockDataRepository);
    });
  });

  describe('GET /students', () => {
    it('envía búsqueda (recortada), empresa y paginación', async () => {
      const { api, ctrl } = setup();
      const result = firstValueFrom(api.listStudents({ q: '  ana  ', companyId: 'emp-1', page: 2, pageSize: 20 }));
      const req = ctrl.expectOne((r) => r.url === '/api/v1/students');
      expect(req.request.method).toBe('GET');
      expect(req.request.params.get('q')).toBe('ana');
      expect(req.request.params.get('companyId')).toBe('emp-1');
      expect(req.request.params.get('page')).toBe('2');
      expect(req.request.params.get('pageSize')).toBe('20');
      req.flush({ items: [student], total: 21, page: 2, pageSize: 20 });
      expect(await result).toEqual({ items: [student], total: 21, page: 2, pageSize: 20 });
    });

    it('no envía filtros vacíos', () => {
      const { api, ctrl } = setup();
      api.listStudents({ q: '   ', companyId: '' }).subscribe();
      const req = ctrl.expectOne((r) => r.url === '/api/v1/students');
      expect(req.request.params.keys()).toEqual([]);
      req.flush({ items: [], total: 0, page: 1, pageSize: 20 });
    });

    it('404 (empresa ajena) llega como ApiRequestError con el mensaje del servidor', async () => {
      const { api, ctrl } = setup();
      const result = firstValueFrom(api.listStudents({ companyId: 'ajena' }));
      ctrl
        .expectOne((r) => r.url === '/api/v1/students')
        .flush({ statusCode: 404, message: 'No se encontró una de las empresas indicadas.' }, { status: 404, statusText: 'Not Found' });
      const error = await result.catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ApiRequestError);
      expect(error).toMatchObject({ status: 404, message: 'No se encontró una de las empresas indicadas.' });
    });
  });

  it('GET /students/:id', async () => {
    const { api, ctrl } = setup();
    const result = firstValueFrom(api.getStudent('u1'));
    const req = ctrl.expectOne('/api/v1/students/u1');
    expect(req.request.method).toBe('GET');
    req.flush(student);
    expect(await result).toEqual(student);
  });

  it('GET /students/companies (y listCompanies del contrato heredado)', async () => {
    const { api, ctrl } = setup();
    const companies = [
      { id: 'emp-1', name: 'Empresa Uno', ruc: '20123456789', active: true },
      { id: 'emp-2', name: 'Empresa Dos', ruc: '20987654321', active: false },
    ];
    const own = firstValueFrom(api.listInstructorCompanies());
    ctrl.expectOne('/api/v1/students/companies').flush(companies);
    expect(await own).toEqual(companies);

    const legacy = firstValueFrom(api.listCompanies());
    ctrl.expectOne('/api/v1/students/companies').flush(companies);
    expect(await legacy).toEqual([
      { id: 'emp-1', name: 'Empresa Uno' },
      { id: 'emp-2', name: 'Empresa Dos' },
    ]);
  });

  describe('POST /students', () => {
    const input = { firstNames: 'Ana', lastNames: 'Torres', email: 'ana@empresa.pe', dni: '12345678', companyIds: ['emp-1'] };

    it('envía exactamente el contrato del backend (sin contraseña ni cursos)', async () => {
      const { api, ctrl } = setup();
      const result = firstValueFrom(api.registerStudent(input));
      const req = ctrl.expectOne('/api/v1/students');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(input);
      const activation = { status: 'PENDING', emailDelivery: 'NOT_CONFIGURED', expiresAt: '2026-11-20T10:00:00.000Z' };
      req.flush({ student, activation }, { status: 201, statusText: 'Created' });
      expect(await result).toEqual({ student, activation });
    });

    it.each([
      [409, 'Ya existe un usuario con ese correo electrónico.'],
      [409, 'La empresa «Empresa Uno» está desactivada y no admite nuevas asignaciones.'],
      [404, 'No se encontró una de las empresas indicadas.'],
      [400, ['Ingresa nombres y apellidos.', 'El DNI debe tener 8 dígitos.']],
    ] as const)('error %i: mensaje comprensible del servidor', async (status, message) => {
      const { api, ctrl } = setup();
      const result = firstValueFrom(api.registerStudent(input)).catch((e: unknown) => e);
      ctrl.expectOne('/api/v1/students').flush({ statusCode: status, message }, { status, statusText: 'Error' });
      expect(await result).toMatchObject({ status, message: Array.isArray(message) ? message.join(' ') : message });
    });

    it('sin conexión con el servidor: mensaje de conexión, estado 0', async () => {
      const { api, ctrl } = setup();
      const result = firstValueFrom(api.registerStudent(input)).catch((e: unknown) => e);
      ctrl.expectOne('/api/v1/students').error(new ProgressEvent('error'));
      expect(await result).toMatchObject({ status: 0, message: expect.stringContaining('No se pudo conectar con el servidor') });
    });
  });

  it('POST /students/:id/activation-email devuelve el resultado del envío', async () => {
    const { api, ctrl } = setup();
    const result = firstValueFrom(api.resendActivation('u1'));
    const req = ctrl.expectOne('/api/v1/students/u1/activation-email');
    expect(req.request.method).toBe('POST');
    const activation = { status: 'PENDING', emailDelivery: 'FAILED', expiresAt: '2026-11-20T10:00:00.000Z' };
    req.flush({ activation });
    expect(await result).toEqual(activation);
  });

  describe('módulo académico: rutas según el rol de la sesión (18/11/2026)', () => {
    const login = (role: 'instructor' | 'participant') =>
      TestBed.inject(SessionStore).set({ id: role === 'instructor' ? 'a1' : 'u1', fullName: 'X', firstNames: 'X', lastNames: 'Y', email: 'x@y.pe', role });

    it('Instructor: intentos, certificados, matrículas y preguntas desde sus rutas (con filtros)', async () => {
      const { api, ctrl } = setup();
      login('instructor');
      api.listAttempts({ courseId: 'c1' }).subscribe();
      const attempts = ctrl.expectOne((r) => r.url === '/api/v1/attempts');
      expect(attempts.request.params.get('courseId')).toBe('c1');
      attempts.flush([]);
      api.listCertificates({ userId: 'u1' }).subscribe();
      ctrl.expectOne((r) => r.url === '/api/v1/certificates' && r.params.get('userId') === 'u1').flush([]);
      api.listEnrollments().subscribe();
      ctrl.expectOne('/api/v1/enrollments').flush([]);
      api.getExamQuestions('e1').subscribe();
      ctrl.expectOne('/api/v1/exams/e1/questions').flush([]);
    });

    it('Estudiante: solo sus rutas /me (el servidor usa la identidad del token)', async () => {
      const { api, ctrl } = setup();
      login('participant');
      api.listAttempts({ userId: 'otro', courseId: 'c1' }).subscribe();
      const attempts = ctrl.expectOne((r) => r.url === '/api/v1/me/attempts');
      expect(attempts.request.params.has('userId')).toBe(false); // nunca se envía otro usuario
      attempts.flush([]);
      api.getExamQuestions('e1').subscribe();
      ctrl.expectOne('/api/v1/me/exams/e1/questions').flush([]);
      const courses = firstValueFrom(api.getCourses());
      ctrl.expectOne('/api/v1/me/courses').flush([{ course: { id: 'c1', name: 'Curso' }, enrollment: {}, totalVideos: 0, completedVideos: 0, percent: 0, preview: false }]);
      expect(await courses).toEqual([{ id: 'c1', name: 'Curso' }]);
      api.submitExamAttempt('u1', 'e1', { q1: ['a'] }, 61.6, 'voluntaria').subscribe();
      const submit = ctrl.expectOne('/api/v1/me/exams/e1/submit');
      expect(submit.request.body).toEqual({ answers: { q1: ['a'] }, durationSec: 62, mode: 'voluntaria' });
      submit.flush({});
    });

    it('getUsers recorre todas las páginas de estudiantes del Instructor', async () => {
      const { api, ctrl } = setup();
      const users = firstValueFrom(api.getUsers());
      ctrl.expectOne((r) => r.url === '/api/v1/students' && r.params.get('page') === '1').flush({ items: [student], total: 101, page: 1, pageSize: 100 });
      ctrl.expectOne((r) => r.url === '/api/v1/students' && r.params.get('page') === '2').flush({ items: [{ ...student, id: 'u2' }], total: 101, page: 2, pageSize: 100 });
      expect((await users).map((u) => [u.id, u.role, u.companyId])).toEqual([
        ['u1', 'participant', 'emp-1'],
        ['u2', 'participant', 'emp-1'],
      ]);
    });

    it('verificación pública: código inexistente → null (sin error)', async () => {
      const { api, ctrl } = setup();
      const result = firstValueFrom(api.findCertificateByCode(' IMC-X '));
      ctrl.expectOne('/api/v1/public/certificates/IMC-X').flush({ statusCode: 404, message: 'No' }, { status: 404, statusText: 'Not Found' });
      expect(await result).toBeNull();
    });

  });

  describe('sin respaldo en datos de demostración', () => {
    it.each([
      ['addParticipant', () => TestBed.inject(ApiDataRepository).addParticipant()],
      ['getCourse (vista heredada)', () => TestBed.inject(ApiDataRepository).getCourse()],
      ['saveVideo (vista heredada)', () => TestBed.inject(ApiDataRepository).saveVideo()],
    ] as [string, () => Observable<unknown>][])('%s: «módulo en preparación», sin datos ni solicitudes', async (_name, call) => {
      setup();
      const error = await firstValueFrom(call()).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(FeatureUnavailableError);
      expect((error as Error).message).toContain('módulo en preparación');
      // afterEach: verify() comprueba que no se hizo ninguna solicitud.
    });

    it('resetDemo no tiene efecto silencioso: informa que no está disponible', () => {
      const { api } = setup();
      expect(() => api.resetDemo()).toThrow(FeatureUnavailableError);
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });
  });
});
