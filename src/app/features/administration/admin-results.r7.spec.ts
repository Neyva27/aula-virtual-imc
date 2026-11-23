import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { firstValueFrom } from 'rxjs';
import { routes } from '../../app.routes';
import { AdminResults } from './admin-results';
import { AuthService } from '../../core/services/auth.service';
import { DataRepository } from '../../core/services/data-repository';
import { MockDataRepository, STORAGE_KEY } from '../../core/services/mock-data-repository';
import { DEMO_CONFIG } from '../../core/config/demo.config';
import { DemoState } from '../../core/data/demo-state';
import { SEED_QUESTIONS } from '../../core/data/seed';
import { Recovery } from '../../core/models/recovery.model';

/**
 * R7: «Evaluaciones rendidas» del Instructor: ruta y menú, filtros (curso, estudiante, empresa), detalle con
 * respuestas, calificación de abiertas, recuperaciones y autorización con el examen original o uno independiente
 * compatible. Empresas: solo las de la semilla (R1). Repositorio simulado real; datos ficticios.
 */
const MIN = 60_000;
const H = 60 * MIN;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const stored = (): DemoState => JSON.parse(localStorage.getItem(STORAGE_KEY)!);
const lima = (ms: number) => {
  const d = new Date(ms - 5 * H);
  const two = (n: number) => String(n).padStart(2, '0');
  return `${two(d.getUTCDate())}/${two(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${two(d.getUTCHours())}:${two(d.getUTCMinutes())}`;
};

async function until(harness: RouterTestingHarness, cond: () => boolean, timeout = 8000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    await harness.fixture.whenStable();
    if (cond()) return;
    await sleep(50);
  }
  throw new Error('La condición no se cumplió a tiempo');
}

function prepare(edit: (s: DemoState) => void = () => undefined): void {
  localStorage.clear();
  sessionStorage.clear();
  new MockDataRepository().resetDemo();
  const s = stored();
  edit(s);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

const recovery = (over: Partial<Recovery>): Recovery => ({
  id: 'rec-1', userId: 'u3', courseId: 'c1', regularExamId: 'c1-e1', examId: 'c1-e1', reason: 'desaprobado', mode: 'original',
  opensAt: new Date(Date.now() + H).toISOString(), closesAt: new Date(Date.now() + 3 * H).toISOString(),
  authorizedBy: 'a1', authorizedAt: new Date(Date.now() - H).toISOString(), ...over,
});

/** Rosa (u5) rindió c1 con una pregunta abierta todavía sin calificar (las demás valen 8; la abierta, 20). */
const rosaPending = (s: DemoState) => {
  s.questions.filter((q) => q.examId === 'c1-e1').forEach((q) => (q.points = 8));
  s.questions.push({ id: 'qo', examId: 'c1-e1', type: 'open', text: 'Explica qué es un riesgo.', options: [], correct: [], points: 20, rubric: 'Peligro y consecuencia.' });
  s.attempts.push({
    id: 'att-r', userId: 'u5', courseId: 'c1', examId: 'c1-e1', date: new Date(Date.now() - H).toISOString(), durationSec: 900,
    score: 0, scaleMax: 100, correctCount: 1, totalQuestions: 11, passed: false, gradingRule: 'proporcional', maxPoints: 100,
    answers: { q1: ['b'], q6: ['a', 'b', 'd'], qo: ['Es la posibilidad de un daño.'] },
    questionScores: Object.fromEntries(SEED_QUESTIONS.map((q) => [q.id, q.id === 'q1' ? 8 : q.id === 'q6' ? 8 / 3 : 0])),
    review: { status: 'en_revision', manualScores: {} },
  });
  s.enrollments.find((e) => e.userId === 'u5' && e.courseId === 'c1')!.status = 'en_revision';
};

/** Exámenes de recuperación de c1: uno compatible, uno con otra duración y uno sin preguntas. */
const recoveryExams = (s: DemoState) => {
  const regular = s.exams.find((e) => e.id === 'c1-e1')!;
  s.exams.push(
    { ...regular, id: 'rec-ok', title: 'Recuperación A', active: false, kind: 'recuperacion', parentExamId: 'c1-e1' },
    { ...regular, id: 'rec-bad', title: 'Recuperación otra duración', active: false, kind: 'recuperacion', parentExamId: 'c1-e1', timeMinutes: 30 },
    { ...regular, id: 'rec-empty', title: 'Recuperación vacía', active: false, kind: 'recuperacion', parentExamId: 'c1-e1' },
  );
  for (const examId of ['rec-ok', 'rec-bad']) s.questions.push(...SEED_QUESTIONS.map((q) => ({ ...q, id: `${examId}-${q.id}`, examId })));
};

async function page(url = '/instructor/evaluaciones-rendidas', login = true) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: 'instructor/evaluaciones-rendidas', component: AdminResults }], withComponentInputBinding()),
      { provide: DataRepository, useClass: MockDataRepository },
    ],
  });
  if (login) await firstValueFrom(TestBed.inject(AuthService).login('admin@ejemplo.test', DEMO_CONFIG.demoPassword));
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url, AdminResults);
  const el = harness.routeNativeElement as HTMLElement;
  // La sección de recuperaciones carga sus propios datos (latencia simulada del repositorio).
  await until(harness, () => !!el.querySelector('[data-filters]') && !!el.querySelector('[data-recoveries][data-loaded]'));
  const rows = () => [...el.querySelectorAll('tr[data-row]')].map((r) => r.getAttribute('data-row'));
  const attempts = () => [...el.querySelectorAll('tr[data-attempt]')].map((r) => r.getAttribute('data-attempt'));
  const button = (label: string, scope: Element = el) =>
    [...scope.querySelectorAll<HTMLButtonElement>('button')].find((b) => text(b) === label || b.getAttribute('aria-label') === label);
  const select = async (selector: string, value: string) => {
    const s = el.querySelector<HTMLSelectElement>(selector)!;
    s.value = value;
    s.dispatchEvent(new Event('change'));
    await harness.fixture.whenStable();
  };
  return { harness, el, rows, attempts, button, select, router: TestBed.inject(Router) };
}

describe('R7: Evaluaciones rendidas', () => {
  describe('ruta, redirección y menú', () => {
    async function app(url: string) {
      prepare();
      TestBed.configureTestingModule({ providers: [provideRouter(routes, withComponentInputBinding()), { provide: DataRepository, useClass: MockDataRepository }] });
      await firstValueFrom(TestBed.inject(AuthService).login('admin@ejemplo.test', DEMO_CONFIG.demoPassword));
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl(url);
      const root = harness.fixture.nativeElement as HTMLElement;
      await until(harness, () => !!root.querySelector('app-admin-results h1'));
      return { harness, root, router: TestBed.inject(Router) };
    }

    it('1 y 3. la ruta nueva muestra la sección con su encabezado y el menú activo', async () => {
      const { root, router } = await app('/instructor/evaluaciones-rendidas');
      expect(router.url).toBe('/instructor/evaluaciones-rendidas');
      expect(text(root.querySelector('app-admin-results h1'))).toBe('Evaluaciones rendidas');
      expect(text(root.querySelector('.side__nav a.is-active'))).toBe('Evaluaciones rendidas');
      expect(text(root.querySelector('.bar__title'))).toBe('Panel del instructor / Evaluaciones rendidas');
      expect(root.querySelector('.side__nav a.is-active')!.getAttribute('href')).toBe('/instructor/evaluaciones-rendidas');
    }, 30_000);

    it('2. /instructor/resultados y /admin/resultados redirigen a la nueva ruta y conservan el filtro', async () => {
      const first = await app('/instructor/resultados?curso=c1');
      expect(first.router.url).toBe('/instructor/evaluaciones-rendidas?curso=c1');
      TestBed.resetTestingModule();
      const second = await app('/admin/resultados?curso=c1');
      expect(second.router.url).toBe('/instructor/evaluaciones-rendidas?curso=c1');
    }, 30_000);
  });

  describe('filtros', () => {
    it('4 y 5. por curso y por estudiante (en las tres secciones)', async () => {
      prepare((s) => s.recoveries.push(recovery({})));
      const p = await page('/instructor/evaluaciones-rendidas?curso=c1');
      expect(p.rows()).toEqual(['u1|c1', 'u2|c1', 'u3|c1', 'u4|c1', 'u5|c1', 'u6|c1']);
      await p.select('#filter-student', 'u3');
      await until(p.harness, () => p.router.url.includes('estudiante=u3'));
      expect(p.rows()).toEqual(['u3|c1']);
      expect(p.attempts()).toEqual(['att2']);
      expect(p.el.querySelectorAll('tr[data-recovery]')).toHaveLength(1);
      await p.select('#filter-student', 'u1');
      await until(p.harness, () => p.router.url.includes('estudiante=u1'));
      expect(p.attempts()).toEqual(['att1']);
      expect(p.el.querySelectorAll('tr[data-recovery]')).toHaveLength(0);
    }, 30_000);

    it('6. por empresa, con las empresas de demostración existentes', async () => {
      prepare();
      const p = await page('/instructor/evaluaciones-rendidas?curso=c1');
      const options = [...p.el.querySelectorAll('#filter-company option')].map(text);
      expect(options).toEqual(['Todas las empresas', 'Empresa de Demostración A', 'Empresa de Demostración B', 'Sin empresa']);
      await p.select('#filter-company', 'emp-a');
      await until(p.harness, () => p.router.url.includes('empresa=emp-a'));
      expect(p.rows()).toEqual(['u1|c1', 'u2|c1', 'u3|c1']);
      expect(p.attempts().sort()).toEqual(['att1', 'att2']);
      await p.select('#filter-company', 'emp-b');
      await until(p.harness, () => p.router.url.includes('empresa=emp-b'));
      expect(p.rows()).toEqual(['u4|c1', 'u5|c1', 'u6|c1']);
      expect(text(p.el.querySelector('tr[data-row="u5|c1"] [data-label="Empresa"]'))).toBe('Empresa de Demostración B');
    }, 30_000);

    it('7. estudiantes sin empresa: «Sin empresa», sin inventar datos, y filtrables', async () => {
      prepare((s) => delete s.users.find((u) => u.id === 'u2')!.companyId);
      const companiesBefore = stored().companies;
      const p = await page('/instructor/evaluaciones-rendidas?curso=c1&empresa=sin-empresa');
      expect(p.rows()).toEqual(['u2|c1']);
      expect(text(p.el.querySelector('tr[data-row="u2|c1"] [data-label="Empresa"]'))).toBe('Sin empresa');
      expect(stored().companies).toEqual(companiesBefore); // no se crea ninguna empresa
      expect(stored().users.find((u) => u.id === 'u2')!.companyId).toBeUndefined();
    }, 30_000);
  });

  describe('los filtros se aplican a las tres secciones (historial, inscripciones y recuperaciones)', () => {
    /**
     * Intentos de estudiantes de las dos empresas y de uno sin empresa: Ana (u1, A) att1, Carla (u3, A) att2, Jorge
     * (u6, B) att3, Rosa (u5, B) att-r en revisión y Luis (u2, sin empresa) att-l. Recuperaciones de Carla y Rosa.
     */
    const mixed = (s: DemoState) => {
      rosaPending(s);
      delete s.users.find((u) => u.id === 'u2')!.companyId;
      const base = s.attempts.find((a) => a.id === 'att2')!;
      s.attempts.push({ ...base, id: 'att-l', userId: 'u2', date: new Date(Date.now() - 2 * H).toISOString() });
      s.recoveries.push(recovery({ id: 'rec-carla' }), recovery({ id: 'rec-rosa', userId: 'u5', reason: 'ausente' }));
    };
    const sections = (p: Awaited<ReturnType<typeof page>>) => ({
      history: p.attempts().sort(),
      rows: p.rows(),
      recoveries: [...p.el.querySelectorAll('tr[data-recovery]')].map((r) => r.getAttribute('data-recovery')).sort(),
      pending: text(p.el.querySelector('[data-pending-count]')),
    });

    it.each([
      ['empresa=emp-a', { history: ['att1', 'att2'], rows: ['u1|c1', 'u3|c1'], recoveries: ['rec-carla'], pending: 'No hay evaluaciones pendientes de calificación.' }],
      ['empresa=emp-b', { history: ['att-r', 'att3'], rows: ['u4|c1', 'u5|c1', 'u6|c1'], recoveries: ['rec-rosa'], pending: 'Hay 1 evaluación pendiente de calificación.' }],
      ['empresa=sin-empresa', { history: ['att-l'], rows: ['u2|c1'], recoveries: [], pending: 'No hay evaluaciones pendientes de calificación.' }],
      ['estudiante=u5', { history: ['att-r'], rows: ['u5|c1'], recoveries: ['rec-rosa'], pending: 'Hay 1 evaluación pendiente de calificación.' }],
      ['estudiante=u2', { history: ['att-l'], rows: ['u2|c1'], recoveries: [], pending: 'No hay evaluaciones pendientes de calificación.' }],
      ['estudiante=u5&empresa=emp-a', { history: [], rows: [], recoveries: [], pending: 'No hay evaluaciones pendientes de calificación.' }],
    ])('%s: solo los registros que corresponden', async (query, expected) => {
      prepare(mixed);
      const p = await page(`/instructor/evaluaciones-rendidas?curso=c1&${query}`);
      expect(sections(p)).toEqual(expected);
    }, 30_000);

    it('cambiar los filtros actualiza las tres secciones', async () => {
      prepare(mixed);
      const p = await page('/instructor/evaluaciones-rendidas?curso=c1');
      expect(sections(p).history).toEqual(['att-l', 'att-r', 'att1', 'att2', 'att3']);
      expect(sections(p).recoveries).toEqual(['rec-carla', 'rec-rosa']);
      await p.select('#filter-company', 'emp-b');
      await until(p.harness, () => p.router.url.includes('empresa=emp-b') && sections(p).history.length === 2);
      expect(sections(p)).toMatchObject({ history: ['att-r', 'att3'], recoveries: ['rec-rosa'], pending: 'Hay 1 evaluación pendiente de calificación.' });
      await p.select('#filter-student', 'u6');
      await until(p.harness, () => p.router.url.includes('estudiante=u6') && sections(p).history.length === 1);
      expect(sections(p)).toEqual({ history: ['att3'], rows: ['u6|c1'], recoveries: [], pending: 'No hay evaluaciones pendientes de calificación.' });
      await p.select('#filter-company', 'sin-empresa');
      await until(p.harness, () => p.router.url.includes('empresa=sin-empresa'));
      expect(sections(p)).toEqual({ history: [], rows: [], recoveries: [], pending: 'No hay evaluaciones pendientes de calificación.' });
      await p.select('#filter-student', '');
      await until(p.harness, () => !p.router.url.includes('estudiante=') && sections(p).history.length === 1);
      expect(sections(p)).toEqual({ history: ['att-l'], rows: ['u2|c1'], recoveries: [], pending: 'No hay evaluaciones pendientes de calificación.' });
    }, 40_000);
  });

  describe('detalle, respuestas y calificación', () => {
    it('8-11. detalle con objetivas y abiertas, pendientes identificadas y calificación', async () => {
      prepare(rosaPending);
      const p = await page('/instructor/evaluaciones-rendidas?curso=c1');
      expect(text(p.el.querySelector('[data-pending-count]'))).toBe('Hay 1 evaluación pendiente de calificación.');
      p.button('Ver el detalle de la evaluación de Rosa Cruz Huamán')!.click();
      await until(p.harness, () => !!p.el.querySelector('[data-detail-question]'));
      const detail = p.el.querySelector('[data-detail]')!;
      expect(text(detail)).toContain('Rosa Cruz Huamán');
      expect(text(detail)).toContain('Examen del curso · Examen regular');
      const q1 = detail.querySelector('[data-detail-question="q1"]')!;
      expect(q1.getAttribute('data-kind')).toBe('objetiva');
      expect(text(q1.querySelector('[data-answer]'))).toBe('Respuesta del estudiante: Lima');
      expect(text(q1.querySelector('[data-points]'))).toBe('Puntos: 8 de 8');
      const q6 = detail.querySelector('[data-detail-question="q6"]')!;
      expect(text(q6.querySelector('[data-answer]'))).toBe('Respuesta del estudiante: 2, 3, 7');
      expect(text(q6.querySelector('[data-correct]'))).toBe('Respuesta correcta: 2, 4, 8');
      expect(text(q6.querySelector('[data-points]'))).toBe('Puntos: 2,67 de 8');
      const qo = detail.querySelector('[data-detail-question="qo"]')!;
      expect(qo.getAttribute('data-kind')).toBe('abierta');
      expect(text(qo.querySelector('[data-answer]'))).toBe('Es la posibilidad de un daño.');
      expect(qo.querySelector('[data-pending]')).not.toBeNull();
      expect(text(detail.querySelector('[data-pending-summary]'))).toContain('Hay 1 pregunta abierta pendiente de calificación.');
      const answersBefore = stored().attempts.find((a) => a.id === 'att-r')!.answers;

      p.button('Calificar respuestas abiertas', detail)!.click();
      await until(p.harness, () => !!p.el.querySelector('#score-qo'));
      const input = p.el.querySelector<HTMLInputElement>('#score-qo')!;
      input.value = '15';
      input.dispatchEvent(new Event('input'));
      await p.harness.fixture.whenStable();
      p.button('Completar calificación')!.click();
      await until(p.harness, () => !!p.button('Sí, completar calificación'));
      p.button('Sí, completar calificación')!.click();
      await until(p.harness, () => text(p.el.querySelector('[data-detail-question="qo"] [data-points]')) === 'Puntos: 15 de 20');
      expect(p.el.querySelector('[data-detail] [data-pending-summary]')).toBeNull();
      await until(p.harness, () => text(p.el.querySelector('[data-pending-count]')) === 'No hay evaluaciones pendientes de calificación.');
      const graded = stored().attempts.find((a) => a.id === 'att-r')!;
      expect(graded.answers).toEqual(answersBefore); // las respuestas no cambian
      expect(graded.review).toMatchObject({ status: 'calificado', manualScores: { qo: 15 } });
    }, 40_000);

    it('un intento anterior al registro de respuestas se consulta sin inventar respuestas', async () => {
      prepare();
      const p = await page('/instructor/evaluaciones-rendidas?curso=c1');
      p.button('Ver el detalle de la evaluación de Carla Vega Soto')!.click();
      await until(p.harness, () => !!p.el.querySelector('[data-detail]') && !text(p.el).includes('Cargando el detalle'));
      expect(text(p.el.querySelector('[data-no-answers]'))).toBe('Este intento es anterior al registro de respuestas: solo se conserva su nota.');
      expect(text(p.el.querySelector('[data-detail]'))).toContain('50 / 100');
    }, 30_000);
  });

  describe('recuperaciones', () => {
    const COURSE = 'Curso de demostración (nombre provisional)';
    const eligibleKeys = (p: { el: HTMLElement }) => [...p.el.querySelectorAll('[data-authorize] tr[data-eligible]')].map((r) => r.getAttribute('data-eligible'));

    it('12 y 13. estado, examen, DNI, empresa, nota regular y fechas (hora de Lima); una histórica independiente se sigue leyendo', async () => {
      const opens = Date.now() + H;
      const closes = Date.now() + 3 * H;
      prepare((s) => {
        recoveryExams(s);
        s.recoveries.push(
          recovery({ id: 'rec-old', cancelledAt: new Date(Date.now() - 30 * MIN).toISOString(), authorizedAt: new Date(Date.now() - 2 * H).toISOString() }),
          recovery({ id: 'rec-cur', mode: 'independiente', examId: 'rec-ok', opensAt: new Date(opens).toISOString(), closesAt: new Date(closes).toISOString() }),
          recovery({ id: 'rec-ns', userId: 'u5', reason: 'ausente', opensAt: new Date(Date.now() - 5 * H).toISOString(), closesAt: new Date(Date.now() - 2 * H).toISOString() }),
        );
      });
      const p = await page('/instructor/evaluaciones-rendidas?curso=c1');
      const row = (id: string) => p.el.querySelector(`tr[data-recovery="${id}"]`)!;
      const cell = (id: string, label: string) => text(row(id).querySelector(`[data-label="${label}"]`));
      expect(cell('rec-cur', 'Estudiante')).toBe('Carla Vega Soto');
      expect(cell('rec-cur', 'DNI')).toBe('00000003');
      expect(cell('rec-cur', 'Empresa')).not.toBe('');
      expect(cell('rec-cur', 'Curso')).toBe(COURSE);
      expect(cell('rec-cur', 'Nota regular')).toBe('50 / 100');
      expect(cell('rec-cur', 'Examen')).toBe('Recuperación A (registro anterior)');
      expect(cell('rec-cur', 'Autorizada')).toBe(lima(Date.now() - H));
      expect(cell('rec-cur', 'Apertura')).toBe(lima(opens));
      expect(cell('rec-cur', 'Cierre')).toBe(lima(closes));
      expect(cell('rec-cur', 'Estado de la recuperación')).toBe('Autorizada · aún no abre');
      expect(cell('rec-cur', 'Inicio')).toBe('No iniciada');
      expect(cell('rec-old', 'Estado de la recuperación')).toBe('Anulada');
      expect(cell('rec-old', 'Examen')).toBe('Examen del curso (examen original)');
      expect(cell('rec-ns', 'Estado de la recuperación')).toBe('No rindió recuperación'); // registrado al consultar (corrección de R3)
      expect(cell('rec-ns', 'Nota de recuperación')).toBe('—');
      expect(p.button('Anular la recuperación de Carla Vega Soto', row('rec-cur'))).toBeDefined();
      expect(p.button('Anular la recuperación de Rosa Cruz Huamán', row('rec-ns'))).toBeUndefined();
      // Ninguna opción de examen independiente en la interfaz.
      expect(text(p.el.querySelector('[data-recoveries]'))).not.toContain('independiente');
      expect(p.el.querySelectorAll('[data-recoveries] input[type="radio"]')).toHaveLength(0);
    }, 30_000);

    it('una recuperación rendida muestra su nota; en revisión, «Pendiente de calificación»', async () => {
      prepare((s) => {
        const regular = s.attempts.find((a) => a.id === 'att2')!;
        s.recoveries.push(recovery({ startedAt: new Date(Date.now() - 2 * H).toISOString(), attemptId: 'att-rec' }));
        s.attempts.push({ ...regular, id: 'att-rec', kind: 'recuperacion', recoveryId: 'rec-1', score: 70, passed: true, date: new Date().toISOString() });
      });
      const p = await page('/instructor/evaluaciones-rendidas?curso=c1');
      const row = p.el.querySelector('tr[data-recovery="rec-1"]')!;
      expect(text(row.querySelector('[data-label="Estado de la recuperación"]'))).toBe('Rendida');
      expect(text(row.querySelector('[data-label="Nota de recuperación"]'))).toBe('70 / 100 · Aprobado');
      expect(text(row.querySelector('[data-label="Nota regular"]'))).toBe('50 / 100'); // el intento regular se conserva
      expect(text(row.querySelector('[data-label="Inicio"]'))).not.toBe('No iniciada');
    }, 30_000);

    it('14-16. solo desaprobados; se autoriza una nueva oportunidad con el examen original, con resumen antes de confirmar', async () => {
      prepare(recoveryExams); // aunque existan exámenes de recuperación antiguos, no se ofrecen
      const p = await page('/instructor/evaluaciones-rendidas?curso=c1');
      const auth = () => p.el.querySelector('[data-authorize]')!;
      // Ni aprobados (Ana) ni ausentes sin intento calificado (Luis, Pedro, Rosa): solo Carla, que desaprobó.
      expect(eligibleKeys(p)).toEqual(['u3|c1']);
      const row = auth().querySelector('tr[data-eligible="u3|c1"]')!;
      expect(text(row.querySelector('[data-label="DNI"]'))).toBe('00000003');
      expect(text(row.querySelector('[data-label="Nota del examen regular"]'))).toBe('50 / 100');
      expect(text(row.querySelector('[data-label="Estado del examen"]'))).toBe('Desaprobado');
      p.button(`Autorizar recuperación a Carla Vega Soto en ${COURSE}`, auth())!.click();
      await p.harness.fixture.whenStable();
      expect(text(auth().querySelector('[data-original]'))).toContain('«Examen del curso» (examen original, sin cambios)');
      expect(text(auth().querySelector('[data-original]'))).toContain('Sobre 100 · nota mínima 60 · 20 minutos · 10 preguntas · 1 intento');
      expect(text(auth().querySelector('[data-summary]'))).toContain('nueva oportunidad para rendir el examen original «Examen del curso»');
      expect(auth().querySelectorAll('input[type="radio"], #rec-exam')).toHaveLength(0);
      const before = { exams: stored().exams, questions: stored().questions };
      p.button('Confirmar autorización', auth())!.click();
      await until(p.harness, () => !!p.el.querySelector('tr[data-recovery]'));
      expect(stored().recoveries).toMatchObject([{ userId: 'u3', mode: 'original', examId: 'c1-e1', regularExamId: 'c1-e1', authorizedBy: 'a1' }]);
      expect({ exams: stored().exams, questions: stored().questions }).toEqual(before); // sin duplicar ni modificar el examen
      expect(text(p.el.querySelector('[data-recoveries]'))).toContain('Recuperación autorizada (demostración) para Carla Vega Soto');
      // 17. ya no se ofrece de nuevo (una sola oportunidad).
      expect(eligibleKeys(p)).not.toContain('u3|c1');
    }, 40_000);

    it('17. fechas inválidas: el repositorio rechaza y no se crea nada', async () => {
      prepare();
      const p = await page('/instructor/evaluaciones-rendidas?curso=c1');
      const auth = () => p.el.querySelector('[data-authorize]')!;
      p.button(`Autorizar recuperación a Carla Vega Soto en ${COURSE}`, auth())!.click();
      await p.harness.fixture.whenStable();
      const set = (sel: string, v: string) => {
        const i = auth().querySelector<HTMLInputElement>(sel)!;
        i.value = v;
        i.dispatchEvent(new Event('input'));
      };
      set('#rec-opens', '2026-12-10T10:00');
      set('#rec-closes', '2026-12-10T09:00');
      await p.harness.fixture.whenStable();
      p.button('Confirmar autorización', auth())!.click();
      await until(p.harness, () => !!auth().querySelector('.alert-danger'));
      expect(text(auth().querySelector('.alert-danger'))).toBe('La fecha y hora de cierre deben ser posteriores a la apertura.');
      expect(stored().recoveries).toEqual([]);
    }, 30_000);

    it('anular antes del inicio: queda «Anulada» y el estudiante vuelve a poder recibirla', async () => {
      prepare((s) => s.recoveries.push(recovery({})));
      const p = await page('/instructor/evaluaciones-rendidas?curso=c1');
      const row = () => p.el.querySelector('tr[data-recovery="rec-1"]')!;
      expect(eligibleKeys(p)).toEqual([]);
      p.button('Anular la recuperación de Carla Vega Soto', row())!.click();
      await p.harness.fixture.whenStable();
      p.button('Confirmar anulación', row())!.click();
      await until(p.harness, () => text(row().querySelector('[data-label="Estado de la recuperación"]')) === 'Anulada');
      expect(stored().recoveries[0].cancelledAt).toBeTruthy();
      await until(p.harness, () => eligibleKeys(p).includes('u3|c1'));
    }, 30_000);
  });

  it('18. R4: la tabla por inscripción conserva nota regular, de recuperación y final', async () => {
    prepare((s) => {
      const regular = s.attempts.find((a) => a.id === 'att2')!;
      s.recoveries.push(recovery({ startedAt: new Date(Date.now() - 2 * H).toISOString(), attemptId: 'att-rec' }));
      s.attempts.push({ ...regular, id: 'att-rec', kind: 'recuperacion', recoveryId: 'rec-1', score: 30, passed: false, date: new Date().toISOString() });
    });
    const p = await page('/instructor/evaluaciones-rendidas?curso=c1', false);
    const row = p.el.querySelector('tr[data-row="u3|c1"]')!;
    expect(text(row.querySelector('[data-label="Nota regular"]'))).toBe('50 / 100');
    expect(text(row.querySelector('[data-label="Recuperación"]'))).toBe('30 / 100');
    expect(text(row.querySelector('[data-label="Nota final"]'))).toBe('30 / 100');
  }, 30_000);
});
