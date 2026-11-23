import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { Router, provideRouter } from '@angular/router';
import { Login } from './login';
import { DataRepository } from '../../../core/services/data-repository';
import { MockDataRepository } from '../../../core/services/mock-data-repository';

/** F3.1: mensajes del inicio de sesión coherentes con el estado del formulario. Datos ficticios. */
@Component({ template: '' })
class Stub {}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const WRONG = 'Correo o contraseña incorrectos.';

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
  TestBed.configureTestingModule({
    providers: [
      provideRouter([
        { path: 'panel', component: Stub },
        { path: 'admin', component: Stub },
      ]),
      { provide: DataRepository, useClass: MockDataRepository },
    ],
  });
  const fixture = TestBed.createComponent(Login);
  const el = fixture.nativeElement as HTMLElement;
  await fixture.whenStable();
  return { fixture, el };
}

function type(el: HTMLElement, selector: string, value: string): void {
  const input = el.querySelector<HTMLInputElement>(selector)!;
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}
const submit = (el: HTMLElement) => el.querySelector<HTMLButtonElement>('button[type=submit]')!.click();
const alert = (el: HTMLElement) => el.querySelector('.alert-danger');
const errors = (el: HTMLElement) => [...el.querySelectorAll('.error-text')].map(text);

async function failLogin(fixture: ComponentFixture<Login>, el: HTMLElement): Promise<void> {
  type(el, '#email', 'ana@ejemplo.test');
  type(el, '#password', 'clave-incorrecta');
  submit(el);
  await until(fixture, () => !!alert(el));
  expect(text(alert(el))).toBe(WRONG);
}

describe('Inicio de sesión (F3.1)', () => {
  it('el aviso de credenciales desaparece en cuanto se edita un campo', async () => {
    const { fixture, el } = await setup();
    await failLogin(fixture, el);
    type(el, '#password', 'clave-incorrecta2');
    await fixture.whenStable();
    expect(alert(el)).toBeNull();

    await failLogin(fixture, el);
    type(el, '#email', 'otra@ejemplo.test');
    await fixture.whenStable();
    expect(alert(el)).toBeNull();
  }, 20_000);

  it('con los campos vacíos muestra las validaciones y no el aviso de credenciales', async () => {
    const { fixture, el } = await setup();
    await failLogin(fixture, el);
    type(el, '#email', '');
    type(el, '#password', '');
    submit(el);
    await fixture.whenStable();
    expect(alert(el)).toBeNull();
    expect(errors(el)).toEqual(['Ingresa tu correo electrónico.', 'Ingresa tu contraseña.']);
  }, 20_000);

  it('las validaciones de formato siguen activas y el aviso no revela si la cuenta existe', async () => {
    const { fixture, el } = await setup();
    type(el, '#email', 'no-es-un-correo');
    type(el, '#password', '123');
    submit(el);
    await fixture.whenStable();
    expect(errors(el)).toEqual([
      'Escribe un correo válido, por ejemplo nombre@dominio.com.',
      'La contraseña debe tener al menos 6 caracteres.',
    ]);
    // Correo inexistente y contraseña incorrecta de una cuenta existente: mismo mensaje.
    type(el, '#email', 'nadie@ejemplo.test');
    type(el, '#password', 'demo1234');
    submit(el);
    await until(fixture, () => !!alert(el));
    expect(text(alert(el))).toBe(WRONG);
  }, 20_000);

  it('«Usar» una cuenta de prueba borra el aviso y el inicio correcto navega', async () => {
    const { fixture, el } = await setup();
    await failLogin(fixture, el);
    [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => text(b) === 'Usar')!.click();
    await fixture.whenStable();
    expect(alert(el)).toBeNull();
    submit(el);
    await until(fixture, () => TestBed.inject(Router).url !== '/');
    expect(alert(el)).toBeNull();
  }, 20_000);
});
