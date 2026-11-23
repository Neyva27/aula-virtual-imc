import { environment } from './environment';
import { environment as apiEnvironment } from './environment.api';

/** B1.3: el modo demostración es el predeterminado; el modo API solo se activa con la configuración development-api. */
describe('Entornos (B1.3)', () => {
  it('el entorno predeterminado (npm start, ng build, pruebas) es el modo demostración', () => {
    expect(environment.authMode).toBe('demo');
  });

  it('el entorno de la configuración development-api usa la API a través del proxy', () => {
    expect(apiEnvironment.authMode).toBe('api');
    expect(apiEnvironment.apiUrl).toBe('/api/v1');
    expect(apiEnvironment.sessionRestoreTimeoutMs).toBeGreaterThan(0);
  });
});
