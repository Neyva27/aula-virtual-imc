import { Observable, firstValueFrom } from 'rxjs';
import { MockDataRepository, STORAGE_KEY } from './mock-data-repository';
import { DemoState } from '../data/demo-state';
import { CourseVideoInput } from '../models/course.model';

/** M4: fuente Google Drive en el repositorio simulado. Identificadores ficticios. */
const ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz012345';
const run = <T>(obs: Observable<T>): Promise<T> => firstValueFrom(obs);
const fails = async (obs: Observable<unknown>): Promise<string> => {
  try {
    await run(obs);
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error('Se esperaba un error');
};
const video = (over: Partial<CourseVideoInput> = {}): CourseVideoInput => ({
  title: 'Video de prueba',
  durationSec: 360,
  published: false,
  url: '',
  ...over,
});
const last = async (repo: MockDataRepository, courseId = 'c-ia') =>
  (await run(repo.getCourseContent(courseId))).modules.flatMap((m) => m.videos).at(-1)!;

describe('MockDataRepository — videos de Google Drive (M4)', () => {
  let repo: MockDataRepository;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    repo = new MockDataRepository();
  });

  it('registra la fuente Drive y su identificador a partir del enlace compartido', async () => {
    await run(repo.saveCourseVideo('c-ia', video({ url: `https://drive.google.com/file/d/${ID}/view?usp=sharing`, sourceKind: 'drive' })));
    expect((await last(repo)).source).toEqual({ kind: 'drive', fileId: ID });
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!) as DemoState;
    expect(saved.videos.find((v) => v.source.kind === 'drive')).toBeTruthy(); // no se guarda ningún archivo, solo el enlace
  });

  it('sin indicar la fuente, también reconoce Drive (compatibilidad con llamadas anteriores)', async () => {
    await run(repo.saveCourseVideo('c-ia', video({ url: `https://drive.google.com/open?id=${ID}` })));
    expect((await last(repo)).source).toEqual({ kind: 'drive', fileId: ID });
  });

  it('rechaza enlaces de Drive que no son de un archivo (carpetas, documentos)', async () => {
    for (const url of [`https://drive.google.com/drive/folders/${ID}`, `https://docs.google.com/document/d/${ID}/edit`]) {
      expect(await fails(repo.saveCourseVideo('c-ia', video({ url })))).toContain('no corresponde a un archivo');
    }
    expect((await run(repo.getCourseContent('c-ia'))).modules[0].videos.length).toBe(1);
  });

  it('el enlace debe corresponder a la fuente elegida', async () => {
    expect(await fails(repo.saveCourseVideo('c-ia', video({ url: 'https://youtu.be/Ctd6BTuZmjA', sourceKind: 'drive' })))).toContain(
      'no es un archivo de Google Drive válido',
    );
    expect(
      await fails(repo.saveCourseVideo('c-ia', video({ url: `https://drive.google.com/file/d/${ID}/view`, sourceKind: 'youtube' }))),
    ).toContain('no es un video de YouTube válido');
    expect(await fails(repo.saveCourseVideo('c-ia', video({ url: 'https://youtu.be/Ctd6BTuZmjA', sourceKind: 'url' })))).toContain(
      'elige esa fuente',
    );
  });

  it('21/11/2026: sin «Sin archivo»: un video nuevo sin enlace se rechaza', async () => {
    expect(await fails(repo.saveCourseVideo('c-ia', video({ url: '' })))).toBe('Ingresa el enlace del video: YouTube, Google Drive u otro enlace https.');
    expect(await fails(repo.saveCourseVideo('c-ia', video({ url: '   ' })))).toContain('Ingresa el enlace del video');
  });

  it('YouTube sigue igual y los videos existentes conservan su fuente al editarlos', async () => {
    await run(repo.saveCourseVideo('c-ia', video({ url: 'https://www.youtube.com/watch?v=Ctd6BTuZmjA', sourceKind: 'youtube' })));
    expect((await last(repo)).source).toEqual({ kind: 'youtube', videoId: 'Ctd6BTuZmjA' });
    await run(
      repo.saveCourseVideo('c-mkt', video({ id: 'c-mkt-v1', title: 'Editado', durationSec: 603, url: 'https://www.youtube.com/watch?v=Ctd6BTuZmjA', sourceKind: 'youtube' })),
    );
    expect((await last(repo, 'c-mkt')).source).toEqual({ kind: 'youtube', videoId: 'Ctd6BTuZmjA' });
  });

  it('cambiar un video de YouTube a Drive y volver', async () => {
    await run(repo.saveCourseVideo('c-mkt', video({ id: 'c-mkt-v1', durationSec: 603, url: `https://drive.google.com/file/d/${ID}/view`, sourceKind: 'drive' })));
    expect((await last(repo, 'c-mkt')).source).toEqual({ kind: 'drive', fileId: ID });
    await run(repo.saveCourseVideo('c-mkt', video({ id: 'c-mkt-v1', durationSec: 603, url: 'https://youtu.be/Ctd6BTuZmjA', sourceKind: 'youtube' })));
    expect((await last(repo, 'c-mkt')).source).toEqual({ kind: 'youtube', videoId: 'Ctd6BTuZmjA' });
  });
});
