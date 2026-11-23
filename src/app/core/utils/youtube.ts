/** Identificador de video de YouTube: 11 caracteres [A-Za-z0-9_-]. */
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

export function isYouTubeId(id: string | null | undefined): id is string {
  return !!id && VIDEO_ID.test(id);
}

/**
 * Extrae el identificador de un enlace de YouTube (watch?v=, youtu.be/, /embed/, /shorts/, /live/).
 * Devuelve null si el enlace no es de YouTube o el identificador no es válido.
 */
export function parseYouTubeId(url: string | null | undefined): string | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
  const host = parsed.hostname.replace(/^(www|m)\./, '');
  let id: string | null = null;
  if (host === 'youtu.be') {
    id = parsed.pathname.split('/')[1] ?? null;
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const [, first, second] = parsed.pathname.split('/');
    id = first === 'watch' ? parsed.searchParams.get('v') : ['embed', 'shorts', 'live'].includes(first) ? second : null;
  }
  return isYouTubeId(id) ? id : null;
}

/** Reproductor integrado en modo de privacidad mejorada (sin cookies hasta reproducir). */
export function youTubeEmbedUrl(id: string): string {
  return `https://www.youtube-nocookie.com/embed/${id}?rel=0&playsinline=1`;
}

export function youTubeWatchUrl(id: string): string {
  return `https://www.youtube.com/watch?v=${id}`;
}
