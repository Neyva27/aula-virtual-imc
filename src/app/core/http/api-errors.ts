import { HttpErrorResponse } from '@angular/common/http';

/** Código que envía la API cuando la contraseña es temporal (403). */
export const PASSWORD_CHANGE_REQUIRED = 'PasswordChangeRequired';

export const NETWORK_ERROR_MESSAGE = 'No se pudo conectar con el servidor. Revisa tu conexión e inténtalo nuevamente.';
const GENERIC_ERROR_MESSAGE = 'Ocurrió un error inesperado. Inténtalo nuevamente.';

/**
 * El servidor de la API no respondió: puerta de enlace (502/504) o un error 5xx que no tiene el formato de la API
 * ({ statusCode, message }), como el que devuelve un proxy cuando el backend está detenido.
 */
function isServerUnreachable(error: HttpErrorResponse): boolean {
  if (error.status === 502 || error.status === 504) return true;
  const body = error.error as { statusCode?: unknown } | null;
  return error.status >= 500 && !(body && typeof body === 'object' && typeof body.statusCode === 'number');
}

export function isPasswordChangeRequired(error: unknown): boolean {
  return error instanceof HttpErrorResponse && error.status === 403 && error.error?.error === PASSWORD_CHANGE_REQUIRED;
}

/**
 * Mensaje para mostrar a partir de un error de la API. Usa el mensaje del servidor cuando es seguro
 * (los errores 4xx y 503 de la API vienen en español y sin detalles internos) y uno genérico en los demás casos.
 */
export function apiErrorMessage(error: unknown): string {
  if (!(error instanceof HttpErrorResponse)) return error instanceof Error && error.message ? error.message : GENERIC_ERROR_MESSAGE;
  if (error.status === 0) return NETWORK_ERROR_MESSAGE;
  if (isServerUnreachable(error)) return NETWORK_ERROR_MESSAGE;
  const body = error.error as { message?: unknown } | null;
  const message = Array.isArray(body?.message) ? body.message.join(' ') : typeof body?.message === 'string' ? body.message : '';
  if (error.status === 503) return message || 'El servicio no está disponible en este momento. Inténtalo nuevamente en unos minutos.';
  if (error.status >= 400 && error.status < 500 && message) return message;
  return GENERIC_ERROR_MESSAGE;
}

/** Convierte un error de la API en un Error con el mensaje para mostrar (la forma que ya usa el login). */
export function toDisplayError(error: unknown): Error {
  return new Error(apiErrorMessage(error));
}
