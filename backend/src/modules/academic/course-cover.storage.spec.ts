import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { managedCoverOf, normalizeCover } from './academic.rules.js';
import { COVER_MAX_BYTES, detectCover } from './course-cover.storage.js';

/** Portadas de curso (19/11/2026): reglas puras de rutas y de firma binaria. */
const UUID = '3f2a9c1e-7b4d-4e8a-9c2f-0a1b2c3d4e5f';
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);

describe('Portadas: rutas administradas', () => {
  it('reconoce solo /api/v1/public/course-covers/<uuid>.<jpg|png|webp>', () => {
    expect(managedCoverOf(`/api/v1/public/course-covers/${UUID}.png`)).toBe(`${UUID}.png`);
    for (const bad of [
      `/api/v1/public/course-covers/${UUID}.svg`,
      `/api/v1/public/course-covers/../${UUID}.png`,
      `/api/v1/public/course-covers/${UUID.toUpperCase()}.png`,
      `/otra/${UUID}.png`,
      'https://ejemplo.test/x.png',
      null,
    ]) {
      expect(managedCoverOf(bad)).toBeNull();
    }
  });

  it('normalizeCover acepta https, demostración y subidas; rechaza más de 500 caracteres y rutas extrañas', () => {
    expect(normalizeCover(`/api/v1/public/course-covers/${UUID}.webp`)).toBe(`/api/v1/public/course-covers/${UUID}.webp`);
    expect(normalizeCover('demo/covers/marketing-digital.svg')).toBe('demo/covers/marketing-digital.svg');
    expect(normalizeCover(' https://ejemplo.test/p.png ')).toBe('https://ejemplo.test/p.png');
    expect(normalizeCover('')).toBeNull();
    expect(normalizeCover('https://' + 'a'.repeat(493))).toBeUndefined();
    expect(normalizeCover('/api/v1/public/course-covers/../../.env')).toBeUndefined();
    expect(normalizeCover('data:image/png;base64,AAAA')).toBeUndefined();
  });
});

describe('Portadas: detectCover (firma binaria y tipo declarado)', () => {
  it('detecta JPG, PNG y WebP', () => {
    expect(detectCover({ buffer: Buffer.from([0xff, 0xd8, 0xff, 0xdb]), size: 4, mimetype: 'image/jpeg' })).toBe('jpg');
    expect(detectCover({ buffer: Buffer.from([0xff, 0xd8, 0xff, 0xdb]), size: 4, mimetype: 'image/jpg' })).toBe('jpg');
    expect(detectCover({ buffer: PNG, size: PNG.length, mimetype: 'image/png' })).toBe('png');
    const webp = Buffer.from('RIFF\x10\0\0\0WEBPVP8 ', 'latin1');
    expect(detectCover({ buffer: webp, size: webp.length, mimetype: 'image/webp' })).toBe('webp');
  });

  it('rechaza archivos falsos, tipos que no coinciden, vacíos y de más de 2 MB', () => {
    const cases = [
      { buffer: Buffer.from('hola'), size: 4, mimetype: 'image/png' },
      { buffer: PNG, size: PNG.length, mimetype: 'image/webp' },
      { buffer: Buffer.alloc(0), size: 0, mimetype: 'image/png' },
      { buffer: PNG, size: COVER_MAX_BYTES + 1, mimetype: 'image/png' },
    ];
    for (const file of cases) expect(() => detectCover(file)).toThrow(BadRequestException);
    expect(() => detectCover(undefined)).toThrow('Selecciona una imagen');
  });
});
