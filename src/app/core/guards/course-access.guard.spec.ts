import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, RouterStateSnapshot, UrlTree, convertToParamMap, provideRouter } from '@angular/router';
import { Observable, firstValueFrom, isObservable, of } from 'rxjs';
import { courseAccessGuard } from './course-access.guard';
import { AuthService } from '../services/auth.service';
import { DataRepository } from '../services/data-repository';
import { MockDataRepository } from '../services/mock-data-repository';
import { DEMO_CONFIG } from '../config/demo.config';

describe('courseAccessGuard', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: DataRepository, useClass: MockDataRepository }],
    });
  });

  async function canOpen(courseId: string): Promise<boolean | UrlTree> {
    const route = { paramMap: convertToParamMap({ courseId }) } as ActivatedRouteSnapshot;
    const result = TestBed.runInInjectionContext(() => courseAccessGuard(route, {} as RouterStateSnapshot));
    return firstValueFrom(isObservable(result) ? (result as Observable<boolean | UrlTree>) : of(result as boolean | UrlTree));
  }

  async function loginAs(email: string): Promise<void> {
    await firstValueFrom(TestBed.inject(AuthService).login(email, DEMO_CONFIG.demoPassword));
  }

  it('permite abrir un curso asignado, incluido un borrador en modo demostración', async () => {
    await loginAs('pedro@ejemplo.test');
    expect(await canOpen('c1')).toBe(true);
    expect(await canOpen('c-ia')).toBe(true);
  });

  it('redirige al tablero con aviso si el curso no está asignado o no existe', async () => {
    await loginAs('carla@ejemplo.test');
    for (const id of ['c-ia', 'no-existe']) {
      const result = await canOpen(id);
      expect(result).toBeInstanceOf(UrlTree);
      expect((result as UrlTree).toString()).toBe('/panel?aviso=sin-acceso');
    }
  });

  it('redirige si no hay sesión', async () => {
    TestBed.inject(AuthService).logout();
    expect((await canOpen('c1')).toString()).toBe('/panel?aviso=sin-acceso');
  });
});
