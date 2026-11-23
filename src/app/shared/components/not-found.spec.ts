import { TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { firstValueFrom } from 'rxjs';
import { NotFound } from './not-found';
import { roleGuard, guestGuard } from '../../core/guards/role.guard';
import { AuthService } from '../../core/services/auth.service';
import { DataRepository } from '../../core/services/data-repository';
import { MockDataRepository } from '../../core/services/mock-data-repository';
import { DEMO_CONFIG } from '../../core/config/demo.config';

/** F3.5: «Ir al inicio» de la página 404 según la sesión y el rol, con los guards reales. Datos ficticios. */
@Component({ template: 'Inicio de sesión' })
class LoginStub {}
@Component({ template: 'Mis cursos' })
class PanelStub {}
@Component({ template: 'Panel del instructor' })
class AdminStub {}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function setup(email?: string) {
  localStorage.clear();
  sessionStorage.clear();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([
        { path: 'login', component: LoginStub, canActivate: [guestGuard] },
        { path: 'panel', component: PanelStub, canActivate: [roleGuard('participant')] },
        { path: 'instructor', component: AdminStub, canActivate: [roleGuard('instructor')] },
        { path: '**', component: NotFound },
      ]),
      { provide: DataRepository, useClass: MockDataRepository },
    ],
  });
  if (email) await firstValueFrom(TestBed.inject(AuthService).login(email, DEMO_CONFIG.demoPassword));
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl('/ruta-que-no-existe', NotFound);
  const link = (harness.routeNativeElement as HTMLElement).querySelector<HTMLAnchorElement>('a.btn')!;
  return { harness, link, router: TestBed.inject(Router) };
}

async function follow(harness: RouterTestingHarness, link: HTMLAnchorElement): Promise<void> {
  link.click();
  for (let i = 0; i < 40 && TestBed.inject(Router).url === '/ruta-que-no-existe'; i++) {
    await harness.fixture.whenStable();
    await sleep(25);
  }
}

describe('Página 404 (F3.5)', () => {
  it('sin sesión, «Ir al inicio» lleva al inicio de sesión', async () => {
    const { harness, link, router } = await setup();
    expect(link.getAttribute('href')).toBe('/login');
    await follow(harness, link);
    expect(router.url).toBe('/login');
  });

  it('un alumno vuelve a su panel', async () => {
    const { harness, link, router } = await setup('ana@ejemplo.test');
    expect(link.getAttribute('href')).toBe('/panel');
    await follow(harness, link);
    expect(router.url).toBe('/panel');
  });

  it('un instructor vuelve al panel del instructor', async () => {
    const { harness, link, router } = await setup('admin@ejemplo.test');
    expect(link.getAttribute('href')).toBe('/instructor');
    await follow(harness, link);
    expect(router.url).toBe('/instructor');
  });

  it('el enlace no abre rutas administrativas a un alumno y los guards siguen aplicando', async () => {
    const { harness, link, router } = await setup('pedro@ejemplo.test');
    expect(link.getAttribute('href')).not.toContain('/admin');
    expect(link.getAttribute('href')).not.toContain('/instructor');
    await harness.navigateByUrl('/instructor');
    expect(router.url).toBe('/panel');
  });
});
