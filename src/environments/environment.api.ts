import type { AppEnvironment } from '../app/core/config/app-environment';

/**
 * MODO API (desarrollo, B1.3). Reemplaza a environment.ts solo en la configuración `development-api`
 * (`npm run start:api`). El inicio de sesión usa el backend NestJS a través del proxy de `ng serve`
 * (proxy.conf.json → http://localhost:3000). Los datos de las pantallas siguen siendo los de demostración del navegador.
 */
export const environment: AppEnvironment = {
  authMode: 'api',
  apiUrl: '/api/v1',
  sessionRestoreTimeoutMs: 5000,
};
