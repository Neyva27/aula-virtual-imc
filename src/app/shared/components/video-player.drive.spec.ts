import { TestBed } from '@angular/core/testing';
import { VideoPlayer } from './video-player';
import { VideoRecord, VideoSource } from '../../core/models/course.model';

/** M4: reproducción de videos de Google Drive (fuente provisional). Identificadores ficticios. */
const ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz012345';

function video(source: VideoSource): VideoRecord {
  return { id: 'v-test', courseId: 'c-test', moduleId: 'c-test-m1', order: 1, title: 'Clase en Drive', durationSec: 360, published: true, source };
}

async function render(source: VideoSource) {
  const fixture = TestBed.createComponent(VideoPlayer);
  fixture.componentRef.setInput('video', video(source));
  await fixture.whenStable();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

describe('VideoPlayer con Google Drive (M4)', () => {
  it('integra el visor de Drive con título, sin cargar scripts, y avisa de los permisos', async () => {
    const { el } = await render({ kind: 'drive', fileId: ID });
    const iframe = el.querySelector('iframe')!;
    expect(iframe.getAttribute('src')).toBe(`https://drive.google.com/file/d/${ID}/preview`);
    expect(iframe.getAttribute('title')).toBe('Video: Clase en Drive');
    expect(iframe.getAttribute('referrerpolicy')).toBe('strict-origin-when-cross-origin');
    expect(el.querySelector('script')).toBeNull();
    expect(el.textContent).toContain('Cualquier persona con el enlace');
    const open = el.querySelector<HTMLAnchorElement>('a[href*="drive.google.com"]')!;
    expect(open.getAttribute('href')).toBe(`https://drive.google.com/file/d/${ID}/view`);
    expect(open.getAttribute('target')).toBe('_blank');
    expect(open.getAttribute('rel')).toBe('noopener noreferrer');
    expect(open.textContent).toContain('Abrir en Google Drive');
    expect(el.textContent).not.toContain('Ver en YouTube');
  });

  it('el aviso de permisos sigue visible tras cargar (la página no puede saber si Drive negó el acceso)', async () => {
    const { fixture, el } = await render({ kind: 'drive', fileId: ID });
    el.querySelector('iframe')!.dispatchEvent(new Event('load'));
    await fixture.whenStable();
    expect(el.textContent).not.toContain('Cargando el reproductor');
    expect(el.textContent).toContain('Abrir en Google Drive');
  });

  it('reconoce un enlace de Drive guardado antes como enlace genérico', async () => {
    const { el } = await render({ kind: 'url', url: `https://drive.google.com/file/d/${ID}/view?usp=sharing` });
    expect(el.querySelector('iframe')!.getAttribute('src')).toBe(`https://drive.google.com/file/d/${ID}/preview`);
  });

  it('un identificador inválido no se integra y muestra un mensaje comprensible', async () => {
    const { el } = await render({ kind: 'drive', fileId: 'no-valido<script>' });
    expect(el.querySelector('iframe')).toBeNull();
    expect(el.textContent).toContain('El enlace de este video no es válido');
  });

  it('YouTube no cambia: sigue con su reproductor y su enlace de respaldo', async () => {
    const { el } = await render({ kind: 'youtube', videoId: '_tA5cinv0U8' });
    expect(el.querySelector('iframe')!.getAttribute('src')).toContain('youtube-nocookie.com/embed/_tA5cinv0U8');
    expect(el.textContent).toContain('Ver en YouTube');
    expect(el.textContent).not.toContain('Google Drive');
  });
});
