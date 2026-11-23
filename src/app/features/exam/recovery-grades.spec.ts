import { TestBed } from '@angular/core/testing';
import { Type } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { firstValueFrom } from 'rxjs';
import { ExamResult } from './result/result';
import { MyProgress } from '../progress/my-progress';
import { AdminResults } from '../administration/admin-results';
import { AuthService } from '../../core/services/auth.service';
import { DataRepository } from '../../core/services/data-repository';
import { MockDataRepository, STORAGE_KEY } from '../../core/services/mock-data-repository';
import { DEMO_CONFIG } from '../../core/config/demo.config';
import { DemoState } from '../../core/data/demo-state';
import { Attempt } from '../../core/models/exam.model';

/**
 * R4 en pantalla: el estudiante y el Instructor distinguen la nota del examen regular, la de la recuperación y la
 * nota final (la de la recuperación, aunque sea menor). Estado preparado como lo deja el repositorio al entregar una
 * recuperación (Carla, u3: regular 50/100). Datos ficticios.
 */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
/** Fila de una lista de datos: «término: valor» (dt y dd son elementos separados). */
const pair = (el: Element | null) => (el ? `${text(el.querySelector('dt'))}: ${text(el.querySelector('dd'))}` : '');

async function until(harness: RouterTestingHarness, cond: () => boolean, timeout = 8000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    await harness.fixture.whenStable();
    if (cond()) return;
    await sleep(50);
  }
  throw new Error('La condición no se cumplió a tiempo');
}

/** Carla con su recuperación entregada: `over` define el intento (por defecto, 30/100 desaprobado). */
function prepare(over: Partial<Attempt> = {}): void {
  localStorage.clear();
  sessionStorage.clear();
  new MockDataRepository().resetDemo();
  const s: DemoState = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
  const regular = s.attempts.find((a) => a.id === 'att2')!;
  const pending = !!over.review;
  s.recoveries.push({
    id: 'rec-1', userId: 'u3', courseId: 'c1', regularExamId: 'c1-e1', examId: 'c1-e1', reason: 'desaprobado', mode: 'original',
    opensAt: '2026-11-12T09:00:00.000-05:00', closesAt: '2026-11-12T11:00:00.000-05:00', authorizedBy: 'a1',
    authorizedAt: '2026-11-12T08:00:00.000-05:00', startedAt: '2026-11-12T09:00:00.000-05:00', attemptId: 'att-rec',
  });
  s.attempts.push({
    ...regular, id: 'att-rec', kind: 'recuperacion', recoveryId: 'rec-1', date: '2026-11-12T14:20:00.000Z',
    score: 30, passed: false, gradingRule: 'proporcional', ...over,
  });
  s.enrollments.find((e) => e.userId === 'u3' && e.courseId === 'c1')!.status = pending ? 'en_revision' : 'desaprobado';
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

async function open<T>(component: Type<T>, path: string, url: string, login = true) {
  TestBed.configureTestingModule({
    providers: [provideRouter([{ path, component }], withComponentInputBinding()), { provide: DataRepository, useClass: MockDataRepository }],
  });
  if (login) await firstValueFrom(TestBed.inject(AuthService).login('carla@ejemplo.test', DEMO_CONFIG.demoPassword));
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url, component);
  return { harness, el: harness.routeNativeElement as HTMLElement };
}

describe('R4: notas de recuperación en pantalla', () => {
  // Decisión del 10/11/2026: el estudiante ve solo su nota final vigente (la de la recuperación, mayor o menor); no se
  // le muestra la nota del examen regular ni que fue reemplazada. El Instructor ve las tres (última prueba).
  it('Resultado: solo la nota final vigente (la de la recuperación, aunque sea menor)', async () => {
    prepare();
    const { harness, el } = await open(ExamResult, 'cursos/:courseId/examen/resultado', '/cursos/c1/examen/resultado');
    await until(harness, () => !!el.querySelector('.n'));
    expect(text(el.querySelector('.score__label'))).toBe('Nota final');
    expect(text(el.querySelector('.n'))).toBe('30 / 100');
    expect(text(el)).toContain('Desaprobado');
    expect(el.querySelector('[data-grade]')).toBeNull();
    expect(text(el)).not.toContain('50 / 100'); // la regular no se muestra
    expect(text(el)).not.toContain('40 / 100'); // ni un promedio
    expect(text(el)).not.toMatch(/reemplaz|regular/i);
  }, 20_000);

  it('Resultado: con la recuperación en revisión no hay nota final, ni aprobado, ni nota regular', async () => {
    prepare({ score: 0, passed: false, review: { status: 'en_revision', manualScores: {} } });
    const { harness, el } = await open(ExamResult, 'cursos/:courseId/examen/resultado', '/cursos/c1/examen/resultado');
    await until(harness, () => !!el.querySelector('[data-review]'));
    expect(text(el.querySelector('[data-review] .n'))).toBe('Pendiente de calificación'); // R6
    expect(text(el)).not.toContain('Aprobado');
    expect(text(el)).not.toContain('Nota final');
    expect(text(el)).not.toContain('50 / 100');
    expect(text(el)).not.toMatch(/reemplaz|regular/i);
  }, 20_000);

  it('Mi progreso: solo el intento vigente y su nota final; la regular no aparece', async () => {
    prepare({ score: 70, passed: true });
    const { harness, el } = await open(MyProgress, 'progreso', '/progreso');
    await until(harness, () => !!el.querySelector('[data-attempt="att-rec"]'));
    const course = el.querySelector('[data-course="c1"]')!;
    expect(course.querySelectorAll('[data-attempt]')).toHaveLength(1);
    expect(course.querySelector('[data-attempt="att2"]')).toBeNull();
    expect(pair(course.querySelector('[data-attempt="att-rec"] div:nth-child(2)'))).toBe('Nota final: 70 / 100');
    expect(text(course)).not.toContain('50 / 100');
    expect(text(course)).not.toMatch(/reemplaz|regular/i);
    expect(text(course.querySelector('.exam-state'))).toBe('Aprobada');
  }, 20_000);

  it('Mi progreso sin recuperación: igual que antes', async () => {
    localStorage.clear();
    sessionStorage.clear();
    const { harness, el } = await open(MyProgress, 'progreso', '/progreso');
    await until(harness, () => !!el.querySelector('[data-attempt="att2"]'));
    expect(pair(el.querySelector('[data-attempt="att2"] div:nth-child(2)'))).toBe('Nota final: 50 / 100'); // R6: siempre «Nota final», la única vigente
  }, 20_000);

  it('Instructor: nota regular, de recuperación, final y estado de la recuperación; tipos en el historial', async () => {
    prepare();
    const { harness, el } = await open(AdminResults, 'admin/resultados', '/admin/resultados?curso=c1', false);
    await until(harness, () => !!el.querySelector('tr[data-row="u3|c1"]'));
    const row = el.querySelector('tr[data-row="u3|c1"]')!;
    expect(text(row.querySelector('[data-label="Nota regular"]'))).toBe('50 / 100');
    expect(text(row.querySelector('[data-label="Recuperación"]'))).toBe('30 / 100');
    expect(text(row.querySelector('[data-label="Nota final"]'))).toBe('30 / 100');
    expect(text(row.querySelector('[data-label="Intentos"]'))).toBe('1 de 1+ recuperación');
    expect(text(el.querySelector('tr[data-row="u5|c1"] [data-label="Recuperación"]'))).toBe('—'); // sin recuperación
    expect(text(el.querySelector('tr[data-attempt="att-rec"] [data-kind="recuperacion"]'))).toBe('Recuperación');
    expect(text(el.querySelector('tr[data-attempt="att2"] [data-kind="reemplazada"]'))).toBe('Reemplazada por la recuperación');
    expect(el.querySelector('tr[data-attempt="att1"] [data-kind]')).toBeNull(); // Ana: intento regular sin cambios
  }, 20_000);
});
