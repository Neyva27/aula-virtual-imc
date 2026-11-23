import { ComponentFixture, TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { AdminParticipants } from './admin-participants';
import { DataRepository } from '../../core/services/data-repository';
import { MockDataRepository } from '../../core/services/mock-data-repository';

/** F1.2: participantes y asignación de cursos con el repositorio simulado real. Datos ficticios. */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

async function until(fixture: ComponentFixture<unknown>, cond: () => boolean, timeout = 8000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    await fixture.whenStable();
    if (cond()) return;
    await sleep(50);
  }
  throw new Error('La condición no se cumplió a tiempo');
}

async function setup() {
  localStorage.clear();
  sessionStorage.clear();
  TestBed.configureTestingModule({ providers: [{ provide: DataRepository, useClass: MockDataRepository }] });
  const repo = TestBed.inject(DataRepository);
  const fixture = TestBed.createComponent(AdminParticipants);
  const el = fixture.nativeElement as HTMLElement;
  await until(fixture, () => el.querySelectorAll('tr[data-user]').length > 0 && el.querySelectorAll('li[data-course]').length > 0);
  return { fixture, el, repo };
}

const userRow = (el: HTMLElement, userId: string) => el.querySelector<HTMLTableRowElement>(`tr[data-user="${userId}"]`)!;
const coursesOf = (el: HTMLElement, userId: string) =>
  [...userRow(el, userId).querySelectorAll('li[data-course]')].map((li) => li.getAttribute('data-course'));
const button = (scope: Element, label: string) =>
  [...scope.querySelectorAll<HTMLButtonElement>('button')].find((b) => text(b) === label || b.getAttribute('aria-label') === label)!;

function type(el: HTMLElement, selector: string, value: string): void {
  const input = el.querySelector<HTMLInputElement>(selector)!;
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

async function snapshot(repo: DataRepository) {
  return {
    attempts: await firstValueFrom(repo.listAttempts()),
    certificates: await firstValueFrom(repo.listCertificates()),
    c1: await firstValueFrom(repo.getCourse()),
    mkt: await firstValueFrom(repo.getCourseContent('c-mkt')),
  };
}

describe('AdminParticipants multicurso (F1.2)', () => {
  it('muestra todos los cursos asignados de cada participante, con estado y avance', async () => {
    const { el } = await setup();
    expect(coursesOf(el, 'u4')).toEqual(['c1', 'c-ia', 'c-mkt']);
    expect(coursesOf(el, 'u3')).toEqual(['c1']);
    const luis = text(userRow(el, 'u2'));
    expect(luis).toContain('Curso de demostración (nombre provisional)');
    expect(luis).toContain('Fundamentos del Marketing Digital');
    expect(luis).toContain('50%');
    expect(luis).toContain('100%');
    // Pedro tiene todos los cursos: no se ofrece asignar más.
    expect(text(userRow(el, 'u4'))).toContain('Tiene todos los cursos asignados.');
  }, 20_000);

  it('registra un participante sin cursos y lo muestra como «Sin cursos asignados»', async () => {
    const { fixture, el, repo } = await setup();
    button(el, 'Registrar participante').click();
    await until(fixture, () => !!el.querySelector('#p-name'));
    // Las validaciones siguen activas.
    button(el, 'Registrar').click();
    await fixture.whenStable();
    expect([...el.querySelectorAll('.error-text')].map(text)).toEqual([
      'Ingresa nombres y apellidos.',
      'Ingresa un correo válido.',
      'El DNI debe tener 8 dígitos.',
    ]);
    type(el, '#p-name', 'Persona Sin Cursos');
    type(el, '#p-email', 'sincursos@ejemplo.test');
    type(el, '#p-dni', '00000055');
    button(el, 'Registrar').click();
    await until(fixture, () => text(el).includes('Participante registrado'));
    const user = (await firstValueFrom(repo.getUsers())).find((u) => u.email === 'sincursos@ejemplo.test')!;
    await until(fixture, () => !!userRow(el, user.id));
    expect(text(userRow(el, user.id))).toContain('Sin cursos asignados');
    expect(await firstValueFrom(repo.listEnrollments({ userId: user.id }))).toEqual([]);
  }, 20_000);

  it('registra un participante con varios cursos', async () => {
    const { fixture, el, repo } = await setup();
    button(el, 'Registrar participante').click();
    await until(fixture, () => !!el.querySelector('#p-name'));
    type(el, '#p-name', 'Persona Con Cursos');
    type(el, '#p-email', 'concursos@ejemplo.test');
    type(el, '#p-dni', '00000056');
    const boxes = [...el.querySelectorAll<HTMLInputElement>('form input[type=checkbox]')];
    expect(boxes.length).toBe(3);
    boxes[1].click(); // IA
    boxes[2].click(); // Marketing
    await fixture.whenStable();
    button(el, 'Registrar').click();
    await until(fixture, () => text(el).includes('Participante registrado'));
    const user = (await firstValueFrom(repo.getUsers())).find((u) => u.email === 'concursos@ejemplo.test')!;
    expect((await firstValueFrom(repo.listEnrollments({ userId: user.id }))).map((e) => e.courseId)).toEqual(['c-ia', 'c-mkt']);
    await until(fixture, () => coursesOf(el, user.id).length === 2);
  }, 20_000);

  it('asigna un curso a un participante existente y no permite duplicarlo', async () => {
    const { fixture, el, repo } = await setup();
    const select = userRow(el, 'u3').querySelector<HTMLSelectElement>('select')!;
    expect([...select.options].map((o) => o.value)).toEqual(['', 'c-ia', 'c-mkt']); // c1 ya asignado: no se ofrece
    select.value = 'c-ia';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    button(userRow(el, 'u3'), 'Asignar').click();
    await until(fixture, () => coursesOf(el, 'u3').includes('c-ia'));
    expect(text(el)).toContain('asignado a Carla Vega Soto');
    expect([...userRow(el, 'u3').querySelector<HTMLSelectElement>('select')!.options].map((o) => o.value)).toEqual(['', 'c-mkt']);

    // Si el curso se asigna por otra vía antes de pulsar «Asignar», el repositorio rechaza el duplicado.
    const select2 = userRow(el, 'u3').querySelector<HTMLSelectElement>('select')!;
    select2.value = 'c-mkt';
    select2.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    await firstValueFrom(repo.enrollParticipant('u3', 'c-mkt'));
    button(userRow(el, 'u3'), 'Asignar').click();
    await until(fixture, () => !!el.querySelector('.alert-danger'));
    expect(text(el.querySelector('.alert-danger'))).toBe('No se pudo asignar el curso: El participante ya tiene este curso asignado.');
    expect((await firstValueFrom(repo.listEnrollments({ userId: 'u3' }))).map((e) => e.courseId)).toEqual(['c1', 'c-ia', 'c-mkt']);
  }, 30_000);

  it('retira un curso sin eliminar al participante ni su historial', async () => {
    const { fixture, el, repo } = await setup();
    const before = await snapshot(repo);
    button(userRow(el, 'u1'), 'Retirar Introducción a la Inteligencia Artificial de Ana Torres Quispe').click();
    await fixture.whenStable();
    expect(text(userRow(el, 'u1'))).toContain('¿Retirar este curso?');
    button(userRow(el, 'u1'), 'Retirar').click();
    await until(fixture, () => !coursesOf(el, 'u1').includes('c-ia'));
    expect(text(el)).toContain('retirado de Ana Torres Quispe. El participante y su historial se conservan.');
    expect(coursesOf(el, 'u1')).toEqual(['c1']);
    expect((await firstValueFrom(repo.getUsers())).some((u) => u.id === 'u1')).toBe(true);
    expect(await snapshot(repo)).toEqual(before);
  }, 30_000);

  it('no retira un curso con avance, intentos o certificados y lo explica', async () => {
    const { fixture, el, repo } = await setup();
    button(userRow(el, 'u1'), 'Retirar Curso de demostración (nombre provisional) de Ana Torres Quispe').click();
    await fixture.whenStable();
    button(userRow(el, 'u1'), 'Retirar').click();
    await until(fixture, () => !!el.querySelector('.alert-danger'));
    expect(text(el.querySelector('.alert-danger'))).toBe(
      'No se puede retirar el curso: el participante ya tiene avance, intentos o certificados en él.',
    );
    expect(coursesOf(el, 'u1')).toEqual(['c1', 'c-ia']);
    expect((await firstValueFrom(repo.listCertificates({ userId: 'u1' }))).map((c) => c.code)).toEqual(['IMC-DEMO-0001']);
  }, 20_000);
});
