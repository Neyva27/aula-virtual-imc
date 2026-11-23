import type { AppEnvironment } from '../app/core/config/app-environment';

/**
 * Entorno predeterminado: MODO DEMOSTRACIÓN. Lo usan `npm start`, `ng build` (también producción) y las pruebas.
 * El inicio de sesión es simulado en el navegador y no se hace ninguna solicitud a la API.
 * El modo API se activa solo con `npm run start:api` (configuración `development-api`, ver environment.api.ts).
 */
export const environment: AppEnvironment = {
  authMode: 'demo',
  apiUrl: '/api/v1',
  sessionRestoreTimeoutMs: 5000,
};
