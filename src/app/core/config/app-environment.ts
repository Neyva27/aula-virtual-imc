import { InjectionToken } from '@angular/core';
import { environment } from '../../../environments/environment';

/** «demo»: sesión simulada en el navegador (predeterminado). «api»: inicio de sesión con el backend (B1.3). */
export type AuthMode = 'demo' | 'api';

export interface AppEnvironment {
  authMode: AuthMode;
  /** Prefijo de la API. En desarrollo es relativo: el proxy de `ng serve` lo envía al backend. */
  apiUrl: string;
  /** Tiempo máximo para restaurar la sesión al abrir la aplicación (modo API). */
  sessionRestoreTimeoutMs: number;
}

/**
 * Modo API: además del inicio de sesión, los DATOS salen del servidor (ApiDataRepository) y solo se muestran los
 * módulos conectados. Modo demostración: todo como antes (MockDataRepository). Se fija al compilar.
 */
export function isApiMode(env: AppEnvironment): boolean {
  return env.authMode === 'api';
}

/** Compilación en modo API (`npm run start:api`). Se fija al compilar, como el archivo de entorno. */
export const IS_API_BUILD = environment.authMode === 'api';

/**
 * Sufijo de los mensajes de las pantallas compartidas: « (demostración)» en modo demostración y vacío en modo API,
 * donde los datos se guardan en el servidor (18/11/2026). Los textos fijos de demostración usan la clase
 * `demo-only`, que se oculta en modo API (styles.css).
 */
export const DEMO_SUFFIX = IS_API_BUILD ? '' : ' (demostración)';

/** Entorno de la aplicación. Las pruebas lo reemplazan para ejercitar el modo API. */
export const APP_ENVIRONMENT = new InjectionToken<AppEnvironment>('APP_ENVIRONMENT', {
  providedIn: 'root',
  factory: () => environment,
});
