import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { firstValueFrom } from 'rxjs';
import { routes } from '../../app.routes';
import { AuthService } from '../../core/services/auth.service';
import { DataRepository } from '../../core/services/data-repository';
import { MockDataRepository } from '../../core/services/mock-data-repository';
import { DEMO_CONFIG } from '../../core/config/demo.config';

/** V3: navegación del panel de administración con las rutas reales. Datos ficticios. */
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

async function setup(url: string) {
  localStorage.clear();
  sessionStorage.clear();
  TestBed.configureTestingModule({
    providers: [provideRouter(routes, withComponentInputBinding()), { provide: DataRepository, useClass: MockDataRepository }],
  });
  await firstValueFrom(TestBed.inject(AuthService).login('admin@ejemplo.test', DEMO_CONFIG.demoPassword));
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url);
  const root = harness.fixture.nativeElement as HTMLElement;
  await until(harness, () => !!root.querySelector('.side__nav a'));
  return { harness, root };
}

describe('Navegación de administración (V3)', () => {
  it('menú con iconos decorativos, enlace activo y sección actual en la barra', async () => {
    const { harness, root } = await setup('/admin/participantes');
    const links = [...root.querySelectorAll<HTMLAnchorElement>('.side__nav a')];
    expect(links.map(text)).toEqual([
      'Dashboard', 'Participantes', 'Cursos', 'Videos', 'Evaluaciones', 'Evaluaciones rendidas', 'Certificados', // R7: sección renombrada
    ]);
    expect(links.every((a) => a.querySelector('svg')?.getAttribute('aria-hidden') === 'true')).toBe(true);
    expect(text(root.querySelector('.side__nav a.is-active'))).toBe('Participantes');
    expect(text(root.querySelector('.bar__title'))).toBe('Panel del instructor / Participantes');
    expect(text(root.querySelector('.bar__avatar'))).toBe('ID'); // «Instructor de Prueba»: dos primeras palabras
    expect(root.querySelector('a.skip')!.getAttribute('href')).toBe('#contenido');
    expect(root.querySelector('main#contenido')).not.toBeNull();

    await harness.navigateByUrl('/admin/evaluaciones?curso=c-ia');
    await until(harness, () => text(root.querySelector('.bar__section')) === 'Evaluaciones');
    await harness.navigateByUrl('/admin');
    await until(harness, () => text(root.querySelector('.bar__section')) === 'Dashboard');
  }, 20_000);

  it('el menú móvil se abre con «Menú» y se cierra con su botón o con Escape', async () => {
    const { harness, root } = await setup('/admin');
    const side = root.querySelector('.side')!;
    const toggle = [...root.querySelectorAll<HTMLButtonElement>('.bar button')].find((b) => text(b) === 'Menú')!;
    expect(toggle.querySelector('svg')).not.toBeNull(); // icono SVG en lugar del carácter ☰
    expect(text(toggle)).not.toContain('☰');

    toggle.click();
    await harness.fixture.whenStable();
    expect(side.classList).toContain('is-open');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    root.querySelector<HTMLButtonElement>('.side__close')!.click();
    await harness.fixture.whenStable();
    expect(side.classList).not.toContain('is-open');
    expect(root.querySelector('.side__close')!.getAttribute('aria-label')).toBe('Cerrar menú');

    toggle.click();
    await harness.fixture.whenStable();
    expect(side.classList).toContain('is-open');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await harness.fixture.whenStable();
    expect(side.classList).not.toContain('is-open');
  }, 20_000);
});
