import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { firstValueFrom } from 'rxjs';
import { Login } from './login';
import { AuthLayout } from '../../../layouts/auth-layout/auth-layout';
import { DataRepository } from '../../../core/services/data-repository';
import { MockDataRepository, STORAGE_KEY } from '../../../core/services/mock-data-repository';

/**
 * V5: confirmación de «Restablecer datos de demostración», etiquetas de las cuentas de prueba y enlace
 * «Saltar al contenido» del layout público. Todo ocurre en el localStorage aislado de la prueba.
 */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

async function setup() {
  localStorage.clear();
  sessionStorage.clear();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: '', component: AuthLayout, children: [{ path: 'login', component: Login }] }]),
      { provide: DataRepository, useClass: MockDataRepository },
    ],
  });
  const repo = TestBed.inject(DataRepository);
  // Un cambio hecho durante la demostración, para comprobar si se conserva o se pierde.
  await firstValueFrom(repo.addParticipant({ fullName: 'Persona De Prueba', email: 'prueba@ejemplo.test', dni: '00000088' }, []));
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl('/login');
  const el = harness.fixture.nativeElement as HTMLElement;
  return { harness, el, repo, saved: localStorage.getItem(STORAGE_KEY) };
}

const button = (el: HTMLElement, label: string) => [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => text(b) === label);
const hasTestUser = async (repo: DataRepository) => (await firstValueFrom(repo.getUsers())).some((u) => u.email === 'prueba@ejemplo.test');

describe('Restablecer datos de demostración (V5)', () => {
  it('pide confirmación, explica qué se pierde y pone el foco en «Cancelar»', async () => {
    const { harness, el, repo } = await setup();
    const spy = vi.spyOn(repo, 'resetDemo');
    button(el, 'Restablecer datos de demostración')!.click();
    await harness.fixture.whenStable();
    await sleep(10);
    const dialog = el.querySelector('[role="alertdialog"]')!;
    expect(text(dialog.querySelector('#reset-title'))).toBe('¿Restablecer los datos de demostración?');
    expect(text(dialog.querySelector('#reset-desc'))).toContain('Se reemplazarán los datos guardados en este navegador');
    expect(document.activeElement).toBe(button(el, 'Cancelar'));
    expect(button(el, 'Restablecer datos de demostración')).toBeUndefined();
    expect(spy).not.toHaveBeenCalled();
  });

  it('«Cancelar» deja todos los datos intactos y devuelve el foco al botón', async () => {
    const { harness, el, repo, saved } = await setup();
    const spy = vi.spyOn(repo, 'resetDemo');
    button(el, 'Restablecer datos de demostración')!.click();
    await harness.fixture.whenStable();
    button(el, 'Cancelar')!.click();
    await harness.fixture.whenStable();
    await sleep(10);
    expect(spy).not.toHaveBeenCalled();
    expect(localStorage.getItem(STORAGE_KEY)).toBe(saved);
    expect(await hasTestUser(repo)).toBe(true);
    expect(el.querySelector('[role="alertdialog"]')).toBeNull();
    expect(document.activeElement).toBe(button(el, 'Restablecer datos de demostración'));
    expect(text(el)).not.toContain('Datos de demostración restablecidos.');
  });

  it('Escape también cancela sin tocar los datos', async () => {
    const { harness, el, repo, saved } = await setup();
    const spy = vi.spyOn(repo, 'resetDemo');
    button(el, 'Restablecer datos de demostración')!.click();
    await harness.fixture.whenStable();
    el.querySelector('[role="alertdialog"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await harness.fixture.whenStable();
    expect(spy).not.toHaveBeenCalled();
    expect(localStorage.getItem(STORAGE_KEY)).toBe(saved);
    expect(el.querySelector('[role="alertdialog"]')).toBeNull();
  });

  it('«Sí, restablecer» ejecuta el restablecimiento de siempre una sola vez', async () => {
    const { harness, el, repo } = await setup();
    const spy = vi.spyOn(repo, 'resetDemo');
    expect(await hasTestUser(repo)).toBe(true);
    button(el, 'Restablecer datos de demostración')!.click();
    await harness.fixture.whenStable();
    button(el, 'Sí, restablecer')!.click();
    await harness.fixture.whenStable();
    await sleep(10);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(await hasTestUser(repo)).toBe(false); // vuelven los datos de prueba iniciales
    expect((await firstValueFrom(repo.getUsers())).length).toBe(7);
    expect(text(el.querySelector('.alert-success'))).toBe('Datos de demostración restablecidos.');
    expect(document.activeElement).toBe(button(el, 'Restablecer datos de demostración'));
  });
});

describe('Cuentas de prueba y layout público (V5)', () => {
  it('separa el rol y el estado de cada cuenta sin cambiar los correos', async () => {
    const { el } = await setup();
    const items = [...el.querySelectorAll('.demo__list li')];
    expect(items.map((li) => text(li.querySelector('.badge')))).toEqual([
      'Participante', 'Participante', 'Participante', 'Participante', 'Participante', 'Participante', 'Instructor',
    ]);
    expect(text(items[0].querySelector('.demo__role strong'))).toBe('aprobada, con certificado');
    expect(items[6].querySelector('.demo__role strong')).toBeNull();
    expect(text(items[6])).toContain('admin@ejemplo.test');
  });

  it('el primer elemento enfocable es «Saltar al contenido», que apunta al contenido principal', async () => {
    const { el } = await setup();
    const skip = el.querySelector<HTMLAnchorElement>('a.skip')!;
    expect(text(skip)).toBe('Saltar al contenido');
    expect(skip.getAttribute('href')).toBe('#contenido');
    const main = el.querySelector('main#contenido')!;
    expect(main.getAttribute('tabindex')).toBe('-1');
    expect(main.querySelector('#email')).not.toBeNull();
    expect(el.querySelector('a, button, input')).toBe(skip);
  });

  it('al activar «Saltar al contenido» el foco pasa al contenido principal', async () => {
    const { harness, el } = await setup();
    document.body.appendChild(el); // focus() solo funciona en elementos del documento
    try {
      const skip = el.querySelector<HTMLAnchorElement>('a.skip')!;
      const main = el.querySelector<HTMLElement>('main#contenido')!;
      main.scrollIntoView = vi.fn(); // jsdom no implementa scrollIntoView
      const click = new MouseEvent('click', { bubbles: true, cancelable: true });
      skip.dispatchEvent(click);
      await harness.fixture.whenStable();
      expect(click.defaultPrevented).toBe(true); // el salto lo gestiona la aplicación, sin cambiar la URL
      expect(document.activeElement).toBe(el.querySelector('main#contenido'));
    } finally {
      el.remove();
    }
  });
});
