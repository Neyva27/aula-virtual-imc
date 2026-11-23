import { Observable, firstValueFrom } from 'rxjs';
import { MockDataRepository, STORAGE_KEY } from './mock-data-repository';

/** Sesiones en vivo en la demostración (20/11/2026): mismas reglas que el backend. Datos ficticios. */
const run = <T>(obs: Observable<T>): Promise<T> => firstValueFrom(obs);
const fails = async (obs: Observable<unknown>): Promise<string> => {
  try {
    await run(obs);
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error('Se esperaba un error');
};
const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();
const MEET = 'https://meet.google.com/abc-defg-hij';

describe('MockDataRepository — sesiones en vivo', () => {
  let repo: MockDataRepository;
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    repo = new MockDataRepository();
  });

  const input = (over: object = {}) => ({ moduleId: 'c1-m1', title: 'Sesión de repaso', startsAt: inDays(2), meetUrl: MEET, ...over });

  it('programa, lista por fecha y guarda la sesión en el estado de la demostración', async () => {
    await run(repo.createCourseLiveSession('c1', input({ title: 'Segunda', startsAt: inDays(3) })));
    const list = await run(repo.createCourseLiveSession('c1', input({ title: 'Primera', startsAt: inDays(1), meetUrl: ' HTTPS://meet.google.com/XYZ-ABCD-EFG ' })));
    expect(list.map((s) => [s.title, s.status, s.moduleTitle, s.moduleOrder])).toEqual([
      ['Primera', 'programada', 'Contenido del curso', 1],
      ['Segunda', 'programada', 'Contenido del curso', 1],
    ]);
    expect(list[0].meetUrl).toBe('https://meet.google.com/xyz-abcd-efg');
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).liveSessions).toHaveLength(2);
    expect(await run(repo.getCourseLiveSessions('c-ia'))).toEqual([]);
  });

  it('valida el enlace de Meet, la fecha futura, el título y el módulo del curso', async () => {
    expect(await fails(repo.createCourseLiveSession('c1', input({ meetUrl: 'https://zoom.us/j/1' })))).toContain('Google Meet');
    expect(await fails(repo.createCourseLiveSession('c1', input({ startsAt: inDays(-1) })))).toContain('ya pasaron');
    expect(await fails(repo.createCourseLiveSession('c1', input({ startsAt: 'mañana' })))).toBe('Ingresa una fecha y hora de inicio válidas.');
    expect(await fails(repo.createCourseLiveSession('c1', input({ title: ' ' })))).toBe('Ingresa el título de la sesión en vivo.');
    expect(await fails(repo.createCourseLiveSession('c1', input({ moduleId: 'c-ia-m1' })))).toBe('No se encontró el módulo.');
  });

  it('edita, cancela sin borrar y vuelve a programar', async () => {
    const [s] = await run(repo.createCourseLiveSession('c1', input({ description: 'Con preguntas' })));
    let list = await run(repo.updateCourseLiveSession('c1', s.id, input({ title: 'Editada', description: '' })));
    expect(list[0]).toMatchObject({ title: 'Editada' });
    expect(list[0].description).toBeUndefined();
    list = await run(repo.setCourseLiveSessionStatus('c1', s.id, 'cancelada'));
    expect(list[0].status).toBe('cancelada');
    list = await run(repo.setCourseLiveSessionStatus('c1', s.id, 'programada'));
    expect(list[0].status).toBe('programada');
    expect(await fails(repo.setCourseLiveSessionStatus('c-ia', s.id, 'cancelada'))).toBe('No se encontró la sesión en vivo.');
  });

  it('el alumno ve las sesiones de un curso asignado (también canceladas), no las de cursos ajenos', async () => {
    const [s] = await run(repo.createCourseLiveSession('c1', input()));
    await run(repo.setCourseLiveSessionStatus('c1', s.id, 'cancelada'));
    expect((await run(repo.getParticipantLiveSessions('u2', 'c1'))).map((x) => x.status)).toEqual(['cancelada']);
    await run(repo.createCourseLiveSession('c-ia', input({ moduleId: 'c-ia-m1' })));
    expect(await fails(repo.getParticipantLiveSessions('u2', 'c-ia'))).toBe('No tienes acceso a este curso.');
  });

  it('módulo opcional; al eliminar un módulo sus clases quedan sin módulo (nunca se borran)', async () => {
    const general = await run(repo.createCourseLiveSession('c1', input({ moduleId: null, title: 'General' })));
    expect(general[0]).toMatchObject({ moduleId: null, moduleTitle: '', moduleOrder: 0 });
    const c = await run(repo.saveCourseModule('c1', { title: 'En vivo' }));
    const m2 = c.modules[1].id;
    await run(repo.createCourseLiveSession('c1', input({ moduleId: m2, title: 'Del módulo', startsAt: inDays(4) })));
    await run(repo.deleteCourseModule('c1', m2));
    expect((await run(repo.getCourseLiveSessions('c1'))).map((s) => s.moduleId)).toEqual([null, null]);
  });

  it('grabación: solo para clases realizadas, enlace https; se puede quitar', async () => {
    const [s] = await run(repo.createCourseLiveSession('c1', input()));
    const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
    expect(await fails(repo.setCourseLiveSessionRecording('c1', s.id, url))).toBe('La grabación se agrega cuando la clase ya se realizó.');
    const state = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    state.liveSessions[0].startsAt = new Date(Date.now() - 3_600_000).toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    const fresh = new MockDataRepository();
    expect(await fails(fresh.setCourseLiveSessionRecording('c1', s.id, 'http://inseguro.test/v'))).toContain('debe ser https');
    expect((await run(fresh.setCourseLiveSessionRecording('c1', s.id, url)))[0].recordingUrl).toBe(url);
    expect((await run(fresh.setCourseLiveSessionRecording('c1', s.id, null)))[0].recordingUrl).toBeUndefined();
  });
});
