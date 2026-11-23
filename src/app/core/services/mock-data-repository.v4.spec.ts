import { firstValueFrom } from 'rxjs';
import { DemoState, DemoStateV3, migrateV2 } from '../data/demo-state';
import { SEED_V2 } from '../data/seed';
import {
  BACKUP_STORAGE_KEY,
  LEGACY_STORAGE_KEY,
  MockDataRepository,
  STORAGE_KEY,
  V3_INVALID_BACKUP_KEY,
  V3_MIGRATION_BACKUP_KEY,
  V3_STORAGE_KEY,
} from './mock-data-repository';

/**
 * B1.2: carga del estado v4 y migración desde v3 en el repositorio. Regla: v3 y v2 solo se leen; nunca se
 * modifican ni se borran, y las copias de respaldo nunca sobrescriben otra copia. Datos ficticios.
 */
function v3Raw(mutate?: (s: DemoStateV3) => void): string {
  const s = migrateV2(structuredClone(SEED_V2));
  mutate?.(s);
  return JSON.stringify(s);
}
const stored = (): DemoState => JSON.parse(localStorage.getItem(STORAGE_KEY)!);
const keys = () => Object.keys(localStorage).sort();

describe('Repositorio: estado v4 y migración desde v3 (B1.2)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('sin datos guardados usa la semilla v4 y no escribe nada', async () => {
    const repo = new MockDataRepository();
    expect(repo.getStorageStatus()).toMatchObject({ source: 'seed', warning: '' });
    expect(keys()).toEqual([]);
    const a1 = (await firstValueFrom(repo.getUsers())).find((u) => u.id === 'a1')!;
    expect(a1).toMatchObject({ role: 'instructor', fullName: 'Instructor de Prueba', email: 'admin@ejemplo.test' });
  });

  it('migra v3 a v4: guarda v4, copia v3 tal cual y deja v3 intacto byte a byte', async () => {
    const raw = v3Raw();
    localStorage.setItem(V3_STORAGE_KEY, raw);

    const repo = new MockDataRepository();
    expect(repo.getStorageStatus()).toMatchObject({ source: 'migrated-v3', migrationProblems: [] });
    expect(repo.getStorageStatus().warning).toContain('rol Instructor');
    expect(localStorage.getItem(V3_STORAGE_KEY)).toBe(raw);
    expect(localStorage.getItem(V3_MIGRATION_BACKUP_KEY)).toBe(raw);
    expect(stored().version).toBe(4);
    expect(stored().users.find((u) => u.id === 'a1')!.role).toBe('instructor');
    expect((await firstValueFrom(repo.getUsers())).every((u) => u.role === 'participant' || u.role === 'instructor')).toBe(true);
  });

  it('una vez migrado, carga v4 sin volver a migrar; los cambios solo se guardan en v4', async () => {
    const raw = v3Raw();
    localStorage.setItem(V3_STORAGE_KEY, raw);
    const first = new MockDataRepository();
    await firstValueFrom(first.markVideoCompleted('u4', 'v1'));

    const second = new MockDataRepository();
    expect(second.getStorageStatus().source).toBe('v4');
    expect((await firstValueFrom(second.getEnrollment('u4')))!.completedVideoIds).toEqual(['v1']);
    expect(localStorage.getItem(V3_STORAGE_KEY)).toBe(raw);
    expect(localStorage.getItem(V3_MIGRATION_BACKUP_KEY)).toBe(raw);
  });

  it('es repetible: si se repite la migración da el mismo v4 y no sobrescribe la copia previa', () => {
    const raw = v3Raw();
    localStorage.setItem(V3_STORAGE_KEY, raw);
    new MockDataRepository();
    const firstV4 = localStorage.getItem(STORAGE_KEY);

    localStorage.setItem(V3_MIGRATION_BACKUP_KEY, 'copia anterior que no debe sobrescribirse');
    localStorage.removeItem(STORAGE_KEY); // simula volver a partir de v3
    new MockDataRepository();
    expect(localStorage.getItem(STORAGE_KEY)).toBe(firstV4);
    expect(localStorage.getItem(V3_MIGRATION_BACKUP_KEY)).toBe('copia anterior que no debe sobrescribirse');
    expect(localStorage.getItem(V3_STORAGE_KEY)).toBe(raw);
  });

  it('conserva nombres personalizados (a1 incluido) y marca para revisión la separación automática', async () => {
    localStorage.setItem(
      V3_STORAGE_KEY,
      v3Raw((s) => {
        s.users.find((u) => u.id === 'a1')!.fullName = 'Lucía Paredes Ríos';
      }),
    );
    const a1 = (await firstValueFrom(new MockDataRepository().getUsers())).find((u) => u.id === 'a1')!;
    expect(a1).toMatchObject({ fullName: 'Lucía Paredes Ríos', role: 'instructor', nameReview: true });
  });

  it('si la verificación falla: carga los datos de prueba, avisa, no escribe v4 y deja v3 intacto', () => {
    const raw = v3Raw((s) => {
      (s.users[0] as { role: string }).role = 'superadmin';
    });
    localStorage.setItem(V3_STORAGE_KEY, raw);
    const repo = new MockDataRepository();
    const status = repo.getStorageStatus();
    expect(status.source).toBe('seed');
    expect(status.warning).toContain('No se pudieron migrar los datos guardados (v3)');
    expect(status.migrationProblems.join()).toMatch(/superadmin/);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(V3_STORAGE_KEY)).toBe(raw);
  });

  it('v3 con formato inválido: copia de respaldo, datos de prueba y v3 sin cambios', () => {
    localStorage.setItem(V3_STORAGE_KEY, '{"version":3}');
    const repo = new MockDataRepository();
    expect(repo.getStorageStatus().source).toBe('seed');
    expect(repo.getStorageStatus().warning).toContain(V3_INVALID_BACKUP_KEY);
    expect(localStorage.getItem(V3_INVALID_BACKUP_KEY)).toBe('{"version":3}');
    expect(localStorage.getItem(V3_STORAGE_KEY)).toBe('{"version":3}');
  });

  it('una copia de respaldo existente con otro contenido no se sobrescribe: se usa otra clave', () => {
    localStorage.setItem(V3_INVALID_BACKUP_KEY, 'copia de E2');
    localStorage.setItem(V3_STORAGE_KEY, '{dañado');
    const repo = new MockDataRepository();
    expect(localStorage.getItem(V3_INVALID_BACKUP_KEY)).toBe('copia de E2');
    const extra = keys().filter((k) => k.startsWith(`${V3_INVALID_BACKUP_KEY}-`));
    expect(extra).toHaveLength(1);
    expect(localStorage.getItem(extra[0])).toBe('{dañado');
    expect(repo.getStorageStatus().warning).toContain(extra[0]);
  });

  it('v4 dañado con v3 válido: guarda copia de v4 y migra desde v3', () => {
    const raw = v3Raw();
    localStorage.setItem(STORAGE_KEY, '{v4 dañado');
    localStorage.setItem(V3_STORAGE_KEY, raw);
    const repo = new MockDataRepository();
    expect(repo.getStorageStatus().source).toBe('migrated-v3');
    expect(repo.getStorageStatus().warning).toContain(BACKUP_STORAGE_KEY);
    expect(localStorage.getItem(BACKUP_STORAGE_KEY)).toBe('{v4 dañado');
    expect(stored().version).toBe(4);
    expect(localStorage.getItem(V3_STORAGE_KEY)).toBe(raw);
  });

  it('con v3 y v2 guardados migra desde v3 y no toca v2', () => {
    const raw = v3Raw();
    const v2 = JSON.stringify(SEED_V2);
    localStorage.setItem(V3_STORAGE_KEY, raw);
    localStorage.setItem(LEGACY_STORAGE_KEY, v2);
    const repo = new MockDataRepository();
    expect(repo.getStorageStatus()).toMatchObject({ source: 'migrated-v3', legacyStatePresent: true });
    expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toBe(v2);
    expect(localStorage.getItem(V3_STORAGE_KEY)).toBe(raw);
  });

  it('restablecer la demostración guarda la semilla en v4 y no toca v3 ni v2', () => {
    const raw = v3Raw();
    const v2 = JSON.stringify(SEED_V2);
    localStorage.setItem(V3_STORAGE_KEY, raw);
    localStorage.setItem(LEGACY_STORAGE_KEY, v2);
    const repo = new MockDataRepository();
    repo.resetDemo();
    expect(stored().version).toBe(4);
    expect(localStorage.getItem(V3_STORAGE_KEY)).toBe(raw);
    expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toBe(v2);
    expect(new MockDataRepository().getStorageStatus().source).toBe('v4');
  });

  it('removeLegacyState solo borra v2 (con v4 válido) y nunca v3', () => {
    const raw = v3Raw();
    localStorage.setItem(V3_STORAGE_KEY, raw);
    localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(SEED_V2));
    const repo = new MockDataRepository();
    expect(repo.removeLegacyState()).toBe(true);
    expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(V3_STORAGE_KEY)).toBe(raw);
  });

  it('un participante nuevo recibe nombres y apellidos (separación automática, para revisar)', async () => {
    const repo = new MockDataRepository();
    const user = await firstValueFrom(repo.addParticipant({ fullName: 'Nuevo Alumno Prueba', email: 'nuevo-b12@ejemplo.test', dni: '00000088' }));
    expect(user).toMatchObject({ role: 'participant', firstNames: 'Nuevo', lastNames: 'Alumno Prueba', nameReview: true });
    expect(stored().users.find((u) => u.id === user.id)!.lastNames).toBe('Alumno Prueba');
  });
});
