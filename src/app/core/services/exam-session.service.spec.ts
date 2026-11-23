import { ExamSessionService } from './exam-session.service';

const KEY = 'imc-demo-exam-session';

describe('ExamSessionService', () => {
  beforeEach(() => sessionStorage.clear());

  it('restaura una sesión anterior sin examen (compatibilidad)', () => {
    const legacy = { userId: 'u5', startedAt: Date.now(), endsAt: Date.now() + 60_000, answers: {}, index: 0 };
    sessionStorage.setItem(KEY, JSON.stringify(legacy));
    const svc = new ExamSessionService();
    expect(svc.session()).toEqual(legacy);
    expect(svc.isActiveFor('u5')).toBe(true);
    expect(svc.isActiveFor('u5', 'c-ia-e1')).toBe(false);
  });

  it('asocia la sesión a un examen', () => {
    const svc = new ExamSessionService();
    svc.start('u5', 20, 'c1-e1');
    expect(svc.session()!.examId).toBe('c1-e1');
    expect(svc.isActiveFor('u5', 'c1-e1')).toBe(true);
    expect(svc.isActiveFor('u5', 'c-ia-e1')).toBe(false);
  });

  it('isActiveForExam: la sesión pertenece al examen; una sesión anterior es del curso principal', () => {
    const svc = new ExamSessionService();
    svc.start('u5', 20, 'c-ia-e1');
    expect(svc.isActiveForExam('u5', { id: 'c-ia-e1', courseId: 'c-ia' })).toBe(true);
    expect(svc.isActiveForExam('u5', { id: 'c1-e1', courseId: 'c1' })).toBe(false);
    expect(svc.isActiveForExam('u4', { id: 'c-ia-e1', courseId: 'c-ia' })).toBe(false);

    const legacy = { userId: 'u5', startedAt: Date.now(), endsAt: Date.now() + 60_000, answers: {}, index: 0 };
    sessionStorage.setItem(KEY, JSON.stringify(legacy));
    const restored = new ExamSessionService();
    expect(restored.isActiveForExam('u5', { id: 'c1-e1', courseId: 'c1' })).toBe(true);
    expect(restored.isActiveForExam('u5', { id: 'c-ia-e1', courseId: 'c-ia' })).toBe(false);
  });

  it('isActiveForExam: una sesión vencida no está activa', () => {
    const expired = { userId: 'u5', examId: 'c1-e1', startedAt: Date.now() - 120_000, endsAt: Date.now() - 1, answers: {}, index: 0 };
    sessionStorage.setItem(KEY, JSON.stringify(expired));
    expect(new ExamSessionService().isActiveForExam('u5', { id: 'c1-e1', courseId: 'c1' })).toBe(false);
  });

  it('descarta una sesión guardada con forma no reconocida', () => {
    sessionStorage.setItem(KEY, JSON.stringify({ userId: 5, answers: 'x' }));
    expect(new ExamSessionService().session()).toBeNull();
    sessionStorage.setItem(KEY, '{dañado');
    expect(new ExamSessionService().session()).toBeNull();
  });
});
