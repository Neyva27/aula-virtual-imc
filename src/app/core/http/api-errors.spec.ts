import { HttpErrorResponse } from '@angular/common/http';
import { apiErrorMessage, isPasswordChangeRequired, NETWORK_ERROR_MESSAGE, toDisplayError } from './api-errors';

const http = (status: number, error: unknown = null) => new HttpErrorResponse({ status, error, url: '/api/v1/auth/login' });

describe('Mensajes de error de la API (B1.3)', () => {
  it('usa el mensaje del servidor en los errores 4xx', () => {
    expect(apiErrorMessage(http(401, { message: 'Correo o contraseña incorrectos.' }))).toBe('Correo o contraseña incorrectos.');
    expect(apiErrorMessage(http(429, { message: 'Demasiadas solicitudes.' }))).toBe('Demasiadas solicitudes.');
    expect(apiErrorMessage(http(400, { message: ['Ingresa un correo electrónico válido.', 'Otro.'] }))).toBe(
      'Ingresa un correo electrónico válido. Otro.',
    );
  });

  it('sin conexión, servicio no disponible y errores internos', () => {
    expect(apiErrorMessage(http(0))).toBe(NETWORK_ERROR_MESSAGE);
    expect(apiErrorMessage(http(503, { statusCode: 503, message: 'El servicio no está disponible en este momento.' }))).toMatch(/no está disponible/);
    expect(apiErrorMessage(http(500, { statusCode: 500, message: 'detalle interno' }))).toBe('Ocurrió un error inesperado. Inténtalo nuevamente.');
    expect(apiErrorMessage(http(401))).toBe('Ocurrió un error inesperado. Inténtalo nuevamente.');
  });

  it('servidor que no responde detrás de un proxy (502, 504 o 5xx sin el formato de la API): mensaje de conexión', () => {
    expect(apiErrorMessage(http(502))).toBe(NETWORK_ERROR_MESSAGE);
    expect(apiErrorMessage(http(504, 'Gateway Timeout'))).toBe(NETWORK_ERROR_MESSAGE);
    expect(apiErrorMessage(http(500, 'Error occurred while trying to proxy'))).toBe(NETWORK_ERROR_MESSAGE);
    expect(apiErrorMessage(http(503))).toBe(NETWORK_ERROR_MESSAGE);
  });

  it('errores que no son HTTP conservan su mensaje', () => {
    expect(apiErrorMessage(new Error('Perfil no reconocido.'))).toBe('Perfil no reconocido.');
    expect(toDisplayError(http(0))).toBeInstanceOf(Error);
  });

  it('reconoce el 403 «PasswordChangeRequired»', () => {
    expect(isPasswordChangeRequired(http(403, { error: 'PasswordChangeRequired' }))).toBe(true);
    expect(isPasswordChangeRequired(http(403, { error: 'Forbidden' }))).toBe(false);
    expect(isPasswordChangeRequired(http(401, { error: 'PasswordChangeRequired' }))).toBe(false);
  });
});
