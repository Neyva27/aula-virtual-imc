import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { dataRepositoryFactory } from '../../app.config';
import { APP_ENVIRONMENT } from '../config/app-environment';
import { authInterceptor } from '../http/auth.interceptor';
import { ApiDataRepository } from './api-data-repository';
import { DataRepository } from './data-repository';

/** Sesiones en vivo (20/11/2026): rutas del backend. Solo HttpTestingController (nada sale del navegador). */
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

const INPUT = { moduleId: 'm1', title: 'En vivo', startsAt: '2026-12-01T15:00:00.000Z', meetUrl: 'https://meet.google.com/abc-defg-hij' };

describe('ApiDataRepository: sesiones en vivo', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('usa las rutas del Instructor y del alumno', async () => {
    const { api, ctrl } = setup();
    const calls: [Promise<unknown>, string, string, unknown][] = [
      [firstValueFrom(api.getCourseLiveSessions('c 1')), 'GET', '/api/v1/courses/c%201/live-sessions', null],
      [firstValueFrom(api.getParticipantLiveSessions('u1', 'c1')), 'GET', '/api/v1/me/courses/c1/live-sessions', null],
      [firstValueFrom(api.createCourseLiveSession('c1', INPUT)), 'POST', '/api/v1/courses/c1/live-sessions', INPUT],
      [firstValueFrom(api.updateCourseLiveSession('c1', 's1', INPUT)), 'PUT', '/api/v1/courses/c1/live-sessions/s1', INPUT],
      [firstValueFrom(api.setCourseLiveSessionStatus('c1', 's1', 'cancelada')), 'PUT', '/api/v1/courses/c1/live-sessions/s1/status', { status: 'cancelada' }],
      [firstValueFrom(api.setCourseLiveSessionRecording('c1', 's1', 'https://youtu.be/x')), 'PUT', '/api/v1/courses/c1/live-sessions/s1/recording', { recordingUrl: 'https://youtu.be/x' }],
    ];
    for (const [promise, method, url, body] of calls) {
      const req = ctrl.expectOne(url);
      expect(req.request.method).toBe(method);
      if (body) expect(req.request.body).toEqual(body);
      req.flush([]);
      expect(await promise).toEqual([]);
    }
  });
});
