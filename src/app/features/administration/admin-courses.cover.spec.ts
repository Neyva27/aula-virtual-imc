import { Injectable } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, firstValueFrom, map, throwError } from 'rxjs';
import { AdminCourses, DEMO_COVERS, UPLOADED_COVER_PREFIX, coverFileError } from './admin-courses';
import { APP_ENVIRONMENT } from '../../core/config/app-environment';
import { CourseRecord, CourseRecordPatch } from '../../core/models/course.model';
import { DataRepository } from '../../core/services/data-repository';
import { MockDataRepository } from '../../core/services/mock-data-repository';
import { ApiRequestError } from '../../core/services/api-data-repository';

/**
 * Portadas de curso subidas desde el equipo (19/11/2026), pantalla de cursos en modo API. El repositorio de prueba
 * extiende la demostración con `uploadCourseCover` y guarda la RUTA devuelta por el «servidor» (nunca el archivo):
 * así se ejercitan el flujo de crear → subir, el reemplazo, quitar y la conservación al volver a abrir la pantalla.
 */
@Injectable()
class UploadingRepository extends MockDataRepository {
  /** Rutas de portadas subidas por curso (lo que guardaría MySQL). */
  readonly uploaded = new Map<string, string>();
  readonly uploads: { courseId: string; file: File }[] = [];
  failNext = false;
  private uploadSeq = 0;

  private withCover = (c: CourseRecord): CourseRecord => (this.uploaded.has(c.id) ? { ...c, coverImage: this.uploaded.get(c.id)! } : c);

  override getCourses(): Observable<CourseRecord[]> {
    return super.getCourses().pipe(map((list) => list.map(this.withCover)));
  }

  /** Igual que el backend: una ruta subida solo se conserva si es la del propio curso; otra portada la reemplaza. */
  override updateCourseById(courseId: string, patch: CourseRecordPatch): Observable<CourseRecord> {
    const cover = patch.coverImage;
    if (cover?.startsWith(UPLOADED_COVER_PREFIX)) {
      if (this.uploaded.get(courseId) !== cover) return throwError(() => new ApiRequestError('La imagen de portada no corresponde a este curso.', 400));
      return super.updateCourseById(courseId, { ...patch, coverImage: null }).pipe(map(this.withCover));
    }
    this.uploaded.delete(courseId);
    return super.updateCourseById(courseId, patch);
  }

  uploadCourseCover(courseId: string, file: File): Observable<CourseRecord> {
    this.uploads.push({ courseId, file });
    if (this.failNext) {
      this.failNext = false;
      return throwError(() => new ApiRequestError('La imagen supera el tamaño máximo de 2 MB.', 413));
    }
    this.uploadSeq += 1;
    this.uploaded.set(courseId, `${UPLOADED_COVER_PREFIX}00000000-0000-4000-8000-00000000000${this.uploadSeq}.png`);
    return this.getCourses().pipe(map((list) => list.find((c) => c.id === courseId)!));
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(fixture: ComponentFixture<unknown>, cond: () => boolean, timeout = 8000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    await fixture.whenStable();
    if (cond()) return;
    await sleep(50);
  }
  throw new Error('La condición no se cumplió a tiempo');
}

const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const buttonByText = (el: HTMLElement, label: string) => [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => text(b).includes(label));
const row = (el: HTMLElement, id: string) => el.querySelector<HTMLTableRowElement>(`tr[data-course="${id}"]`)!;
const png = (name = 'portada.png', size = 1000, type = 'image/png') => new File([new Uint8Array(size)], name, { type });

function type(el: HTMLElement, selector: string, value: string): void {
  const input = el.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!;
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('blur'));
}

/** Simula la selección de un archivo en el explorador del sistema. */
function pick(el: HTMLElement, file: File): void {
  const input = el.querySelector<HTMLInputElement>('#c-cover-file')!;
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new Event('change'));
}

const choose = (el: HTMLElement, value: string) => el.querySelector<HTMLInputElement>(`input[type=radio][value="${value}"]`)!.click();

let createdUrls: string[] = [];
let revokedUrls: string[] = [];

async function setup(mode: 'api' | 'demo' = 'api') {
  localStorage.clear();
  sessionStorage.clear();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: APP_ENVIRONMENT, useValue: { authMode: mode, apiUrl: '/api/v1', sessionRestoreTimeoutMs: 5000 } },
      { provide: DataRepository, useClass: mode === 'api' ? UploadingRepository : MockDataRepository },
    ],
  });
  const repo = TestBed.inject(DataRepository) as UploadingRepository;
  return { repo, ...(await mount()) };
}

async function mount() {
  const fixture = TestBed.createComponent(AdminCourses);
  const el = fixture.nativeElement as HTMLElement;
  await until(fixture, () => el.querySelectorAll('tbody tr').length > 0);
  return { fixture, el };
}

async function openEdit(fixture: ComponentFixture<AdminCourses>, el: HTMLElement, id: string) {
  row(el, id).querySelector('button')!.click();
  await until(fixture, () => text(el.querySelector('#course-form-title')) === 'Editar curso');
}

describe('AdminCourses: portada subida desde el equipo (modo API)', () => {
  beforeEach(() => {
    createdUrls = [];
    revokedUrls = [];
    let n = 0;
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
      const url = `blob:vista-previa-${++n}`;
      createdUrls.push(url);
      return url;
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation((url: string) => void revokedUrls.push(url));
  });
  afterEach(() => vi.restoreAllMocks());

  it('valida formato y tamaño en el navegador con mensajes en español', () => {
    expect(coverFileError(png())).toBe('');
    expect(coverFileError(png('foto.jpg', 10, 'image/jpeg'))).toBe('');
    expect(coverFileError(png('foto.webp', 10, 'image/webp'))).toBe('');
    expect(coverFileError(png('animada.gif', 10, 'image/gif'))).toContain('Formato no permitido');
    expect(coverFileError(png('virus.exe', 10, 'image/png'))).toContain('Formato no permitido');
    expect(coverFileError(png('dibujo.svg', 10, 'image/svg+xml'))).toContain('Formato no permitido');
    expect(coverFileError(png('grande.png', 2 * 1024 * 1024 + 1))).toBe('La imagen supera el tamaño máximo de 2 MB.');
    expect(coverFileError(png('limite.png', 2 * 1024 * 1024))).toBe('');
  });

  it('crea el curso, luego sube la imagen y la muestra; se conserva al volver a abrir la pantalla', async () => {
    const { repo, fixture, el } = await setup();
    buttonByText(el, 'Registrar nuevo curso')!.click();
    await until(fixture, () => text(el.querySelector('#course-form-title')) === 'Nuevo curso');
    type(el, '#c-name', 'Curso con portada subida');
    type(el, '#c-desc', 'Descripción ficticia.');
    choose(el, 'upload');
    await fixture.whenStable();

    // Selección inválida: mensaje y sin vista previa.
    pick(el, png('animada.gif', 10, 'image/gif'));
    await fixture.whenStable();
    expect(text(el)).toContain('Formato no permitido. Selecciona una imagen JPG, PNG o WebP.');
    pick(el, png('grande.png', 3 * 1024 * 1024));
    await fixture.whenStable();
    expect(text(el)).toContain('La imagen supera el tamaño máximo de 2 MB.');
    expect(createdUrls).toEqual([]);

    // Selección válida: vista previa local antes de guardar y botones de reemplazar y quitar.
    pick(el, png('mi-portada.png', 50_000));
    await fixture.whenStable();
    expect(el.querySelector('.preview img')!.getAttribute('src')).toBe('blob:vista-previa-1');
    expect(text(el.querySelector('[data-test="pending-file"]'))).toContain('mi-portada.png (49 KB)');
    expect(buttonByText(el, 'Reemplazar imagen')).toBeTruthy();
    expect(buttonByText(el, 'Quitar imagen')).toBeTruthy();
    expect(repo.uploads).toEqual([]);

    buttonByText(el, 'Crear curso')!.click();
    await until(fixture, () => text(el).includes('Curso creado en borrador con su portada'));
    const created = (await firstValueFrom(repo.getCourses())).find((c) => c.name === 'Curso con portada subida')!;
    expect(repo.uploads.map((u) => [u.courseId, u.file.name])).toEqual([[created.id, 'mi-portada.png']]);
    expect(created.coverImage).toMatch(/^\/api\/v1\/public\/course-covers\/.+\.png$/);
    await until(fixture, () => row(el, created.id)?.querySelector('img')?.getAttribute('src') === created.coverImage);
    expect(revokedUrls).toContain('blob:vista-previa-1');

    // «Recargar»: una pantalla nueva lee la ruta guardada.
    fixture.destroy();
    const again = await mount();
    expect(row(again.el, created.id).querySelector('img')!.getAttribute('src')).toBe(created.coverImage);
    await openEdit(again.fixture, again.el, created.id);
    expect(again.el.querySelector<HTMLInputElement>('input[type=radio][value="upload"]')!.checked).toBe(true);
    expect(again.el.querySelector('.preview img')!.getAttribute('src')).toBe(created.coverImage);
    expect(text(again.el)).toContain('Imagen guardada en el servidor.');
  }, 30_000);

  it('si la subida falla, el curso queda creado y se puede reintentar con «Guardar cambios»', async () => {
    const { repo, fixture, el } = await setup();
    buttonByText(el, 'Registrar nuevo curso')!.click();
    await until(fixture, () => text(el.querySelector('#course-form-title')) === 'Nuevo curso');
    type(el, '#c-name', 'Curso con subida fallida');
    type(el, '#c-desc', 'Descripción ficticia.');
    choose(el, 'upload');
    await fixture.whenStable();
    pick(el, png());
    repo.failNext = true;
    buttonByText(el, 'Crear curso')!.click();
    await until(fixture, () => text(el).includes('pero no se pudo subir la portada'));
    expect(text(el)).toContain('El curso se creó, pero no se pudo subir la portada: La imagen supera el tamaño máximo de 2 MB.');
    const created = (await firstValueFrom(repo.getCourses())).find((c) => c.name === 'Curso con subida fallida')!;
    expect(created).toBeTruthy();
    expect(created.coverImage).toBeNull();

    // El archivo elegido sigue en el formulario: reintentar.
    await until(fixture, () => !!buttonByText(el, 'Guardar cambios'));
    expect(text(el.querySelector('[data-test="pending-file"]'))).toContain('portada.png');
    buttonByText(el, 'Guardar cambios')!.click();
    await until(fixture, () => text(el).includes('Cambios guardados con su portada'));
    expect(repo.uploaded.get(created.id)).toMatch(/\.png$/);
  }, 30_000);

  it('edición: reemplaza la imagen, cancelar la conserva y quitar deja el curso sin portada', async () => {
    const { repo, fixture, el } = await setup();
    await firstValueFrom(repo.uploadCourseCover('c-ia', png()));
    const first = repo.uploaded.get('c-ia')!;
    fixture.destroy();
    const view = await mount();

    // Reemplazar y cancelar: no se sube nada y se conserva la imagen guardada.
    await openEdit(view.fixture, view.el, 'c-ia');
    pick(view.el, png('otra.webp', 2000, 'image/webp'));
    await view.fixture.whenStable();
    expect(view.el.querySelector('.preview img')!.getAttribute('src')).toBe('blob:vista-previa-1');
    buttonByText(view.el, 'Cancelar')!.click();
    await view.fixture.whenStable();
    expect(repo.uploads).toHaveLength(1);
    expect(repo.uploaded.get('c-ia')).toBe(first);

    // Reemplazar y guardar: el curso se guarda con su portada actual y después se sube la nueva.
    await openEdit(view.fixture, view.el, 'c-ia');
    pick(view.el, png('otra.webp', 2000, 'image/webp'));
    await view.fixture.whenStable();
    buttonByText(view.el, 'Guardar cambios')!.click();
    await until(view.fixture, () => text(view.el).includes('Cambios guardados con su portada'));
    const second = repo.uploaded.get('c-ia')!;
    expect(second).not.toBe(first);
    expect(repo.uploads.at(-1)!.file.name).toBe('otra.webp');

    // Quitar: pasa a «Sin portada» y al guardar el curso queda sin imagen.
    buttonByText(view.el, 'Quitar imagen')!.click();
    await view.fixture.whenStable();
    expect(view.el.querySelector<HTMLInputElement>('input[type=radio][value="none"]')!.checked).toBe(true);
    buttonByText(view.el, 'Guardar cambios')!.click();
    await until(view.fixture, () => text(view.el).includes('Cambios guardados'));
    expect(repo.uploaded.has('c-ia')).toBe(false);
    expect((await firstValueFrom(repo.getCourses())).find((c) => c.id === 'c-ia')!.coverImage).toBeNull();
  }, 30_000);

  it('edición: cambiar a una portada de demostración o a una dirección https reemplaza la imagen subida', async () => {
    const { repo, fixture, el } = await setup();
    await firstValueFrom(repo.uploadCourseCover('c-ia', png()));
    fixture.destroy();
    const view = await mount();
    await openEdit(view.fixture, view.el, 'c-ia');
    choose(view.el, 'demo');
    await view.fixture.whenStable();
    buttonByText(view.el, 'Guardar cambios')!.click();
    await until(view.fixture, () => text(view.el).includes('Cambios guardados'));
    expect((await firstValueFrom(repo.getCourses())).find((c) => c.id === 'c-ia')!.coverImage).toBe(DEMO_COVERS[0].path);

    choose(view.el, 'url');
    await view.fixture.whenStable();
    type(view.el, '#c-cover-url', 'https://' + 'x'.repeat(500));
    buttonByText(view.el, 'Guardar cambios')!.click();
    await view.fixture.whenStable();
    expect(text(view.el)).toContain('La dirección no puede superar los 500 caracteres.');
    type(view.el, '#c-cover-url', 'https://imagenes.ejemplo.test/portada.webp');
    buttonByText(view.el, 'Guardar cambios')!.click();
    await until(view.fixture, () => text(view.el).includes('Cambios guardados'));
    expect((await firstValueFrom(repo.getCourses())).find((c) => c.id === 'c-ia')!.coverImage).toBe('https://imagenes.ejemplo.test/portada.webp');
  }, 30_000);

  it('elegir «imagen desde el equipo» sin seleccionar archivo no guarda y lo indica', async () => {
    const { fixture, el } = await setup();
    await openEdit(fixture, el, 'c-ia');
    choose(el, 'upload');
    await fixture.whenStable();
    buttonByText(el, 'Guardar cambios')!.click();
    await fixture.whenStable();
    expect(text(el)).toContain('Selecciona una imagen o elige otra opción de portada.');
  }, 20_000);
});

describe('AdminCourses: portada en modo demostración', () => {
  it('la subida está desactivada (no se guardan imágenes ni Base64) y las demás opciones siguen disponibles', async () => {
    const { fixture, el } = await setup('demo');
    await openEdit(fixture, el, 'c-ia');
    const upload = el.querySelector<HTMLInputElement>('input[type=radio][value="upload"]')!;
    expect(upload.disabled).toBe(true);
    expect(text(el)).toContain('en la demostración no se guardan archivos');
    for (const value of ['none', 'demo', 'url']) expect(el.querySelector<HTMLInputElement>(`input[type=radio][value="${value}"]`)!.disabled).toBe(false);
  }, 20_000);
});
