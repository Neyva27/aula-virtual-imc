import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { AuthService } from './auth.service';
import { DataRepository } from './data-repository';
import { MockDataRepository } from './mock-data-repository';
import { DEMO_CONFIG } from '../config/demo.config';

const SESSION_KEY = 'imc-demo-session';
/** Sesión guardada por una versión anterior a B1.2 (rol «admin», sin nombres separados). Datos ficticios. */
const LEGACY_SESSION = JSON.stringify({ id: 'a1', fullName: 'Administrador de Prueba', email: 'admin@ejemplo.test', role: 'admin' });

function service(): AuthService {
  TestBed.configureTestingModule({ providers: [{ provide: DataRepository, useClass: MockDataRepository }] });
  return TestBed.inject(AuthService);
}

describe('AuthService: compatibilidad de sesiones (B1.2)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('restaura una sesión antigua con rol «admin» como Instructor, sin reescribir la clave guardada', () => {
    localStorage.setItem(SESSION_KEY, LEGACY_SESSION);
    const auth = service();
    expect(auth.user()).toMatchObject({ id: 'a1', role: 'instructor', firstNames: 'Administrador', lastNames: 'de Prueba' });
    expect(auth.homeFor(auth.user()!.role)).toBe('/instructor');
    expect(localStorage.getItem(SESSION_KEY)).toBe(LEGACY_SESSION);
  });

  it('restaura una sesión de participante sin cambios de rol', () => {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ id: 'u1', fullName: 'Ana Torres Quispe', email: 'ana@ejemplo.test', role: 'participant' }));
    const auth = service();
    expect(auth.user()).toMatchObject({ role: 'participant', firstNames: 'Ana', lastNames: 'Torres Quispe' });
    expect(auth.homeFor('participant')).toBe('/panel');
  });

  it('descarta una sesión con rol desconocido o con forma no reconocida', () => {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ id: 'x', fullName: 'X', email: 'x@ejemplo.test', role: 'superadmin' }));
    expect(service().user()).toBeNull();
    TestBed.resetTestingModule();
    localStorage.setItem(SESSION_KEY, '{no es json');
    expect(service().user()).toBeNull();
  });

  it('un inicio de sesión nuevo guarda la sesión con el rol y los nombres vigentes', async () => {
    localStorage.setItem(SESSION_KEY, LEGACY_SESSION);
    const auth = service();
    await firstValueFrom(auth.login('admin@ejemplo.test', DEMO_CONFIG.demoPassword));
    const saved = JSON.parse(localStorage.getItem(SESSION_KEY)!);
    expect(saved).toMatchObject({ role: 'instructor', fullName: 'Instructor de Prueba', firstNames: 'Instructor', lastNames: 'de Prueba' });
  });
});
