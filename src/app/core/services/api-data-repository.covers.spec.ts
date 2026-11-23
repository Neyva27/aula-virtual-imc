import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { dataRepositoryFactory } from '../../app.config';
import { APP_ENVIRONMENT } from '../config/app-environment';
import { authInterceptor } from '../http/auth.interceptor';
import { ApiDataRepository, ApiRequestError } from './api-data-repository';
import { DataRepository } from './data-repository';

/** Portadas de curso (19/11/2026): subida multipart al backend. Solo HttpTestingController (nada sale del navegador). */
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

const COVER = '/api/v1/public/course-covers/3f2a9c1e-7b4d-4e8a-9c2f-0a1b2c3d4e5f.png';

describe('ApiDataRepository: portada del curso', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('PUT /courses/:id/cover envía el archivo como multipart en el campo «file» (nunca Base64 en JSON)', async () => {
    const { api, ctrl } = setup();
    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'portada.png', { type: 'image/png' });
    const result = firstValueFrom(api.uploadCourseCover('curso 1', file));
    const req = ctrl.expectOne('/api/v1/courses/curso%201/cover');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toBeInstanceOf(FormData);
    const sent = (req.request.body as FormData).get('file') as File;
    expect(sent.name).toBe('portada.png');
    expect(sent.type).toBe('image/png');
    // El navegador define el Content-Type multipart con su «boundary»: no se fuerza JSON.
    expect(req.request.headers.has('Content-Type')).toBe(false);
    req.flush({ id: 'curso 1', coverImage: COVER });
    expect((await result).coverImage).toBe(COVER);
  });

  it('el rechazo del servidor (formato o tamaño) llega con su mensaje en español', async () => {
    const { api, ctrl } = setup();
    const file = new File(['x'], 'grande.png', { type: 'image/png' });
    const result = firstValueFrom(api.uploadCourseCover('c1', file)).catch((e: unknown) => e);
    ctrl
      .expectOne('/api/v1/courses/c1/cover')
      .flush({ statusCode: 413, message: 'La imagen supera el tamaño máximo de 2 MB.' }, { status: 413, statusText: 'Payload Too Large' });
    const error = (await result) as ApiRequestError;
    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error.message).toBe('La imagen supera el tamaño máximo de 2 MB.');
  });
});
