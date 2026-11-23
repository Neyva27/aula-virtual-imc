import { driveEmbedUrl, driveViewUrl, isDriveFileId, parseDriveFileId } from './drive';

// Identificador ficticio con la forma de los de Drive (33 caracteres).
const ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz012345';

describe('utilidades de Google Drive', () => {
  it('valida identificadores de archivo', () => {
    expect(isDriveFileId(ID)).toBe(true);
    for (const bad of ['', null, undefined, 'corto', 'abc<script>def>ghijklmnopqrstu', `${ID.slice(0, 10)} ${ID.slice(10)}`]) {
      expect(isDriveFileId(bad)).toBe(false);
    }
  });

  it('extrae el identificador de los enlaces compartidos habituales', () => {
    const urls = [
      `https://drive.google.com/file/d/${ID}/view?usp=sharing`,
      `https://drive.google.com/file/d/${ID}/view`,
      `https://drive.google.com/file/d/${ID}/preview`,
      `https://drive.google.com/file/d/${ID}`,
      `https://drive.google.com/open?id=${ID}`,
      `https://drive.google.com/uc?id=${ID}&export=download`,
      `https://docs.google.com/file/d/${ID}/edit`,
      `  https://drive.google.com/file/d/${ID}/view  `,
    ];
    for (const url of urls) expect(parseDriveFileId(url)).toBe(ID);
  });

  it('rechaza lo que no es un archivo de Drive', () => {
    const urls = [
      '',
      null,
      'no es un enlace',
      `http://drive.google.com/file/d/${ID}/view`, // sin https
      `https://drive.google.com/drive/folders/${ID}`, // carpeta
      `https://docs.google.com/document/d/${ID}/edit`, // documento de Docs
      `https://drive.google.com.ejemplo.test/file/d/${ID}/view`, // otro dominio
      `https://ejemplo.test/file/d/${ID}/view`,
      'https://drive.google.com/file/d/corto/view',
      'https://www.youtube.com/watch?v=_tA5cinv0U8',
    ];
    for (const url of urls) expect(parseDriveFileId(url)).toBeNull();
  });

  it('arma las direcciones del visor integrado y de apertura en Drive', () => {
    expect(driveEmbedUrl(ID)).toBe(`https://drive.google.com/file/d/${ID}/preview`);
    expect(driveViewUrl(ID)).toBe(`https://drive.google.com/file/d/${ID}/view`);
  });
});
