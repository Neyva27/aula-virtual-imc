import { describe, expect, it } from 'vitest';
import { moduleRuleIssues, ruleIssues } from './academic.rules.js';

/** RN-03 por módulo (19/11/2026): reglas puras. */
const video = (moduleId: string, i: number, durationSec = 360) => ({ moduleId, title: `V${moduleId}${i}`, durationSec });
const many = (moduleId: string, count: number) => Array.from({ length: count }, (_, i) => video(moduleId, i + 1));
const modules = [
  { id: 'm1', title: 'Teoría' },
  { id: 'm2', title: 'Práctica' },
];

describe('RN-03: regla para publicar (módulo por módulo)', () => {
  it('sin máximo: 12 videos en un módulo y 5 en otro cumplen', () => {
    expect(moduleRuleIssues(modules, [...many('m1', 12), ...many('m2', 5)])).toEqual([]);
  });

  it('21/11/2026: basta 1 video publicado por módulo; los videos de un módulo no completan el mínimo de otro', () => {
    for (const n of [1, 2, 3, 4, 5]) expect(moduleRuleIssues(modules, [...many('m1', n), ...many('m2', n)])).toEqual([]);
    expect(moduleRuleIssues(modules, many('m1', 9))).toEqual([
      'Módulo 2 «Práctica»: no tiene videos publicados; se requiere al menos 1 video publicado por módulo.',
    ]);
  });

  it('un módulo sin videos publicados también bloquea; la duración no se limita (20/11/2026)', () => {
    expect(moduleRuleIssues(modules, [...many('m1', 4), video('m1', 9, 30)])).toEqual([
      'Módulo 2 «Práctica»: no tiene videos publicados; se requiere al menos 1 video publicado por módulo.',
    ]);
    const long = [15, 30, 45, 60, 120].map((min, i) => video('m1', i, min * 60));
    expect(moduleRuleIssues(modules, [...long, ...many('m2', 5)])).toEqual([]);
    expect(ruleIssues([...long, video('m1', 9, 10 * 3600)])).toEqual([]);
  });
});

describe('RN-03: regla de acceso de un curso ya publicado (sin bloqueo retroactivo)', () => {
  it('basta con 1 video publicado en total y no hay máximo', () => {
    expect(ruleIssues(many('m1', 1))).toEqual([]);
    expect(ruleIssues(many('m1', 20))).toEqual([]);
    expect(ruleIssues([])).toEqual(['El curso no tiene videos publicados; se requiere al menos 1 video publicado.']);
  });
});
