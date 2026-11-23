import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { AdminResults } from './admin-results';
import { DataRepository } from '../../core/services/data-repository';
import { MockDataRepository, STORAGE_KEY } from '../../core/services/mock-data-repository';
import { DemoState } from '../../core/data/demo-state';

/**
 * F1.3: resultados multicurso con el repositorio simulado real y el router real (?curso=).
 * Los estados especiales se preparan solo en el localStorage aislado de la prueba. Datos ficticios.
 */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

async function until(harness: RouterTestingHarness, cond: () => boolean, timeout = 8000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    await harness.fixture.whenStable();
    if (cond()) return;
    await sleep(50);
  }
  throw new Error('La condición no se cumplió a tiempo');
}

async function setup(url = '/admin/resultados', edit?: (s: DemoState) => void) {
  localStorage.clear();
  sessionStorage.clear();
  if (edit) {
    new MockDataRepository().resetDemo();
    const s: DemoState = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    edit(s);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  }
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: 'admin/resultados', component: AdminResults }], withComponentInputBinding()),
      { provide: DataRepository, useClass: MockDataRepository },
    ],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url, AdminResults);
  const el = harness.routeNativeElement as HTMLElement;
  await until(harness, () => !!el.querySelector('h2') && !text(el).includes('Cargando'));
  return { harness, el };
}

const rows = (el: HTMLElement) => [...el.querySelectorAll('tr[data-row]')].map((r) => r.getAttribute('data-row'));
const attempts = (el: HTMLElement) => [...el.querySelectorAll('tr[data-attempt]')];
const row = (el: HTMLElement, key: string) => text(el.querySelector(`tr[data-row="${key}"]`));

async function selectCourse(harness: RouterTestingHarness, el: HTMLElement, value: string): Promise<void> {
  const select = el.querySelector<HTMLSelectElement>('#admin-course-select')!;
  select.value = value;
  select.dispatchEvent(new Event('change'));
  await until(harness, () => (value ? TestBed.inject(Router).url.endsWith(`curso=${value}`) : !TestBed.inject(Router).url.includes('curso=')));
  await harness.fixture.whenStable();
}

describe('AdminResults multicurso (F1.3)', () => {
  it('con todos los cursos muestra cada inscripción con su curso y todo el historial', async () => {
    const { el } = await setup();
    expect(rows(el).length).toBe(10);
    expect(row(el, 'u4|c-mkt')).toContain('Fundamentos del Marketing Digital');
    expect(row(el, 'u2|c-mkt')).toContain('100%'); // vio el único video de Marketing
    expect(attempts(el).length).toBe(3);
    expect(row(el, 'u3|c1')).toContain('1 de 1');
    expect(row(el, 'u3|c1')).toContain('50 / 100');
  }, 20_000);

  it('el filtro por curso no mezcla cursos', async () => {
    const { harness, el } = await setup();
    await selectCourse(harness, el, 'c-mkt');
    expect(rows(el)).toEqual(['u2|c-mkt', 'u4|c-mkt']);
    expect(attempts(el)).toEqual([]);
    expect(text(el)).toContain('No hay intentos registrados en este curso.');

    await selectCourse(harness, el, 'c1');
    expect(rows(el).every((k) => k!.endsWith('|c1'))).toBe(true);
    expect(rows(el).length).toBe(6);
    expect(attempts(el).map((a) => a.getAttribute('data-attempt'))).toEqual(['att3', 'att1', 'att2']);

    await selectCourse(harness, el, '');
    expect(rows(el).length).toBe(10);
  }, 30_000);

  it('cada nota usa la escala guardada en su intento, no la configuración actual del examen', async () => {
    const { el } = await setup('/admin/resultados?curso=c1', (s) => {
      const att = s.attempts.find((a) => a.id === 'att1')!;
      att.score = 16;
      att.scaleMax = 20; // intento calificado cuando la escala era 20
    });
    expect(text(el.querySelector('tr[data-attempt="att1"]'))).toContain('16 / 20');
    expect(row(el, 'u1|c1')).toContain('16 / 20');
    expect(text(el.querySelector('tr[data-attempt="att2"]'))).toContain('50 / 100');
  }, 20_000);

  it('conserva el historial de un curso que el alumno ya no tiene asignado', async () => {
    const { el } = await setup('/admin/resultados', (s) => {
      s.enrollments = s.enrollments.filter((e) => !(e.userId === 'u3' && e.courseId === 'c1'));
    });
    expect(rows(el)).not.toContain('u3|c1');
    const carla = text(el.querySelector('tr[data-attempt="att2"]'));
    expect(carla).toContain('Carla Vega Soto');
    expect(carla).toContain('Ya no asignado');
    expect(carla).toContain('50 / 100');
  }, 20_000);

  it('un ?curso= inexistente muestra todos los cursos', async () => {
    const { el } = await setup('/admin/resultados?curso=no-existe');
    expect(rows(el).length).toBe(10);
    expect(el.querySelector<HTMLSelectElement>('#admin-course-select')!.value).toBe('');
  }, 20_000);
});
