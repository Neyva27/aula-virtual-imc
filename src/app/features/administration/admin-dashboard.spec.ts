import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { firstValueFrom } from 'rxjs';
import { AdminDashboard } from './admin-dashboard';
import { DataRepository } from '../../core/services/data-repository';
import { MockDataRepository } from '../../core/services/mock-data-repository';

/** F1.1: Dashboard multicurso con el repositorio simulado real y el router real (?curso=). Datos ficticios. */
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

async function setup(url = '/admin', prepare?: (repo: DataRepository) => Promise<unknown>) {
  localStorage.clear();
  sessionStorage.clear();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: 'admin', component: AdminDashboard }], withComponentInputBinding()),
      { provide: DataRepository, useClass: MockDataRepository },
    ],
  });
  const repo = TestBed.inject(DataRepository);
  if (prepare) await prepare(repo);
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url, AdminDashboard);
  const el = harness.routeNativeElement as HTMLElement;
  await until(harness, () => el.querySelectorAll('.stat').length === 5);
  return { harness, el, repo };
}

/** Valor de cada tarjeta de métrica, por su título. */
function stats(el: HTMLElement): Record<string, string> {
  return Object.fromEntries([...el.querySelectorAll('.stat')].map((s) => [text(s.querySelector('span')), text(s.querySelector('strong'))]));
}

async function selectCourse(harness: RouterTestingHarness, el: HTMLElement, value: string): Promise<void> {
  const select = el.querySelector<HTMLSelectElement>('#admin-course-select')!;
  select.value = value;
  select.dispatchEvent(new Event('change'));
  await until(harness, () => (value ? TestBed.inject(Router).url.endsWith(`curso=${value}`) : !TestBed.inject(Router).url.includes('curso=')));
  await harness.fixture.whenStable();
}

describe('AdminDashboard multicurso (F1.1)', () => {
  it('con todos los cursos distingue participantes únicos de inscripciones', async () => {
    const { el } = await setup();
    expect(stats(el)).toEqual({
      'Participantes registrados': '6',
      Inscripciones: '10', // 6 en c1 + 2 en IA + 2 en Marketing (Pedro tiene 3 cursos)
      'Capacitaciones en progreso': '3',
      Aprobaciones: '2',
      'Certificados emitidos': '1',
    });
    expect([...el.querySelectorAll('#admin-course-select option')].map(text)[0]).toBe('Todos los cursos');
    const recent = [...el.querySelectorAll('tbody tr')].map(text);
    expect(recent.length).toBe(3);
    expect(recent[0]).toContain('Curso de demostración (nombre provisional)');
    expect(recent[0]).toContain('90 / 100');
  }, 20_000);

  it('el filtro por curso actualiza las métricas y los intentos; «Todos los cursos» las restablece', async () => {
    const { harness, el } = await setup();
    await selectCourse(harness, el, 'c-ia');
    expect(stats(el)).toEqual({
      'Participantes inscritos': '2',
      Inscripciones: '2',
      'Capacitaciones en progreso': '0',
      Aprobaciones: '0',
      'Certificados emitidos': '0',
    });
    expect(text(el)).toContain('No hay intentos registrados en este curso.');

    await selectCourse(harness, el, 'c1');
    expect(stats(el)['Participantes inscritos']).toBe('6');
    expect(stats(el)['Aprobaciones']).toBe('2');
    expect(stats(el)['Certificados emitidos']).toBe('1');
    expect(el.querySelectorAll('tbody tr').length).toBe(3);

    await selectCourse(harness, el, '');
    expect(stats(el)['Participantes registrados']).toBe('6');
    expect(stats(el)['Inscripciones']).toBe('10');
  }, 30_000);

  it('cuenta a los participantes sin cursos y abre el curso indicado en ?curso=', async () => {
    const { el } = await setup('/admin?curso=c-mkt', (repo) =>
      firstValueFrom(repo.addParticipant({ fullName: 'Persona Sin Cursos', email: 'sincursos@ejemplo.test', dni: '00000055' }, [])),
    );
    expect(el.querySelector<HTMLSelectElement>('#admin-course-select')!.value).toBe('c-mkt');
    expect(stats(el)['Participantes inscritos']).toBe('2');
    expect(stats(el)['Capacitaciones en progreso']).toBe('1');
  }, 20_000);

  it('sin filtro muestra cuántos participantes no tienen cursos', async () => {
    const { el } = await setup('/admin', (repo) =>
      firstValueFrom(repo.addParticipant({ fullName: 'Persona Sin Cursos', email: 'sincursos@ejemplo.test', dni: '00000055' }, [])),
    );
    expect(stats(el)['Participantes registrados']).toBe('7');
    expect(stats(el)['Inscripciones']).toBe('10');
    expect(text(el)).toContain('1 sin cursos asignados');
  }, 20_000);
});
