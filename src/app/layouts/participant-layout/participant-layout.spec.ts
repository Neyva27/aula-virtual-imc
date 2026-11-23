import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { firstValueFrom } from 'rxjs';
import { routes } from '../../app.routes';
import { AuthService } from '../../core/services/auth.service';
import { DataRepository } from '../../core/services/data-repository';
import { MockDataRepository } from '../../core/services/mock-data-repository';
import { ExamSessionService } from '../../core/services/exam-session.service';
import { DEMO_CONFIG } from '../../core/config/demo.config';

/** V2: navegación del alumno y modo enfoque del examen, con las rutas reales. Datos ficticios. */
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

async function setup(email: string) {
  localStorage.clear();
  sessionStorage.clear();
  TestBed.configureTestingModule({
    providers: [provideRouter(routes, withComponentInputBinding()), { provide: DataRepository, useClass: MockDataRepository }],
  });
  await firstValueFrom(TestBed.inject(AuthService).login(email, DEMO_CONFIG.demoPassword));
  const harness = await RouterTestingHarness.create();
  return { harness, root: harness.fixture.nativeElement as HTMLElement, router: TestBed.inject(Router) };
}

describe('Navegación del alumno (V2)', () => {
  it('muestra el menú con iconos decorativos, el nombre del alumno y «Salir»', async () => {
    const { harness, root } = await setup('ana@ejemplo.test');
    await harness.navigateByUrl('/panel');
    await until(harness, () => !!root.querySelector('.top__nav a'));
    const links = [...root.querySelectorAll<HTMLAnchorElement>('.top__nav a')];
    expect(links.map(text)).toEqual(['Mis cursos', 'Mi progreso', 'Mis certificados']);
    expect(links.every((a) => a.querySelector('svg')?.getAttribute('aria-hidden') === 'true')).toBe(true);
    expect(root.querySelector('.top__nav')!.getAttribute('aria-label')).toBe('Navegación principal');
    expect(text(root.querySelector('.top__avatar'))).toBe('AT');
    expect(root.querySelector('.top__avatar')!.getAttribute('aria-hidden')).toBe('true');
    expect(text(root.querySelector('.top__name'))).toBe('Ana Torres Quispe');
    expect([...root.querySelectorAll('.top button')].some((b) => text(b) === 'Salir')).toBe(true);
    expect(root.querySelector('.top__focus')).toBeNull();
  }, 20_000);

  it('al rendir el examen activa el modo enfoque: sin menú, sin «Salir» y sin enlace en el logo', async () => {
    const { harness, root } = await setup('rosa@ejemplo.test');
    TestBed.inject(ExamSessionService).start('u5', 20, 'c1-e1');
    await harness.navigateByUrl('/cursos/c1/examen/rendir');
    await until(harness, () => !!root.querySelector('.opts input'));
    expect(root.querySelector('.top__nav')).toBeNull();
    expect([...root.querySelectorAll('.top button')].some((b) => text(b).includes('Salir'))).toBe(false);
    expect(root.querySelector('.top a')).toBeNull();
    expect(text(root.querySelector('.top__focus'))).toBe('Examen en curso');
    expect(root.querySelector('main')!.classList).toContain('is-focus');
    // El examen conserva temporizador, navegación entre preguntas y entrega.
    expect(root.querySelector('[role="timer"]')).not.toBeNull();
    const buttons = [...root.querySelectorAll<HTMLButtonElement>('main button')].map(text);
    expect(buttons).toEqual(expect.arrayContaining(['Anterior', 'Siguiente', 'Finalizar y enviar']));
    expect(root.querySelectorAll('.chip').length).toBe(10);
  }, 20_000);

  it('el modo enfoque se limita a la pantalla de rendir: instrucciones y resultado muestran el menú', async () => {
    const { harness, root } = await setup('carla@ejemplo.test');
    for (const url of ['/cursos/c1/examen', '/cursos/c1/examen/resultado', '/cursos/c1']) {
      await harness.navigateByUrl(url);
      await until(harness, () => !!root.querySelector('.top__nav'));
      expect(root.querySelector('.top__focus')).toBeNull();
      expect(text(root.querySelector('.top__nav a[aria-current="page"]'))).toBe('Mis cursos');
    }
  }, 20_000);
});
