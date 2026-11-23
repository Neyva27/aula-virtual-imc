import { firstValueFrom } from 'rxjs';
import {
  DemoState,
  DemoStateV3,
  StoredDemoState,
  isDemoState,
  migrateV2,
  migrateV3toV4,
  normalizeDemoState,
  verifyMigrationV4,
} from './demo-state';
import { SEED_COMPANIES, SEED_USER_COMPANIES, SEED_V2, withSeedRecoveryCollections } from './seed';
import { MockDataRepository, STORAGE_KEY, V3_STORAGE_KEY } from '../services/mock-data-repository';
import { examKind } from '../models/exam.model';

/**
 * Etapa 2B, Bloque 2 (R1): colecciones nuevas (empresas, recuperaciones, inicios) en v4, sin cambiar la clave
 * `imc-demo-state-v4` ni los datos históricos. Estado aislado en el localStorage de la prueba. Datos ficticios.
 */
const stored = (): DemoState => JSON.parse(localStorage.getItem(STORAGE_KEY)!);

/** v4 guardado antes del Bloque 2: la semilla sin las colecciones nuevas ni las empresas de los usuarios. */
function preBlock2(): StoredDemoState {
  new MockDataRepository().resetDemo();
  const { companies: _c, recoveries: _r, examStarts: _e, ...old } = stored();
  return { ...old, users: old.users.map(({ companyId: _id, ...u }) => u) };
}

describe('Etapa 2B, Bloque 2 (R1): estado v4 con empresas, recuperaciones e inicios', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  describe('compatibilidad con v4 guardado antes del Bloque 2', () => {
    it('se reconoce como v4 válido y se normaliza con listas vacías, sin modificar el original', () => {
      const old = preBlock2();
      const before = JSON.stringify(old);
      expect(isDemoState(old)).toBe(true);
      const state = normalizeDemoState(old);
      expect(state).toMatchObject({ companies: [], recoveries: [], examStarts: [] });
      expect(JSON.stringify(old)).toBe(before); // no muta el objeto recibido
      for (const key of ['users', 'courses', 'modules', 'videos', 'exams', 'questions', 'enrollments', 'attempts', 'certificates'] as const) {
        expect(state[key]).toEqual(old[key]);
      }
    });

    it('conserva las colecciones del Bloque 2 que ya existen', () => {
      const old = preBlock2();
      const withData = { ...old, companies: [{ id: 'x', name: 'Otra' }], recoveries: [], examStarts: [] };
      expect(normalizeDemoState(withData).companies).toEqual([{ id: 'x', name: 'Otra' }]);
    });

    it('una colección nueva que no es una lista es un dato dañado', () => {
      const old = preBlock2();
      expect(isDemoState({ ...old, recoveries: {} })).toBe(false);
      expect(isDemoState({ ...old, companies: 'x' })).toBe(false);
      expect(isDemoState({ ...old, examStarts: null })).toBe(false);
    });

    it('el repositorio lo carga sin reescribirlo; intentos y certificados no cambian', async () => {
      const old = preBlock2();
      const raw = JSON.stringify(old);
      localStorage.setItem(STORAGE_KEY, raw);
      const repo = new MockDataRepository();
      expect(repo.getStorageStatus()).toMatchObject({ source: 'v4', warning: '' });
      expect(localStorage.getItem(STORAGE_KEY)).toBe(raw); // leer no escribe
      expect(await firstValueFrom(repo.listAttempts())).toEqual(old.attempts);
      expect((await firstValueFrom(repo.listCertificates())).map(({ companies: _c, ...c }) => c)).toEqual(old.certificates); // 20/11/2026: se agrega la empresa (no se guarda)
      expect((await firstValueFrom(repo.getUsers())).map((u) => u.companyId)).toEqual(old.users.map(() => undefined));
    });

    it('al guardar por cualquier operación agrega las colecciones vacías; lo histórico queda igual', async () => {
      const old = preBlock2();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(old));
      const repo = new MockDataRepository();
      await firstValueFrom(repo.markCourseVideoCompleted('u4', 'c-ia', 'c-ia-v1'));
      const after = stored();
      expect(after).toMatchObject({ version: 4, companies: [], recoveries: [], examStarts: [] });
      expect(after.attempts).toEqual(old.attempts);
      expect(after.certificates).toEqual(old.certificates);
      expect(after.users).toEqual(old.users); // los datos guardados no reciben empresas automáticamente
      expect(after.exams).toEqual(old.exams);
    });
  });

  describe('migraciones anteriores', () => {
    it('v3 → v4 agrega las colecciones vacías y la verificación de la migración no cambia', () => {
      const v3: DemoStateV3 = migrateV2(SEED_V2);
      const v4 = migrateV3toV4(v3);
      expect(v4).toMatchObject({ companies: [], recoveries: [], examStarts: [] });
      expect(verifyMigrationV4(v3, v4)).toEqual([]);
      expect(isDemoState(v4)).toBe(true);
    });

    it('datos v3 guardados se migran con las colecciones nuevas y conservan intentos y certificados', async () => {
      const v3 = migrateV2(SEED_V2);
      localStorage.setItem(V3_STORAGE_KEY, JSON.stringify(v3));
      const repo = new MockDataRepository();
      expect(repo.getStorageStatus().source).toBe('migrated-v3');
      expect(await firstValueFrom(repo.listAttempts())).toEqual(v3.attempts);
      expect((await firstValueFrom(repo.listCertificates())).map(({ companies: _c, ...c }) => c)).toEqual(v3.certificates);
      expect(stored()).toMatchObject({ companies: [], recoveries: [], examStarts: [] });
      expect(localStorage.getItem(V3_STORAGE_KEY)).toBe(JSON.stringify(v3)); // v3 no se modifica
    });
  });

  describe('semilla de demostración', () => {
    it('tiene empresas ficticias, ninguna recuperación ni inicio, y la empresa de cada estudiante de prueba', () => {
      new MockDataRepository().resetDemo();
      const s = stored();
      expect(s.companies).toEqual(SEED_COMPANIES);
      expect(s.companies.every((c) => c.name.startsWith('Empresa de Demostración'))).toBe(true);
      expect(s.recoveries).toEqual([]);
      expect(s.examStarts).toEqual([]);
      for (const u of s.users) {
        if (u.role === 'participant') expect(u.companyId).toBe(SEED_USER_COMPANIES[u.id]);
        else expect(u.companyId).toBeUndefined(); // el Instructor no pertenece a una empresa
        if (u.companyId) expect(s.companies.some((c) => c.id === u.companyId)).toBe(true);
      }
    });

    it('fuera de empresas y recuperaciones, la semilla es la misma que antes del Bloque 2', () => {
      new MockDataRepository().resetDemo();
      const s = stored();
      const before = preBlock2();
      expect(s.attempts).toEqual(before.attempts);
      expect(s.certificates).toEqual(before.certificates);
      expect(s.exams).toEqual(before.exams);
      expect(s.questions).toEqual(before.questions);
      expect(s.enrollments).toEqual(before.enrollments);
      expect(s.users.map(({ companyId: _c, ...u }) => u)).toEqual(before.users);
      expect(s.attempts.map((a) => [a.id, a.score])).toEqual([['att1', 80], ['att2', 50], ['att3', 90]]);
    });

    it('asignar empresas no modifica el estado recibido ni reemplaza una empresa existente', () => {
      const base = normalizeDemoState(preBlock2());
      const custom = { ...base, users: base.users.map((u) => (u.id === 'u1' ? { ...u, companyId: 'propia' } : u)) };
      const before = JSON.stringify(custom);
      const result = withSeedRecoveryCollections(custom);
      expect(JSON.stringify(custom)).toBe(before);
      expect(result.users.find((u) => u.id === 'u1')!.companyId).toBe('propia');
      expect(result.users.find((u) => u.id === 'u2')!.companyId).toBe('emp-a');
    });
  });

  describe('exámenes', () => {
    it('los exámenes guardados (sin tipo) son regulares y no tienen examen padre', async () => {
      const repo = new MockDataRepository();
      for (const id of ['c1', 'c-ia', 'c-mkt']) {
        const exam = (await firstValueFrom(repo.getActiveExam(id)))!;
        expect(examKind(exam)).toBe('regular');
        expect(exam.kind).toBeUndefined();
        expect(exam.parentExamId).toBeUndefined();
      }
      expect(examKind({ kind: 'recuperacion' })).toBe('recuperacion');
    });

    it('la disponibilidad y la entrega del examen no cambian', async () => {
      const repo = new MockDataRepository();
      expect(await firstValueFrom(repo.getExamAvailability('u5', 'c1'))).toMatchObject({ available: true, maxAttempts: 1, remainingAttempts: 1 });
      expect(await firstValueFrom(repo.getExamAvailability('u3', 'c1'))).toMatchObject({
        available: false,
        reason: 'Alcanzaste el límite de intentos permitidos.',
      });
    });
  });
});
