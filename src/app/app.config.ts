import { ApplicationConfig } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { routes } from './app.routes';
import { DataRepository } from './core/services/data-repository';
import { MockDataRepository } from './core/services/mock-data-repository';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes, withComponentInputBinding()),
    // Para pasar a backend real: cambiar MockDataRepository por una clase que use HttpClient.
    { provide: DataRepository, useClass: MockDataRepository },
  ],
};
