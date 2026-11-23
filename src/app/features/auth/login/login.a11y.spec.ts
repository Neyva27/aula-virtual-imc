import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Login } from './login';
import { DataRepository } from '../../../core/services/data-repository';
import { MockDataRepository } from '../../../core/services/mock-data-repository';

/** V4: accesibilidad del formulario de inicio de sesión (errores asociados a sus campos y botón «Mostrar»). */
const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

async function setup() {
  localStorage.clear();
  sessionStorage.clear();
  TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: DataRepository, useClass: MockDataRepository }] });
  const fixture = TestBed.createComponent(Login);
  await fixture.whenStable();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

describe('Inicio de sesión: accesibilidad (V4)', () => {
  it('asocia cada mensaje de error a su campo con aria-describedby y marca aria-invalid', async () => {
    const { fixture, el } = await setup();
    const email = el.querySelector<HTMLInputElement>('#email')!;
    const password = el.querySelector<HTMLInputElement>('#password')!;
    expect(email.getAttribute('aria-describedby')).toBeNull();
    el.querySelector<HTMLButtonElement>('button[type=submit]')!.click();
    await fixture.whenStable();
    expect(email.getAttribute('aria-invalid')).toBe('true');
    expect(email.getAttribute('aria-describedby')).toBe('email-error');
    expect(text(el.querySelector('#email-error'))).toBe('Ingresa tu correo electrónico.');
    expect(password.getAttribute('aria-describedby')).toBe('password-error');
    expect(text(el.querySelector('#password-error'))).toBe('Ingresa tu contraseña.');
  });

  it('«Mostrar» indica su estado con aria-pressed y cambia el tipo del campo', async () => {
    const { fixture, el } = await setup();
    const toggle = [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => text(b) === 'Mostrar')!;
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    toggle.click();
    await fixture.whenStable();
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(text(toggle)).toBe('Ocultar');
    expect(el.querySelector<HTMLInputElement>('#password')!.type).toBe('text');
  });

  it('cada cuenta de prueba tiene su botón «Usar» y la acción de restablecer queda separada al pie', async () => {
    const { el } = await setup();
    expect([...el.querySelectorAll('.demo__list button')].every((b) => text(b) === 'Usar')).toBe(true);
    expect(el.querySelectorAll('.demo__list li').length).toBe(7);
    expect(text(el.querySelector('.demo__foot .demo__reset'))).toBe('Restablecer datos de demostración');
  });
});
