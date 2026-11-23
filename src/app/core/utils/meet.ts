/**
 * Enlace de Google Meet (20/11/2026, igual que el backend): solo https://meet.google.com/<código>, con el código de
 * reunión de Meet (abc-defg-hij), opcionalmente con parámetros. Devuelve el enlace limpio, o null si no es de Meet.
 */
export function normalizeMeetUrl(value: string | null | undefined): string | null {
  const v = value?.trim() ?? '';
  if (v.length > 500) return null;
  const match = /^https:\/\/meet\.google\.com\/([a-z]{3}-[a-z]{4}-[a-z]{3})(\?[^\s#]*)?$/i.exec(v);
  return match ? `https://meet.google.com/${match[1].toLowerCase()}${match[2] ?? ''}` : null;
}

export const MEET_URL_ERROR = 'El enlace debe ser de Google Meet, con el formato https://meet.google.com/abc-defg-hij.';
