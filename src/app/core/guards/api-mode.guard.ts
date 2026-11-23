import { inject } from '@angular/core';
import { CanMatchFn } from '@angular/router';
import { APP_ENVIRONMENT, isApiMode } from '../config/app-environment';

/**
 * Navegación del MODO API. Se usa como `canMatch` (antes de cargar el componente) para elegir la versión conectada al
 * servidor de una pantalla cuando difiere de la de la demostración (por ejemplo, «Participantes» y la activación).
 */
export const apiModeMatch: CanMatchFn = () => isApiMode(inject(APP_ENVIRONMENT));
