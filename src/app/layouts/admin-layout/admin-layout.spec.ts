import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AdminLayout } from './admin-layout';
import { AuthService } from '../../core/services/auth.service';
import { DataRepository } from '../../core/services/data-repository';
import {
  BACKUP_STORAGE_KEY,
  LEGACY_STORAGE_KEY,
  MockDataRepository,
  STORAGE_KEY,
} from '../../core/services/mock-data-repository';
import { SEED_V2 } from '../../core/data/seed';
import { DEMO_CONFIG } from '../../core/config/demo.config';

/**
 * F3.6: aviso del estado de los datos guardados en el panel de administración.
 * Cada caso prepara solo el localStorage aislado de la prueba (jsdom). Datos ficticios.
 */
const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

async function setup(prepare: () => void) {
  localStorage.clear();
  sessionStorage.clear();
  prepare();
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: DataRepository, useClass: MockDataRepository }],
  });
  await firstValueFrom(TestBed.inject(AuthService).login('admin@ejemplo.test', DEMO_CONFIG.demoPassword));
  const fixture = TestBed.createComponent(AdminLayout);
  await fixture.whenStable();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

describe('Aviso de datos guardados en administración (F3.6)', () => {
  it('no muestra ningún aviso con datos v3 válidos', async () => {
    const { el } = await setup(() => new MockDataRepository().resetDemo());
    expect(el.querySelector('.storage-note')).toBeNull();
  });

  it('no muestra ningún aviso en la primera visita (sin datos guardados)', async () => {
    const { el } = await setup(() => {});
    expect(el.querySelector('.storage-note')).toBeNull();
  });

  it('informa, sin alarmar, que se migraron datos de la versión anterior', async () => {
    const { el } = await setup(() => localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(SEED_V2)));
    const note = el.querySelector('.storage-note')!;
    expect(note.classList).toContain('alert-info');
    expect(text(note)).toContain('Se migraron los datos guardados por la versión anterior.');
    // Solo informa: los datos anteriores siguen guardados.
    expect(localStorage.getItem(LEGACY_STORAGE_KEY)).not.toBeNull();
  });

  it('advierte cuando los datos guardados no son válidos y se guardó una copia', async () => {
    const { el } = await setup(() => localStorage.setItem(STORAGE_KEY, '{"no":"válido"}'));
    const note = el.querySelector('.storage-note')!;
    expect(note.classList).toContain('alert-warning');
    expect(text(note)).toContain(BACKUP_STORAGE_KEY);
    expect(localStorage.getItem(BACKUP_STORAGE_KEY)).toBe('{"no":"válido"}');
  });

  it('se puede ocultar sin modificar los datos guardados', async () => {
    const { fixture, el } = await setup(() => localStorage.setItem(LEGACY_STORAGE_KEY, '{"formato":"desconocido"}'));
    expect(text(el.querySelector('.storage-note'))).toContain('formato no reconocido');
    const before = { ...localStorage };
    [...el.querySelectorAll<HTMLButtonElement>('.storage-note button')].find((b) => text(b) === 'Ocultar aviso')!.click();
    await fixture.whenStable();
    expect(el.querySelector('.storage-note')).toBeNull();
    expect({ ...localStorage }).toEqual(before);
  });
});
