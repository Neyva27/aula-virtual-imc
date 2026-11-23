import { formatDuration, parseDuration } from './duration';

describe('duración mm:ss', () => {
  it('convierte minutos y segundos a segundos', () => {
    expect(parseDuration('5:00')).toBe(300);
    expect(parseDuration('10:00')).toBe(600);
    expect(parseDuration('10:03')).toBe(603);
    expect(parseDuration('08:33')).toBe(513);
    expect(parseDuration(' 0:45 ')).toBe(45);
    expect(parseDuration('120:00')).toBe(7200);
  });

  it('rechaza formatos inválidos o duraciones no positivas', () => {
    for (const bad of ['', null, undefined, '0:00', '00:00', '0:00:00', '5', '5:6', '5:60', '1:60:00', '1:00:60', '-1:00', 'a:bc', '5.5:00', '10:03 min']) {
      expect(parseDuration(bad)).toBeNull();
    }
  });

  it('formatea segundos como m:ss', () => {
    expect(formatDuration(300)).toBe('5:00');
    expect(formatDuration(603)).toBe('10:03');
    expect(formatDuration(45)).toBe('0:45');
    expect(parseDuration(formatDuration(513))).toBe(513);
  });

  it('sin límite de duración (20/11/2026): admite horas con h:mm:ss y minutos largos con mm:ss', () => {
    expect(parseDuration('15:00')).toBe(900);
    expect(parseDuration('30:00')).toBe(1800);
    expect(parseDuration('45:00')).toBe(2700);
    expect(parseDuration('60:00')).toBe(3600);
    expect(parseDuration('1:00:00')).toBe(3600);
    expect(parseDuration('2:05:09')).toBe(7509);
    expect(parseDuration('12:00:00')).toBe(43200);
  });

  it('desde una hora formatea como h:mm:ss, y el formato se puede volver a leer', () => {
    expect(formatDuration(3599)).toBe('59:59');
    expect(formatDuration(3600)).toBe('1:00:00');
    expect(formatDuration(5430)).toBe('1:30:30');
    expect(formatDuration(7509)).toBe('2:05:09');
    for (const sec of [900, 2700, 3600, 7509, 36000]) expect(parseDuration(formatDuration(sec))).toBe(sec);
  });
});
