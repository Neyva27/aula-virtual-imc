import { describe, expect, it } from 'vitest';
import { normalizeMeetUrl } from './academic.rules.js';

/** Sesiones en vivo (20/11/2026): solo enlaces https de Google Meet. */
describe('normalizeMeetUrl', () => {
  it('acepta https://meet.google.com/<código> (con parámetros) y lo normaliza', () => {
    expect(normalizeMeetUrl('https://meet.google.com/abc-defg-hij')).toBe('https://meet.google.com/abc-defg-hij');
    expect(normalizeMeetUrl('  HTTPS://Meet.Google.com/ABC-DEFG-HIJ?authuser=1 ')).toBe('https://meet.google.com/abc-defg-hij?authuser=1');
  });

  it('rechaza otros dominios, http, rutas o códigos que no son de Meet', () => {
    for (const url of [
      'http://meet.google.com/abc-defg-hij',
      'https://meet.google.com.evil.test/abc-defg-hij',
      'https://evil.test/meet.google.com/abc-defg-hij',
      'https://meet.google.com/abc-defg-hij/extra',
      'https://meet.google.com/lookup/abc',
      'https://zoom.us/j/1',
      'javascript:alert(1)',
      '',
      null,
    ]) {
      expect(normalizeMeetUrl(url)).toBeNull();
    }
  });
});
