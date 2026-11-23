import { ExamSessionService } from './exam-session.service';

/** Etapa 2B, Bloque 2 (R2): la sesión del navegador adopta el inicio registrado en el repositorio. */
const KEY = 'imc-demo-exam-session';
const c1 = { id: 'c1-e1', courseId: 'c1' };

describe('ExamSessionService: inicio registrado (R2)', () => {
  beforeEach(() => sessionStorage.clear());

  it('sin sesión, crea una con el horario registrado y sin respuestas', () => {
    const svc = new ExamSessionService();
    svc.adopt('u5', 'c1-e1', 1000, 2000);
    expect(svc.session()).toEqual({ userId: 'u5', examId: 'c1-e1', startedAt: 1000, endsAt: 2000, answers: {}, index: 0 });
    expect(JSON.parse(sessionStorage.getItem(KEY)!)).toMatchObject({ startedAt: 1000, endsAt: 2000 });
  });

  it('con una sesión del mismo examen, corrige solo el horario y conserva respuestas, pregunta y aviso', () => {
    const svc = new ExamSessionService();
    svc.start('u5', 20, 'c1-e1');
    svc.setAnswer('q1', ['b']);
    svc.setIndex(3);
    svc.markTimeWarningShown();
    svc.adopt('u5', 'c1-e1', 1000, 2000);
    expect(svc.session()).toMatchObject({ startedAt: 1000, endsAt: 2000, answers: { q1: ['b'] }, index: 3, timeWarningShown: true });
  });

  it('con una sesión de otro examen o de otro usuario, la reemplaza sin arrastrar respuestas', () => {
    const svc = new ExamSessionService();
    svc.start('u5', 20, 'c-ia-e1');
    svc.setAnswer('x', ['a']);
    svc.adopt('u5', 'c1-e1', 1000, 2000);
    expect(svc.session()).toMatchObject({ examId: 'c1-e1', answers: {} });
    svc.adopt('u6', 'c1-e1', 1000, 2000);
    expect(svc.session()).toMatchObject({ userId: 'u6', answers: {} });
  });

  it('una sesión anterior a E2 (sin examen) es del curso principal: conserva sus respuestas', () => {
    sessionStorage.setItem(KEY, JSON.stringify({ userId: 'u5', startedAt: 1, endsAt: 2, answers: { q1: ['b'] }, index: 0 }));
    const svc = new ExamSessionService();
    svc.adopt('u5', 'c1-e1', 1000, 2000);
    expect(svc.session()).toMatchObject({ examId: 'c1-e1', startedAt: 1000, answers: { q1: ['b'] } });
  });

  it('belongsToExam reconoce la sesión aunque su tiempo se haya agotado (isActiveForExam no)', () => {
    const svc = new ExamSessionService();
    svc.adopt('u5', 'c1-e1', Date.now() - 30 * 60_000, Date.now() - 60_000);
    expect(svc.belongsToExam('u5', c1)).toBe(true);
    expect(svc.isActiveForExam('u5', c1)).toBe(false);
    expect(svc.belongsToExam('u6', c1)).toBe(false);
    expect(svc.belongsToExam('u5', { id: 'c-ia-e1', courseId: 'c-ia' })).toBe(false);
  });
});
