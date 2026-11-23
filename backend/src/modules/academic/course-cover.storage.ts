import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join, relative, resolve, isAbsolute } from 'node:path';
import type { Env } from '../../config/env.validation.js';
import { COVER_URL_PREFIX, managedCoverFile, managedCoverOf } from './academic.rules.js';

export { COVER_URL_PREFIX, managedCoverFile, managedCoverOf };

/**
 * Portadas de curso subidas por el Instructor (19/11/2026). El archivo se guarda en disco
 * (`<UPLOADS_DIR>/course-covers/<uuid>.<ext>`) y en MySQL (`courses.cover_image`) solo su ruta pública.
 * Nunca se guarda Base64 ni se usa el nombre del archivo enviado por el usuario.
 */

/** Tamaño máximo de una portada: 2 MB. */
export const COVER_MAX_BYTES = 2 * 1024 * 1024;
export type CoverExt = 'jpg' | 'png' | 'webp';

export const COVER_CONTENT_TYPE: Record<CoverExt, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

export const COVER_TOO_LARGE = 'La imagen supera el tamaño máximo de 2 MB.';
export const COVER_INVALID = 'El archivo no es una imagen válida. Usa una imagen JPG, PNG o WebP.';
export const COVER_MISSING = 'Selecciona una imagen JPG, PNG o WebP (campo «file»).';

/** Archivo recibido por Multer (almacenamiento en memoria). */
export interface UploadedCover {
  buffer: Buffer;
  size: number;
  mimetype: string;
}

/**
 * Tipo real de la imagen según su firma binaria (no según la extensión). Además, el tipo MIME declarado por el
 * navegador debe coincidir con la firma.
 */
export function detectCover(file: UploadedCover | undefined): CoverExt {
  if (!file?.buffer?.length) throw new BadRequestException(COVER_MISSING);
  if (file.size > COVER_MAX_BYTES || file.buffer.length > COVER_MAX_BYTES) throw new BadRequestException(COVER_TOO_LARGE);
  const b = file.buffer;
  let ext: CoverExt | null = null;
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) ext = 'jpg';
  else if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) ext = 'png';
  else if (b.length >= 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') ext = 'webp';
  if (!ext) throw new BadRequestException(COVER_INVALID);
  const declared = file.mimetype?.toLowerCase() === 'image/jpg' ? 'image/jpeg' : file.mimetype?.toLowerCase();
  if (declared !== COVER_CONTENT_TYPE[ext]) throw new BadRequestException(COVER_INVALID);
  return ext;
}

@Injectable()
export class CourseCoverStorage {
  /** Carpeta absoluta de las portadas. `UPLOADS_DIR` es relativo a la carpeta desde la que se inicia el backend. */
  readonly dir: string;

  constructor(config: ConfigService<Env, true>) {
    this.dir = resolve(config.get('UPLOADS_DIR', { infer: true }) || 'storage', 'course-covers');
  }

  /** Ruta absoluta de un archivo administrado; null si el nombre no es válido o saldría de la carpeta. */
  private pathOf(file: string | null): string | null {
    if (!managedCoverFile(file)) return null;
    const full = join(this.dir, file!);
    const rel = relative(this.dir, full);
    return rel && !rel.startsWith('..') && !isAbsolute(rel) ? full : null;
  }

  /** Guarda la imagen con un nombre aleatorio y devuelve su ruta pública. */
  async save(buffer: Buffer, ext: CoverExt): Promise<string> {
    await mkdir(this.dir, { recursive: true });
    const name = `${randomUUID()}.${ext}`;
    await writeFile(this.pathOf(name)!, buffer, { flag: 'wx' });
    return COVER_URL_PREFIX + name;
  }

  /** ¿Existe el archivo de una portada administrada? */
  async exists(url: string | null | undefined): Promise<boolean> {
    const path = this.pathOf(managedCoverOf(url));
    if (!path) return false;
    return stat(path).then(
      (s) => s.isFile(),
      () => false,
    );
  }

  /** Lee una portada por su nombre; null si no existe o el nombre no es válido. */
  async read(file: string): Promise<{ data: Buffer; contentType: string } | null> {
    const path = this.pathOf(file);
    if (!path) return null;
    try {
      const data = await readFile(path);
      return { data, contentType: COVER_CONTENT_TYPE[file.split('.').pop() as CoverExt] };
    } catch {
      return null;
    }
  }

  /** Borra una portada administrada (solo las de este módulo). Las demás rutas o direcciones se ignoran. */
  async remove(url: string | null | undefined): Promise<void> {
    const path = this.pathOf(managedCoverOf(url));
    if (path) await rm(path, { force: true }).catch(() => undefined);
  }
}
