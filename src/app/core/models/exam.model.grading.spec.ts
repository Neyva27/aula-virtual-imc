import {
  Question,
  attemptRule,
  isComplete,
  questionPoints,
  requiredSelections,
  selectedCount,
  selectionError,
} from './exam.model';
import { SEED_QUESTIONS } from '../data/seed';

/** Etapa 2B, Bloque 1: funciones puras de calificación proporcional. Datos ficticios. */
const opts = (n: number) => 'abcdefgh'.slice(0, n).split('').map((id) => ({ id, text: `Opción ${id}` }));
const multiple = (points: number, n: number, correct: string[], selectCount?: number): Question => ({
  id: 'm',
  type: 'multiple',
  text: 'Pregunta',
  options: opts(n),
  correct,
  points,
  ...(selectCount === undefined ? {} : { selectCount }),
});
const single: Question = { id: 's', type: 'single', text: 'Única', options: opts(4), correct: ['c'], points: 10 };
const tf: Question = {
  id: 't',
  type: 'truefalse',
  text: 'V/F',
  options: [{ id: 'v', text: 'Verdadero' }, { id: 'f', text: 'Falso' }],
  correct: ['v'],
  points: 10,
};
const open: Question = { id: 'o', type: 'open', text: 'Abierta', options: [], correct: [], points: 20 };

describe('Etapa 2B: calificación proporcional (funciones puras)', () => {
  describe('ejemplo aprobado: 10 puntos, 4 alternativas, 2 correctas, 2 exigidas', () => {
    const q = multiple(10, 4, ['a', 'b'], 2);
    it.each([
      [['a', 'b'], 10],
      [['a', 'c'], 5],
      [['a'], 5], // solo posible al agotarse el tiempo
      [['c', 'd'], 0],
      [[], 0],
      [['a', 'b', 'c'], 0], // más marcas que las exigidas: envío manipulado
    ])('%j → %d puntos', (given, expected) => {
      expect(questionPoints(q, given, 'proporcional')).toBe(expected);
    });
  });

  describe('ejemplo aprobado: 20 puntos, 5 alternativas, 4 correctas, 4 exigidas', () => {
    const q = multiple(20, 5, ['a', 'b', 'c', 'd'], 4);
    it.each([
      [['a', 'b', 'c', 'd'], 20],
      [['a', 'b', 'c', 'e'], 15],
      [['a', 'b'], 10],
      [['a', 'e'], 5],
    ])('%j → %d puntos', (given, expected) => {
      expect(questionPoints(q, given, 'proporcional')).toBe(expected);
    });
  });

  it('con más exigidas que correctas, marcar todas las correctas y una incorrecta da el máximo (sin descuento)', () => {
    const q = multiple(10, 5, ['a', 'b'], 3);
    expect(questionPoints(q, ['a', 'b', 'e'], 'proporcional')).toBe(10);
    expect(questionPoints(q, ['a', 'd', 'e'], 'proporcional')).toBe(5);
  });

  it('q6 de la semilla (3 correctas): un acierto vale un tercio, sin redondear', () => {
    const q6 = SEED_QUESTIONS.find((q) => q.id === 'q6')!;
    expect(questionPoints(q6, ['a'], 'proporcional')).toBeCloseTo(10 / 3, 10);
    expect(questionPoints(q6, ['a', 'c', 'e'], 'proporcional')).toBe(10);
  });

  it('ignora marcas repetidas o de alternativas que no existen; nunca negativo ni mayor que el máximo', () => {
    const q = multiple(10, 4, ['a', 'b'], 2);
    expect(questionPoints(q, ['a', 'a'], 'proporcional')).toBe(5);
    expect(questionPoints(q, ['a', 'zz'], 'proporcional')).toBe(5);
    for (const given of [[], ['a'], ['a', 'b'], ['c', 'd'], ['a', 'b', 'c', 'd']]) {
      const p = questionPoints(q, given, 'proporcional');
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(10);
    }
  });

  it('selección única y verdadero/falso: igual que antes', () => {
    for (const rule of ['proporcional', 'todo_o_nada'] as const) {
      expect(questionPoints(single, ['c'], rule)).toBe(10);
      expect(questionPoints(single, ['a'], rule)).toBe(0);
      expect(questionPoints(single, ['a', 'c'], rule)).toBe(0);
      expect(questionPoints(single, [], rule)).toBe(0);
      expect(questionPoints(tf, ['v'], rule)).toBe(10);
      expect(questionPoints(tf, ['f'], rule)).toBe(0);
    }
  });

  it('las abiertas no se califican automáticamente', () => {
    expect(questionPoints(open, ['Mi respuesta'], 'proporcional')).toBe(0);
    expect(questionPoints(open, ['Mi respuesta'], 'todo_o_nada')).toBe(0);
  });

  it('«todo o nada» se conserva para los intentos anteriores a la 2B', () => {
    const q = multiple(10, 4, ['a', 'b']);
    expect(questionPoints(q, ['b', 'a'], 'todo_o_nada')).toBe(10);
    expect(questionPoints(q, ['a'], 'todo_o_nada')).toBe(0);
    expect(questionPoints(q, ['a', 'c'], 'todo_o_nada')).toBe(0);
    expect(attemptRule({})).toBe('todo_o_nada');
    expect(attemptRule({ gradingRule: 'proporcional' })).toBe('proporcional');
  });

  describe('cantidad exigida (P1: correctas ≤ exigidas < alternativas)', () => {
    it('sin valor guardado (preguntas anteriores) vale la cantidad de correctas', () => {
      const q6 = SEED_QUESTIONS.find((q) => q.id === 'q6')!;
      expect(requiredSelections({ ...q6, selectCount: undefined })).toBe(3);
      expect(requiredSelections(single)).toBe(1);
      expect(requiredSelections(tf)).toBe(1);
      expect(requiredSelections(open)).toBe(0);
    });

    it.each([
      [multiple(10, 4, ['a', 'b'], 2), ''],
      [multiple(10, 4, ['a', 'b'], 3), ''],
      [multiple(10, 4, ['a', 'b']), ''],
      [multiple(10, 4, ['a', 'b'], 1), 'no puede ser menor que la cantidad de respuestas correctas (2)'],
      [multiple(10, 4, ['a', 'b'], 4), 'debe ser menor que el total de alternativas (4)'],
      [multiple(10, 4, ['a', 'b'], 2.5), 'debe ser un número entero'],
      [multiple(10, 3, ['a', 'b', 'c'], 3), 'al menos una alternativa debe ser incorrecta'],
    ])('%#: %j', (q, message) => {
      if (message) expect(selectionError(q)).toContain(message);
      else expect(selectionError(q)).toBe('');
    });

    it('no aplica a selección única, verdadero/falso ni abiertas', () => {
      expect(selectionError(single)).toBe('');
      expect(selectionError(tf)).toBe('');
      expect(selectionError(open)).toBe('');
    });
  });

  describe('pregunta completa para la entrega voluntaria (D3)', () => {
    const q = multiple(10, 4, ['a', 'b'], 2);
    it('selección múltiple: exactamente la cantidad exigida', () => {
      expect(isComplete(q, ['a', 'c'])).toBe(true);
      expect(isComplete(q, ['a'])).toBe(false);
      expect(isComplete(q, ['a', 'b', 'c'])).toBe(false);
      expect(isComplete(q, [])).toBe(false);
      expect(selectedCount(q, ['a', 'a', 'zz'])).toBe(1);
    });
    it('única, V/F y abiertas', () => {
      expect(isComplete(single, ['a'])).toBe(true);
      expect(isComplete(single, undefined)).toBe(false);
      expect(isComplete(tf, ['f'])).toBe(true);
      expect(isComplete(open, ['Texto'])).toBe(true);
      expect(isComplete(open, ['   '])).toBe(false);
      expect(isComplete(open, undefined)).toBe(false);
    });
  });
});
