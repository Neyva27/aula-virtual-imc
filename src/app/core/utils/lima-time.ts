/**
 * Fechas de las sesiones en vivo (20/11/2026) en hora de Lima. Perú usa UTC−5 todo el año (sin horario de verano),
 * así que la conversión es exacta y no depende de la zona horaria del navegador.
 */
const LIMA_OFFSET = '-05:00';

/** «2026-12-01» + «10:00» (hora de Lima) → ISO UTC; null si la fecha o la hora no son válidas. */
export function limaToIso(date: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const ms = Date.parse(`${date}T${time}:00${LIMA_OFFSET}`);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

/** ISO UTC → fecha («2026-12-01») y hora («10:00») de Lima, para los campos del formulario. */
export function isoToLima(iso: string): { date: string; time: string } {
  const lima = new Date(Date.parse(iso) - 5 * 3_600_000).toISOString();
  return { date: lima.slice(0, 10), time: lima.slice(11, 16) };
}

/** Texto para mostrar: «lunes, 1 de diciembre de 2026, 10:00 (hora de Lima)». */
export function formatLima(iso: string): string {
  const text = new Date(iso).toLocaleString('es-PE', {
    timeZone: 'America/Lima',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  return `${text} (hora de Lima)`;
}
