/**
 * Duración que ingresa el Instructor (20/11/2026, sin límite): «mm:ss» (10:03, 45:00, 90:00) o «h:mm:ss» (1:30:00,
 * 2:05:09). Los minutos de «h:mm:ss» y los segundos van de 00 a 59.
 */
const MM_SS = /^(\d{1,4}):([0-5]\d)$/;
const H_MM_SS = /^(\d{1,4}):([0-5]\d):([0-5]\d)$/;
/** Tope técnico (columna INT del backend); no es una regla de negocio. */
const MAX_SECONDS = 2_147_483_647;

/** Convierte «mm:ss» o «h:mm:ss» a segundos. null si el formato no es válido o la duración no es mayor que 0. */
export function parseDuration(value: string | null | undefined): number | null {
  const text = (value ?? '').trim();
  const hms = H_MM_SS.exec(text);
  const ms = hms ? null : MM_SS.exec(text);
  if (!hms && !ms) return null;
  const seconds = hms ? Number(hms[1]) * 3600 + Number(hms[2]) * 60 + Number(hms[3]) : Number(ms![1]) * 60 + Number(ms![2]);
  return seconds > 0 && seconds <= MAX_SECONDS ? seconds : null;
}

/** Convierte segundos a «m:ss» si dura menos de una hora (603 → «10:03») y a «h:mm:ss» desde una hora (5430 → «1:30:30»). */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const ss = String(s % 60).padStart(2, '0');
  if (s < 3600) return `${Math.floor(s / 60)}:${ss}`;
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${ss}`;
}
