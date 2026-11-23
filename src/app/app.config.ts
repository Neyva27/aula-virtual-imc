import { ApplicationConfig, inject, provideAppInitializer } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { routes } from './app.routes';
import { DataRepository } from './core/services/data-repository';
import { MockDataRepository } from './core/services/mock-data-repository';
import { ApiDataRepository } from './core/services/api-data-repository';
import { APP_ENVIRONMENT, isApiMode } from './core/config/app-environment';
import { AuthService } from './core/services/auth.service';
import { authInterceptor } from './core/http/auth.interceptor';

/**
 * Origen de los datos según el modo (se fija al compilar):
 * - modo API: ApiDataRepository (servidor). Nunca recurre a los datos de demostración, ni si falla una solicitud;
 *   MockDataRepository no se crea y no se lee ni escribe nada en localStorage.
 * - modo demostración: MockDataRepository, como siempre.
 */
export function dataRepositoryFactory(): DataRepository {
  return isApiMode(inject(APP_ENVIRONMENT)) ? inject(ApiDataRepository) : new MockDataRepository();
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes, withComponentInputBinding()),
    // B1.3: HttpClient con el interceptor de la API. En modo demostración no se hace ninguna solicitud.
    provideHttpClient(withInterceptors([authInterceptor])),
    // Modo API: restaura la sesión (cookie de renovación) antes del primer ruteo. Modo demostración: no hace nada.
    provideAppInitializer(() => inject(AuthService).initialize()),
    { provide: DataRepository, useFactory: dataRepositoryFactory },
  ],
};
