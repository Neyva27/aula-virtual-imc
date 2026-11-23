import { formatLima, isoToLima, limaToIso } from './lima-time';
import { normalizeMeetUrl } from './meet';

/** Sesiones en vivo (20/11/2026): enlaces de Google Meet y fechas en hora de Lima (UTC−5, sin horario de verano). */
describe('normalizeMeetUrl (igual que el backend)', () => {
  it('acepta solo https://meet.google.com/<código>', () => {
    expect(normalizeMeetUrl(' https://Meet.Google.com/ABC-DEFG-HIJ?authuser=0 ')).toBe('https://meet.google.com/abc-defg-hij?authuser=0');
    for (const bad of ['http://meet.google.com/abc-defg-hij', 'https://meet.google.com.evil.test/abc-defg-hij', 'https://zoom.us/j/1', 'javascript:alert(1)', '']) {
      expect(normalizeMeetUrl(bad)).toBeNull();
    }
  });
});

describe('hora de Lima', () => {
  it('convierte fecha y hora de Lima a ISO UTC y de vuelta', () => {
    expect(limaToIso('2026-12-01', '10:00')).toBe('2026-12-01T15:00:00.000Z');
    expect(limaToIso('2026-12-31', '22:30')).toBe('2027-01-01T03:30:00.000Z');
    expect(isoToLima('2027-01-01T03:30:00.000Z')).toEqual({ date: '2026-12-31', time: '22:30' });
    expect(limaToIso('', '10:00')).toBeNull();
    expect(limaToIso('2026-12-01', '')).toBeNull();
  });

  it('muestra la fecha en español con la aclaración de hora de Lima', () => {
    const text = formatLima('2026-12-01T15:00:00.000Z');
    expect(text).toContain('diciembre de 2026');
    expect(text).toContain('10:00');
    expect(text.endsWith('(hora de Lima)')).toBe(true);
  });
});
