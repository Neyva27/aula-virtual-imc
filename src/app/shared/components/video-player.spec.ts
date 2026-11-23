import { TestBed } from '@angular/core/testing';
import { VideoPlayer } from './video-player';
import { VideoRecord, VideoSource } from '../../core/models/course.model';

function video(source: VideoSource, title = 'Video de prueba'): VideoRecord {
  return { id: 'v-test', courseId: 'c-test', moduleId: 'c-test-m1', order: 1, title, durationSec: 360, published: true, source };
}

async function render(source: VideoSource) {
  const fixture = TestBed.createComponent(VideoPlayer);
  fixture.componentRef.setInput('video', video(source));
  await fixture.whenStable();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

describe('VideoPlayer', () => {
  it('integra un video de YouTube con iframe de privacidad mejorada, título y enlace de respaldo', async () => {
    const { el } = await render({ kind: 'youtube', videoId: '_tA5cinv0U8' });
    const iframe = el.querySelector('iframe')!;
    expect(iframe.getAttribute('src')).toBe('https://www.youtube-nocookie.com/embed/_tA5cinv0U8?rel=0&playsinline=1');
    expect(iframe.getAttribute('title')).toBe('Video: Video de prueba');
    expect(iframe.getAttribute('referrerpolicy')).toBe('strict-origin-when-cross-origin');
    expect(iframe.getAttribute('allow')).not.toContain('autoplay');
    expect(el.textContent).toContain('Cargando el reproductor');
    const fallback = el.querySelector<HTMLAnchorElement>('a[href^="https://www.youtube.com/watch"]')!;
    expect(fallback.getAttribute('href')).toBe('https://www.youtube.com/watch?v=_tA5cinv0U8');
    expect(fallback.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('oculta el aviso de carga cuando el iframe termina de cargar', async () => {
    const { fixture, el } = await render({ kind: 'youtube', videoId: 'Ctd6BTuZmjA' });
    el.querySelector('iframe')!.dispatchEvent(new Event('load'));
    await fixture.whenStable();
    expect(el.textContent).not.toContain('Cargando el reproductor');
  });

  it('reconoce un enlace de YouTube guardado como URL', async () => {
    const { el } = await render({ kind: 'url', url: 'https://youtu.be/Ctd6BTuZmjA' });
    expect(el.querySelector('iframe')!.getAttribute('src')).toContain('/embed/Ctd6BTuZmjA');
  });

  it('un video sin fuente muestra un estado informativo, sin iframe', async () => {
    const { el } = await render({ kind: 'placeholder' });
    expect(el.querySelector('iframe')).toBeNull();
    expect(el.textContent).toContain('Video de demostración sin archivo de reproducción');
  });

  it('un identificador de YouTube inválido no se integra y lo informa', async () => {
    const { el } = await render({ kind: 'youtube', videoId: 'x"><script>' });
    expect(el.querySelector('iframe')).toBeNull();
    expect(el.textContent).toContain('El enlace de este video no es válido');
  });

  it('un enlace https externo no se integra: se ofrece abrirlo aparte', async () => {
    const { el } = await render({ kind: 'url', url: 'https://ejemplo.test/video.mp4' });
    expect(el.querySelector('iframe')).toBeNull();
    const link = el.querySelector<HTMLAnchorElement>('a[target="_blank"]')!;
    expect(link.getAttribute('href')).toBe('https://ejemplo.test/video.mp4');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('un enlace no https no se ofrece', async () => {
    const { el } = await render({ kind: 'url', url: 'javascript:alert(1)' });
    expect(el.querySelector('a')).toBeNull();
    expect(el.textContent).toContain('El enlace de este video no es válido');
  });

  it('sin conexión no carga el reproductor y avisa', async () => {
    const { fixture, el } = await render({ kind: 'youtube', videoId: '_tA5cinv0U8' });
    window.dispatchEvent(new Event('offline'));
    await fixture.whenStable();
    expect(el.querySelector('iframe')).toBeNull();
    expect(el.textContent).toContain('Sin conexión a internet');
    window.dispatchEvent(new Event('online'));
    await fixture.whenStable();
    expect(el.querySelector('iframe')).not.toBeNull();
  });

  it('cambiar de video reemplaza el reproductor y reinicia el estado de carga', async () => {
    const { fixture, el } = await render({ kind: 'youtube', videoId: '_tA5cinv0U8' });
    el.querySelector('iframe')!.dispatchEvent(new Event('load'));
    await fixture.whenStable();
    fixture.componentRef.setInput('video', video({ kind: 'youtube', videoId: 'Ctd6BTuZmjA' }, 'Otro video'));
    await fixture.whenStable();
    expect(el.querySelector('iframe')!.getAttribute('src')).toContain('/embed/Ctd6BTuZmjA');
    expect(el.querySelector('iframe')!.getAttribute('title')).toBe('Video: Otro video');
    expect(el.textContent).toContain('Cargando el reproductor');
  });
});
