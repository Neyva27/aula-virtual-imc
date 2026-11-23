import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { dataRepositoryFactory } from '../../app.config';
import { APP_ENVIRONMENT } from '../config/app-environment';
import { authInterceptor } from '../http/auth.interceptor';
import { ApiDataRepository } from './api-data-repository';
import { DataRepository } from './data-repository';

/** Recuperaciones de examen (21/11/2026): rutas del backend en modo API. Solo HttpTestingController. */
function setup() {
  localStorage.clear();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([authInterceptor])),
      provideHttpClientTesting(),
      { provide: APP_ENVIRONMENT, useValue: { authMode: 'api', apiUrl: '/api/v1', sessionRestoreTimeoutMs: 5000 } },
      { provide: DataRepository, useFactory: dataRepositoryFactory },
    ],
  });
  return { api: TestBed.inject(ApiDataRepository), ctrl: TestBed.inject(HttpTestingController) };
}

describe('ApiDataRepository: recuperaciones (Instructor)', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('autoriza (examen original), anula y lista con las rutas del servidor', async () => {
    const { api, ctrl } = setup();
    const input = { userId: 'u1', courseId: 'c1', mode: 'original' as const, opensAt: '2026-11-25T09:00:00-05:00', closesAt: '2026-11-27T18:00:00-05:00' };
    const authorized = firstValueFrom(api.authorizeRecovery('a1', input));
    const a = ctrl.expectOne('/api/v1/recoveries');
    expect(a.request.method).toBe('POST');
    expect(a.request.body).toEqual(input); // el Instructor sale del token, no se envía
    a.flush({ id: 'r1' });
    expect(await authorized).toEqual({ id: 'r1' });

    const cancelled = firstValueFrom(api.cancelRecovery('a1', 'r1'));
    const c = ctrl.expectOne('/api/v1/recoveries/r1/cancel');
    expect(c.request.method).toBe('PUT');
    c.flush({ id: 'r1', cancelledAt: 'x' });
    await cancelled;

    const list = firstValueFrom(api.listRecoveries({ courseId: 'c1' }));
    const l = ctrl.expectOne((r) => r.url === '/api/v1/recoveries');
    expect(l.request.params.get('courseId')).toBe('c1');
    l.flush([]);
    await list;

    const states = firstValueFrom(api.getRecoveryStatus('u1', 'c1'));
    const s = ctrl.expectOne((r) => r.url === '/api/v1/recovery-states');
    expect(s.request.params.get('userId')).toBe('u1');
    s.flush([{ userId: 'u1', courseId: 'c1', status: 'pendiente', reason: 'Desaprobó el examen regular.', recovery: null }]);
    expect((await states).status).toBe('pendiente');

  });
});

describe('ApiDataRepository: certificados del Instructor con filtros (20/11/2026)', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('envía los filtros al servidor (GET /certificates) y omite los vacíos', async () => {
    const { api, ctrl } = setup();
    const list = firstValueFrom(api.listCertificates({ student: ' Ana ', code: 'IMC-2026', companyId: 'emp-a', from: '2026-11-01', to: '2026-11-30' }));
    const req = ctrl.expectOne((r) => r.url === '/api/v1/certificates');
    expect(req.request.method).toBe('GET');
    expect(Object.fromEntries(req.request.params.keys().map((k) => [k, req.request.params.get(k)]))).toEqual({
      student: 'Ana',
      code: 'IMC-2026',
      companyId: 'emp-a',
      from: '2026-11-01',
      to: '2026-11-30',
    });
    req.flush([]);
    expect(await list).toEqual([]);

    const empty = firstValueFrom(api.listCertificates({ student: '  ', code: '' }));
    const plain = ctrl.expectOne((r) => r.url === '/api/v1/certificates');
    expect(plain.request.params.keys()).toEqual([]);
    plain.flush([]);
    await empty;
  });

  it('la validación pública por DNI usa el endpoint público existente', async () => {
    const { api, ctrl } = setup();
    const found = firstValueFrom(api.findCertificatesByDni('00000001'));
    const req = ctrl.expectOne('/api/v1/public/certificates/dni/00000001');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush([{ id: 'IMC-1', code: 'IMC-1', participantName: 'Ana', courseName: 'Curso', issueDate: '2026-11-05', status: 'vigente' }]);
    expect((await found).map((c) => c.code)).toEqual(['IMC-1']);
  });
});
