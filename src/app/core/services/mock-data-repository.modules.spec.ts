import { Observable, firstValueFrom } from 'rxjs';
import { MockDataRepository, STORAGE_KEY } from './mock-data-repository';
import { DemoState } from '../data/demo-state';
import { CourseContent } from '../models/course.model';

/** M2: módulos del curso (crear, editar, ordenar, eliminar) y asignación de videos. Datos ficticios. */
const run = <T>(obs: Observable<T>): Promise<T> => firstValueFrom(obs);
const fails = async (obs: Observable<unknown>): Promise<string> => {
  try {
    await run(obs);
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error('Se esperaba un error');
};
const stored = (): DemoState => JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
const layout = (c: CourseContent) => c.modules.map((m) => ({ id: m.id, order: m.order, videos: m.videos.map((v) => `${v.id}#${v.order}`) }));

describe('MockDataRepository — módulos del curso (M2)', () => {
  let repo: MockDataRepository;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    repo = new MockDataRepository();
  });

  /** c1 con tres módulos: m1 (v1, v2), m2 (v3, v4), m3 (v5, v6). */
  async function c1InThreeModules(): Promise<{ m1: string; m2: string; m3: string }> {
    let c = await run(repo.saveCourseModule('c1', { title: 'Fundamentos' }));
    c = await run(repo.saveCourseModule('c1', { title: 'Aplicaciones', description: 'Casos prácticos' }));
    const [m1, m2, m3] = c.modules.map((m) => m.id);
    for (const v of ['v3', 'v4']) await run(repo.assignCourseVideoToModule('c1', v, m2));
    for (const v of ['v5', 'v6']) await run(repo.assignCourseVideoToModule('c1', v, m3));
    return { m1, m2, m3 };
  }

  it('crea módulos al final, con descripción opcional, sin tocar otros cursos', async () => {
    const before = await run(repo.getCourseContent('c-ia'));
    const c = await run(repo.saveCourseModule('c1', { title: '  Fundamentos  ', description: '  Conceptos base ' }));
    expect(c.modules.map((m) => [m.order, m.title, m.description])).toEqual([
      [1, 'Contenido del curso', undefined],
      [2, 'Fundamentos', 'Conceptos base'],
    ]);
    expect(c.modules[1].videos).toEqual([]);
    expect(await run(repo.getCourseContent('c-ia'))).toEqual(before);
    expect(stored().modules.find((m) => m.title === 'Fundamentos')?.courseId).toBe('c1');
  });

  it('edita el nombre y la descripción; vaciar la descripción la quita', async () => {
    let c = await run(repo.saveCourseModule('c1', { id: 'c1-m1', title: 'Introducción', description: 'Primeros pasos' }));
    expect(c.modules[0]).toMatchObject({ id: 'c1-m1', title: 'Introducción', description: 'Primeros pasos' });
    c = await run(repo.saveCourseModule('c1', { id: 'c1-m1', title: 'Introducción', description: '  ' }));
    expect('description' in c.modules[0]).toBe(false);
    expect(c.modules[0].videos.length).toBe(6); // los videos no cambian
  });

  it('valida el nombre, los límites y que el módulo sea del curso', async () => {
    expect(await fails(repo.saveCourseModule('c1', { title: '   ' }))).toBe('Ingresa el nombre del módulo.');
    expect(await fails(repo.saveCourseModule('c1', { title: 'x'.repeat(121) }))).toContain('120 caracteres');
    expect(await fails(repo.saveCourseModule('c1', { title: 'Ok', description: 'x'.repeat(501) }))).toContain('500 caracteres');
    expect(await fails(repo.saveCourseModule('c1', { id: 'c-ia-m1', title: 'Ajeno' }))).toBe('No se encontró el módulo.');
    expect(await fails(repo.saveCourseModule('no-existe', { title: 'Ok' }))).toBe('No se encontró el curso.');
  });

  it('asigna videos existentes a otro módulo, al final y renumerados', async () => {
    const { m1, m2, m3 } = await c1InThreeModules();
    const c = await run(repo.getCourseContent('c1'));
    expect(layout(c)).toEqual([
      { id: m1, order: 1, videos: ['v1#1', 'v2#2'] },
      { id: m2, order: 2, videos: ['v3#1', 'v4#2'] },
      { id: m3, order: 3, videos: ['v5#1', 'v6#2'] },
    ]);
    // La vista heredada (pantallas de un solo curso) sigue el orden módulo → video.
    expect((await run(repo.getCourse())).videos.map((v) => v.id)).toEqual(['v1', 'v2', 'v3', 'v4', 'v5', 'v6']);
  });

  it('no asigna a módulos o videos de otro curso', async () => {
    expect(await fails(repo.assignCourseVideoToModule('c1', 'v1', 'c-ia-m1'))).toBe('No se encontró el módulo.');
    expect(await fails(repo.assignCourseVideoToModule('c1', 'c-ia-v1', 'c1-m1'))).toBe('No se encontró el video.');
  });

  it('ordena módulos; fuera de los límites no cambia nada', async () => {
    const { m1, m2, m3 } = await c1InThreeModules();
    let c = await run(repo.moveCourseModule('c1', m3, -1));
    expect(c.modules.map((m) => [m.id, m.order])).toEqual([[m1, 1], [m3, 2], [m2, 3]]);
    c = await run(repo.moveCourseModule('c1', m1, -1));
    expect(c.modules.map((m) => m.id)).toEqual([m1, m3, m2]);
    expect((await run(repo.getCourse())).videos.map((v) => v.id)).toEqual(['v1', 'v2', 'v5', 'v6', 'v3', 'v4']);
  });

  it('ordena videos dentro del módulo, sin pasar a otro módulo', async () => {
    const { m2 } = await c1InThreeModules();
    let c = await run(repo.moveCourseVideo('c1', 'v4', -1));
    expect(c.modules.find((m) => m.id === m2)!.videos.map((v) => v.id)).toEqual(['v4', 'v3']);
    c = await run(repo.moveCourseVideo('c1', 'v4', -1)); // primero del módulo: no salta al anterior
    expect(c.modules.find((m) => m.id === m2)!.videos.map((v) => v.id)).toEqual(['v4', 'v3']);
  });

  it('eliminar un módulo con videos exige el destino y nunca borra videos ni avance', async () => {
    const { m1, m2, m3 } = await c1InThreeModules();
    const progressBefore = stored().enrollments.map((e) => [e.userId, e.courseId, e.completedVideoIds]);
    const videosBefore = stored().videos.length;
    expect(await fails(repo.deleteCourseModule('c1', m2))).toContain('Elige a qué módulo pasan los videos');
    expect(await fails(repo.deleteCourseModule('c1', m2, m2))).toBe('No se encontró el módulo de destino.');
    expect(await fails(repo.deleteCourseModule('c1', m2, 'c-ia-m1'))).toBe('No se encontró el módulo de destino.');

    const c = await run(repo.deleteCourseModule('c1', m2, m1));
    expect(layout(c)).toEqual([
      { id: m1, order: 1, videos: ['v1#1', 'v2#2', 'v3#3', 'v4#4'] },
      { id: m3, order: 2, videos: ['v5#1', 'v6#2'] },
    ]);
    expect(stored().videos.length).toBe(videosBefore);
    expect(stored().enrollments.map((e) => [e.userId, e.courseId, e.completedVideoIds])).toEqual(progressBefore);
    expect(c.ruleIssues).toEqual([]); // c1 sigue cumpliendo RN-03 (6 videos publicados)
  });

  it('elimina un módulo vacío sin pedir destino; el último módulo no se elimina', async () => {
    const c = await run(repo.saveCourseModule('c-ia', { title: 'Vacío' }));
    const empty = c.modules[1].id;
    expect((await run(repo.deleteCourseModule('c-ia', empty))).modules.map((m) => m.id)).toEqual(['c-ia-m1']);
    expect(await fails(repo.deleteCourseModule('c-ia', 'c-ia-m1'))).toBe('El curso debe tener al menos un módulo.');
  });

  it('RN-03 (19/11/2026): un curso ya publicado repartido en módulos conserva la publicación y el examen', async () => {
    await c1InThreeModules();
    const check = await run(repo.getPublicationCheck('c1'));
    expect(check.canPublish).toBe(true);
    expect(check.blocking).toEqual([]);
    // Informativo: al volver a publicarlo desde borrador se exigirá el mínimo por módulo.
    expect(check.warnings).toEqual([]); // 21/11/2026: cada módulo tiene al menos 1 video publicado
    expect((await run(repo.getCourseContent('c1'))).ruleIssues).toEqual([]);
    const availability = await run(repo.getExamAvailability('u5', 'c1'));
    expect(availability.available).toBe(true); // Rosa sigue pudiendo rendir
    // Un curso en borrador se revisa módulo por módulo: un módulo vacío también bloquea.
    await run(repo.saveCourseModule('c-ia', { title: 'Módulo 2' }));
    expect((await run(repo.getCourseContent('c-ia'))).ruleIssues).toEqual(['Módulo 2 «Módulo 2»: no tiene videos publicados; se requiere al menos 1 video publicado por módulo.']);
  });

  it('sin máximo: un curso admite más de 7 videos repartidos entre módulos', async () => {
    const { m2, m3 } = await c1InThreeModules();
    for (const [i, moduleId] of [m3, m3, m2, m2].entries()) {
      await run(repo.saveCourseVideo('c1', { title: `Extra ${i + 1}`, durationSec: 360, published: false, url: 'https://videos.ejemplo.test/clase.mp4', moduleId }));
    }
    const c = await run(repo.getCourseContent('c1'));
    expect(c.modules.map((m) => m.videos.length)).toEqual([2, 4, 4]);
    expect(c.modules.flatMap((m) => m.videos)).toHaveLength(10);
  });

  it('21/11/2026: para publicar desde borrador, cada módulo necesita al menos 1 video publicado propio', async () => {
    let c = await run(repo.saveCourseModule('c-ia', { title: 'Práctica' }));
    const [m1, m2] = c.modules.map((m) => m.id);
    for (let i = 0; i < 8; i++) await run(repo.saveCourseVideo('c-ia', { title: `T${i}`, durationSec: 360, published: true, url: 'https://videos.ejemplo.test/clase.mp4', moduleId: m1 }));
    for (let i = 0; i < 2; i++) await run(repo.saveCourseVideo('c-ia', { title: `B${i}`, durationSec: 360, published: false, url: 'https://videos.ejemplo.test/clase.mp4', moduleId: m2 }));
    // Los publicados del módulo 1 no completan el módulo 2 (solo borradores).
    expect((await run(repo.getPublicationCheck('c-ia'))).blocking).toContain('Módulo 2 «Práctica»: no tiene videos publicados; se requiere al menos 1 video publicado por módulo.');
    await run(repo.saveCourseVideo('c-ia', { title: 'P1', durationSec: 360, published: true, url: 'https://videos.ejemplo.test/clase.mp4', moduleId: m2 }));
    c = await run(repo.getCourseContent('c-ia'));
    expect(c.ruleIssues).toEqual([]);
  });
});
