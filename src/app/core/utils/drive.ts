/** Identificador de archivo de Google Drive: letras, números, «-» y «_» (en la práctica, 25 o más caracteres). */
const FILE_ID = /^[A-Za-z0-9_-]{25,}$/;

export function isDriveFileId(id: string | null | undefined): id is string {
  return !!id && FILE_ID.test(id);
}

/**
 * Extrae el identificador de un enlace compartido de Google Drive (/file/d/<id>/…, open?id=, uc?id=).
 * Devuelve null si no es un enlace de archivo de Drive (por ejemplo, una carpeta o un documento de Docs).
 * Solo valida el formato: sin backend no se puede saber si el archivo está compartido con «Cualquier persona con el enlace».
 */
export function parseDriveFileId(url: string | null | undefined): string | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;
  if (parsed.hostname !== 'drive.google.com' && parsed.hostname !== 'docs.google.com') return null;
  const [, first, second, third] = parsed.pathname.split('/');
  let id: string | null = null;
  if (first === 'file' && second === 'd') id = third ?? null;
  else if (parsed.hostname === 'drive.google.com' && (first === 'open' || first === 'uc')) id = parsed.searchParams.get('id');
  return isDriveFileId(id) ? id : null;
}

/** Visor integrado de Drive. Solo reproduce si el archivo está compartido para verlo con el enlace. */
export function driveEmbedUrl(id: string): string {
  return `https://drive.google.com/file/d/${id}/preview`;
}

export function driveViewUrl(id: string): string {
  return `https://drive.google.com/file/d/${id}/view`;
}
