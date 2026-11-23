import { isYouTubeId, parseYouTubeId, youTubeEmbedUrl, youTubeWatchUrl } from './youtube';

describe('utilidades de YouTube', () => {
  it('valida identificadores de 11 caracteres', () => {
    expect(isYouTubeId('_tA5cinv0U8')).toBe(true);
    expect(isYouTubeId('Ctd6BTuZmjA')).toBe(true);
    for (const bad of ['', null, undefined, 'corto', '_tA5cinv0U8x', 'abc<script>', 'a b c d e f']) {
      expect(isYouTubeId(bad)).toBe(false);
    }
  });

  it('extrae el identificador de los formatos de enlace habituales', () => {
    const urls = [
      'https://www.youtube.com/watch?v=_tA5cinv0U8',
      'https://youtube.com/watch?v=_tA5cinv0U8&t=30s',
      'https://m.youtube.com/watch?v=_tA5cinv0U8',
      'https://youtu.be/_tA5cinv0U8',
      'https://youtu.be/_tA5cinv0U8?si=abc',
      'https://www.youtube.com/embed/_tA5cinv0U8',
      'https://www.youtube-nocookie.com/embed/_tA5cinv0U8',
      'https://www.youtube.com/shorts/_tA5cinv0U8',
      ' https://www.youtube.com/watch?v=_tA5cinv0U8 ',
    ];
    for (const url of urls) expect(parseYouTubeId(url)).toBe('_tA5cinv0U8');
  });

  it('rechaza enlaces que no son de YouTube o no son válidos', () => {
    const urls = [
      null,
      '',
      'no es un enlace',
      'https://ejemplo.test/watch?v=_tA5cinv0U8',
      'https://youtube.com.ejemplo.test/watch?v=_tA5cinv0U8',
      'javascript:alert(1)',
      'https://www.youtube.com/watch?v=corto',
      'https://www.youtube.com/channel/_tA5cinv0U8',
    ];
    for (const url of urls) expect(parseYouTubeId(url)).toBeNull();
  });

  it('arma los enlaces de reproducción integrada y de respaldo', () => {
    expect(youTubeEmbedUrl('_tA5cinv0U8')).toBe('https://www.youtube-nocookie.com/embed/_tA5cinv0U8?rel=0&playsinline=1');
    expect(youTubeWatchUrl('Ctd6BTuZmjA')).toBe('https://www.youtube.com/watch?v=Ctd6BTuZmjA');
  });
});
