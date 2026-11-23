import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { DEMO_SUFFIX } from '../../core/config/app-environment';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Observable, catchError, finalize, forkJoin, map, of, switchMap } from 'rxjs';
import { DataRepository } from '../../core/services/data-repository';
import { APP_ENVIRONMENT, isApiMode } from '../../core/config/app-environment';
import { COURSE_LEVELS, CourseInput, CourseLevel, CourseRecord, PublicationCheck } from '../../core/models/course.model';
import { LevelBadge } from '../../shared/components/level-badge';
import { SEED_COVERS } from '../../core/data/seed';
import { CourseCover } from '../../shared/components/course-cover';
import { Icon } from '../../shared/components/icon';
import { TrainingHoursPipe } from '../../shared/pipes/training-hours.pipe';
import { errMsg } from './admin-utils';
import { AdminCourseContent } from './admin-course-content';
import { AdminLiveSessions } from './admin-live-sessions';

type CoverMode = 'none' | 'demo' | 'upload' | 'url';

/** Portadas subidas al servidor (19/11/2026): el archivo vive en el backend y el curso guarda solo esta ruta. */
export const UPLOADED_COVER_PREFIX = '/api/v1/public/course-covers/';
export const COVER_FILE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const COVER_FILE_MAX_BYTES = 2 * 1024 * 1024;
const COVER_URL_MAX = 500;

type CoverUploader = DataRepository & { uploadCourseCover?: (courseId: string, file: File) => Observable<CourseRecord> };

/** Validación previa en el navegador (el servidor vuelve a validar por la firma binaria). */
export function coverFileError(file: File): string {
  const byExt = /\.(jpe?g|png|webp)$/i.test(file.name);
  if (!COVER_FILE_TYPES.includes(file.type) || !byExt) return 'Formato no permitido. Selecciona una imagen JPG, PNG o WebP.';
  if (file.size > COVER_FILE_MAX_BYTES) return 'La imagen supera el tamaño máximo de 2 MB.';
  if (file.size === 0) return 'El archivo está vacío. Selecciona otra imagen.';
  return '';
}

interface CourseRow {
  course: CourseRecord;
  check: PublicationCheck;
  totalVideos: number;
  publishedVideos: number;
}

/** Portadas de demostración disponibles (no son imágenes oficiales de IMC). */
const COVER_LABELS: Record<string, string> = {
  'demo/covers/curso-demostracion.svg': 'Círculos concéntricos',
  'demo/covers/inteligencia-artificial.svg': 'Red de nodos',
  'demo/covers/marketing-digital.svg': 'Barras ascendentes',
};
export const DEMO_COVERS = [...new Set(Object.values(SEED_COVERS))].map((path) => ({
  path,
  label: COVER_LABELS[path] ?? path.split('/').pop()!,
}));

/** Horas opcionales: vacío (por definir) o un número entero mayor o igual a 1. */
function optionalHours(control: AbstractControl): ValidationErrors | null {
  const v = control.value;
  return v === null || v === '' || (Number.isInteger(Number(v)) && Number(v) >= 1) ? null : { hours: true };
}

@Component({
  selector: 'app-admin-courses',
  imports: [ReactiveFormsModule, CourseCover, TrainingHoursPipe, Icon, AdminCourseContent, AdminLiveSessions, LevelBadge],
  template: `
    <div class="stack">
      <header class="row between page-head">
        <div>
          <h1>Cursos</h1>
          <p class="muted">Crea y edita cursos. Un curso se publica solo cuando cumple los requisitos obligatorios.</p>
        </div>
        <button type="button" class="btn btn-primary" (click)="startCreate()"><app-icon name="plus" size="sm" /> Registrar nuevo curso</button>
      </header>

      <p class="alert alert-info small">
        La gestión de varios cursos fue solicitada en la reunión del 23/10 y amplía la regla RN-02 (un solo curso);
        está pendiente de formalizar con la empresa. Los cursos nuevos se crean en borrador.
      </p>

      @if (message()) { <p class="alert alert-success" role="status">{{ message() }}</p> }
      @if (error()) { <p class="alert alert-danger" role="alert">{{ error() }}</p> }

      @if (loading()) {
        <p class="card muted" role="status">Cargando…</p>
      } @else {
        <div class="field level-filter">
          <label for="c-level-filter">Filtrar por nivel</label>
          <select id="c-level-filter" class="input" (change)="levelFilter.set($any($event.target).value)">
            <option value="">Todos los niveles</option>
            @for (l of levels; track l.value) { <option [value]="l.value">{{ l.label }}</option> }
            <option value="pendiente">Pendiente de clasificación</option>
          </select>
        </div>
        <div class="table-wrap table-cards">
          <table>
            <caption class="sr-only">Cursos registrados</caption>
            <thead>
              <tr>
                <th scope="col">Portada</th>
                <th scope="col">Curso</th>
                <th scope="col">Estado</th>
                <th scope="col">Videos publicados</th>
                <th scope="col">Horas</th>
                <th scope="col">Requisitos</th>
                <th scope="col"><span class="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              @for (r of visibleRows(); track r.course.id) {
                <tr [class.is-selected]="r.course.id === selectedId()" [attr.data-course]="r.course.id">
                  <td class="thumb"><app-course-cover [image]="r.course.coverImage" /></td>
                  <td>
                    <strong>{{ r.course.name }}</strong>
                    @if (r.course.isDemo) { <span class="badge badge--neutral">Demo</span> }
                    <span class="level-line"><app-level-badge [level]="r.course.level" /></span>
                  </td>
                  <td data-label="Estado">
                    <span class="badge" [class]="r.course.status === 'publicado' ? 'badge--success' : 'badge--warning'">
                      {{ r.course.status === 'publicado' ? 'Publicado' : 'Borrador' }}
                    </span>
                    @if (isInactive(r.course)) { <span class="badge badge--neutral" data-test="inactive">Desactivado</span> }
                  </td>
                  <td data-label="Videos publicados">{{ r.publishedVideos }} de {{ r.totalVideos }}</td>
                  <td data-label="Horas">{{ r.course.trainingHours | trainingHours }}</td>
                  <td class="small" data-label="Requisitos">
                    @if (r.check.canPublish) {
                      <span class="ok"><app-icon name="check" size="sm" /> Cumple los obligatorios</span>
                    } @else {
                      <span class="pending">{{ r.check.blocking.length }} {{ r.check.blocking.length === 1 ? 'pendiente' : 'pendientes' }}</span>
                    }
                  </td>
                  <td class="actions">
                    <button
                      type="button"
                      class="btn btn-secondary"
                      [attr.aria-pressed]="r.course.id === selectedId()"
                      [attr.aria-label]="'Editar ' + r.course.name"
                      (click)="edit(r)"
                    >
                      Editar
                    </button>
                    @if (apiMode) {
                      <button
                        type="button"
                        class="btn btn-ghost btn-sm"
                        [attr.aria-label]="(isInactive(r.course) ? 'Activar ' : 'Desactivar ') + r.course.name"
                        (click)="toggleActive(r.course)"
                      >
                        {{ isInactive(r.course) ? 'Activar' : 'Desactivar' }}
                      </button>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        @if (creating() || selected()) {
          <div class="detail">
            <form class="card stack" [formGroup]="form" (ngSubmit)="save()" novalidate aria-labelledby="course-form-title">
              <h2 id="course-form-title">{{ creating() ? 'Nuevo curso' : 'Editar curso' }}</h2>

              <div class="field">
                <label for="c-name">Nombre</label>
                <input id="c-name" class="input" formControlName="name" [class.is-invalid]="bad('name')" />
                @if (bad('name')) { <span class="error-text">Ingresa el nombre del curso.</span> }
              </div>

              <div class="field">
                <label for="c-desc">Descripción</label>
                <textarea id="c-desc" class="input" rows="3" formControlName="description" [class.is-invalid]="bad('description')"></textarea>
                @if (bad('description')) { <span class="error-text">Ingresa una descripción.</span> }
              </div>

              <div class="field">
                <label for="c-level">Nivel del curso</label>
                <select id="c-level" class="input" formControlName="level" aria-describedby="c-level-help">
                  <option value="">Pendiente de clasificación</option>
                  @for (l of levels; track l.value) { <option [value]="l.value">{{ l.label }}</option> }
                </select>
                <span id="c-level-help" class="small muted">Niveles oficiales: Persona autorizada, Persona competente y Persona certificada.</span>
              </div>

              <div class="field">
                <label for="c-hours">Horas de formación (opcional)</label>
                <input id="c-hours" class="input" type="number" min="1" step="1" formControlName="trainingHours"
                  [class.is-invalid]="bad('trainingHours')" aria-describedby="c-hours-help" />
                <span id="c-hours-help" class="small muted">Si no se definen, el certificado mostrará «Por definir».</span>
                @if (bad('trainingHours')) { <span class="error-text">Ingresa un número entero de horas (mínimo 1) o deja el campo vacío.</span> }
              </div>

              <fieldset class="field cover-field">
                <legend>Portada</legend>
                <label class="check"><input type="radio" formControlName="coverMode" value="none" /> Sin portada (se usa la portada de respaldo)</label>
                <label class="check"><input type="radio" formControlName="coverMode" value="demo" /> Portada de demostración</label>
                @if (form.controls.coverMode.value === 'demo') {
                  <label for="c-demo-cover" class="sr-only">Portada de demostración</label>
                  <select id="c-demo-cover" class="input" formControlName="demoCover">
                    @for (c of demoCovers; track c.path) { <option [value]="c.path">{{ c.label }}</option> }
                  </select>
                }
                <label class="check" [class.is-disabled]="!canUpload">
                  <input type="radio" formControlName="coverMode" value="upload" [attr.disabled]="canUpload ? null : true" />
                  Portada personalizada: imagen desde el equipo
                </label>
                @if (form.controls.coverMode.value === 'upload') {
                  <div class="upload stack">
                    <input #coverFile id="c-cover-file" class="sr-only" type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                      aria-describedby="c-cover-file-help" tabindex="-1" (change)="pickFile(coverFile)" />
                    <div class="row upload-actions">
                      <button type="button" class="btn btn-secondary btn-sm" [disabled]="saving()" (click)="coverFile.click()">
                        <app-icon name="upload" size="sm" /> {{ hasCustomImage() ? 'Reemplazar imagen' : 'Seleccionar imagen' }}
                      </button>
                      @if (hasCustomImage()) {
                        <button type="button" class="btn btn-ghost btn-sm" [disabled]="saving()" (click)="removeImage(coverFile)">Quitar imagen</button>
                      }
                    </div>
                    @if (pendingFile(); as f) {
                      <span class="small" data-test="pending-file">Imagen seleccionada: {{ f.name }} ({{ sizeLabel(f.size) }}). Se subirá al guardar.</span>
                    } @else if (currentUpload()) {
                      <span class="small muted">Imagen guardada en el servidor.</span>
                    }
                    <span id="c-cover-file-help" class="small muted">JPG, PNG o WebP de hasta 2 MB. Proporción recomendada 16:9.</span>
                    @if (fileError()) { <span class="error-text" role="alert">{{ fileError() }}</span> }
                    @if (uploading()) { <span class="small muted" role="status">Subiendo la imagen…</span> }
                  </div>
                }
                <label class="check"><input type="radio" formControlName="coverMode" value="url" /> Portada personalizada: dirección https de una imagen</label>
                @if (form.controls.coverMode.value === 'url') {
                  <label for="c-cover-url" class="sr-only">Dirección https de la portada</label>
                  <input id="c-cover-url" class="input" type="url" formControlName="coverUrl" placeholder="https://…"
                    [class.is-invalid]="badCoverUrl()" />
                  @if (badCoverUrl()) {
                    <span class="error-text">
                      {{ coverUrlTooLong() ? 'La dirección no puede superar los 500 caracteres. Sube la imagen desde el equipo.' : 'Ingresa una dirección que empiece con https://' }}
                    </span>
                  }
                }
                <div class="preview">
                  <app-course-cover [image]="coverPreview()" alt="Vista previa de la portada" />
                </div>
                <span class="small muted">
                  Las portadas de demostración no son imágenes oficiales de IMC.
                  @if (!canUpload) { La subida de imágenes está disponible al trabajar con el servidor; en la demostración no se guardan archivos. }
                </span>
              </fieldset>

              <div class="row">
                <button type="submit" class="btn btn-primary" [class.is-loading]="saving()" [disabled]="saving()">
                  {{ creating() ? 'Crear curso' : 'Guardar cambios' }}
                </button>
                <button type="button" class="btn btn-ghost" (click)="cancel()">Cancelar</button>
              </div>
              <p class="small muted">Demostración: los cambios se guardan solo en este navegador.</p>
            </form>

            @if (!creating() && selected(); as r) {
              <section class="card stack" aria-labelledby="pub-title">
                <h2 id="pub-title">Publicación</h2>
                <p>
                  Estado:
                  <span class="badge" [class]="r.course.status === 'publicado' ? 'badge--success' : 'badge--warning'">
                    {{ r.course.status === 'publicado' ? 'Publicado' : 'Borrador' }}
                  </span>
                </p>

                <div>
                  <h3>Requisitos obligatorios</h3>
                  @if (r.check.blocking.length === 0) {
                    <p class="alert alert-success small">Cumple los requisitos obligatorios.</p>
                  } @else {
                    <ul class="reqs" aria-label="Requisitos que impiden publicar">
                      @for (b of r.check.blocking; track b) { <li><span aria-hidden="true">✗</span> {{ b }}</li> }
                    </ul>
                  }
                </div>

                @if (r.check.warnings.length) {
                  <div>
                    <h3>Advertencias</h3>
                    <ul class="warns" aria-label="Advertencias">
                      @for (w of r.check.warnings; track w) { <li>{{ w }}</li> }
                    </ul>
                  </div>
                }

                @if (r.course.status === 'borrador') {
                  @if (form.dirty) {
                    <p class="small muted">Guarda o cancela los cambios del formulario antes de publicar.</p>
                  }
                  <div>
                    <button type="button" class="btn btn-primary" [class.is-loading]="publishing()"
                      [disabled]="!r.check.canPublish || publishing() || form.dirty" (click)="publish()">
                      Publicar curso
                    </button>
                  </div>
                } @else {
                  @if (confirmUnpublish()) {
                    <p class="alert alert-warning small">
                      Los participantes asignados no podrán rendir el examen ni obtener el certificado mientras el curso
                      esté en borrador. ¿Confirmas?
                    </p>
                    <div class="row">
                      <button type="button" class="btn btn-danger" [disabled]="publishing()" (click)="unpublish()">Pasar a borrador</button>
                      <button type="button" class="btn btn-ghost" (click)="confirmUnpublish.set(false)">Cancelar</button>
                    </div>
                  } @else {
                    <div><button type="button" class="btn btn-secondary" (click)="confirmUnpublish.set(true)">Pasar a borrador</button></div>
                  }
                }
                <p class="small muted">Los videos y el examen de cada curso se gestionan en sus secciones.</p>
              </section>
            }
          </div>
          <!-- M2: módulos y videos del curso en edición (el curso nuevo tiene su primer módulo al crearse). -->
          @if (!creating() && selected(); as r) {
            <app-admin-course-content [courseId]="r.course.id" />
            <!-- Clases en vivo (20/11/2026): sección propia del curso, no es un módulo de videos grabados. -->
            <app-admin-live-sessions [courseId]="r.course.id" />
          }
        }
      }
    </div>
  `,
  styles: [
    `
      .between { align-items: flex-start; }
      .level-filter { max-width: 280px; margin-bottom: 0; }
      .level-line { display: block; margin-top: 0.25rem; }
      .level-line app-level-badge .badge { margin-left: 0; }
      .thumb { width: 104px; }
      .thumb app-course-cover { display: block; width: 88px; border-radius: var(--radius-sm); overflow: hidden; }
      td .badge { margin-left: 0.35rem; }
      td:nth-child(3) .badge { margin-left: 0; }
      tr.is-selected { background: var(--c-primary-100); }
      .ok { color: var(--c-success); font-weight: 600; }
      .pending { color: var(--c-warning); font-weight: 600; }
      .detail { display: grid; gap: 1.25rem; grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); align-items: start; }
      @media (max-width: 900px) { .detail { grid-template-columns: 1fr; } }
      fieldset.cover-field { border: 0; padding: 0; margin: 0 0 1rem; min-width: 0; }
      .cover-field legend { font-weight: 600; font-size: 0.95rem; margin-bottom: 0.35rem; }
      .check { display: flex; align-items: center; gap: 0.5rem; font-weight: 400; }
      .upload { gap: 0.4rem; margin: 0 0 0.5rem 1.6rem; }
      .upload-actions { gap: 0.5rem; flex-wrap: wrap; }
      .check.is-disabled { color: var(--c-muted); }
      .preview { max-width: 320px; border-radius: var(--radius-sm); overflow: hidden; border: 1px solid var(--c-border); }
      .reqs, .warns { margin: 0.25rem 0 0; padding-left: 1.1rem; }
      .reqs { list-style: none; padding-left: 0; color: var(--c-danger); }
      .reqs li + li, .warns li + li { margin-top: 0.3rem; }
      h3 { margin: 0; font-size: 1rem; }
      /* Tarjetas en pantallas angostas (.table-cards, global) con la miniatura a la izquierda. */
      @media (max-width: 700px) {
        .table-cards tr { display: grid; grid-template-columns: 88px minmax(0, 1fr); gap: 0.35rem 0.75rem; }
        .table-cards td { padding: 0; }
        .table-cards td.thumb { grid-row: span 5; width: auto; }
        .table-cards td:nth-child(3) .badge { margin-left: 0.25rem; }
        .table-cards td.actions { grid-column: 2; padding-top: 0; }
      }
    `,
  ],
})
export class AdminCourses {
  private readonly repo = inject(DataRepository);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly demoCovers = DEMO_COVERS;
  readonly levels = COURSE_LEVELS;
  readonly levelFilter = signal<CourseLevel | 'pendiente' | ''>('');
  readonly visibleRows = computed(() => {
    const f = this.levelFilter();
    return this.rows().filter((r) => !f || (f === 'pendiente' ? !r.course.level : r.course.level === f));
  });
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly publishing = signal(false);
  readonly message = signal('');
  readonly error = signal('');
  readonly rows = signal<CourseRow[]>([]);
  readonly selectedId = signal<string | null>(null);
  readonly creating = signal(false);
  readonly confirmUnpublish = signal(false);

  readonly selected = computed(() => this.rows().find((r) => r.course.id === this.selectedId()) ?? null);

  // ----- Portada subida desde el equipo (19/11/2026, solo modo API) -----
  /** Archivo elegido que se subirá al guardar (aún no está en el servidor). */
  readonly pendingFile = signal<File | null>(null);
  /** Vista previa local del archivo elegido (URL temporal del navegador; nunca se guarda). */
  readonly pendingPreview = signal<string | null>(null);
  /** Ruta de la imagen ya subida del curso en edición. */
  readonly currentUpload = signal<string | null>(null);
  readonly fileError = signal('');
  readonly uploading = signal(false);
  readonly hasCustomImage = computed(() => !!this.pendingFile() || !!this.currentUpload());

  readonly form = this.fb.group({
    name: ['', Validators.required],
    description: ['', Validators.required],
    trainingHours: this.fb.control<number | null>(null, optionalHours),
    level: this.fb.control<CourseLevel | ''>(''),
    coverMode: this.fb.control<CoverMode>('none'),
    demoCover: [DEMO_COVERS[0]?.path ?? ''],
    coverUrl: [''],
  });

  /** Modo API (18/11/2026): los cursos se pueden activar y desactivar (estado guardado en el servidor). */
  readonly apiMode = isApiMode(inject(APP_ENVIRONMENT));
  /** La subida necesita el servidor: en la demostración no se guardan imágenes (ni en Base64). */
  readonly canUpload = this.apiMode && typeof (this.repo as CoverUploader).uploadCourseCover === 'function';

  constructor() {
    this.refresh();
    inject(DestroyRef).onDestroy(() => this.setPending(null));
  }

  /** `active` solo existe en el modo API; en la demostración todos los cursos están activos. */
  isInactive(course: CourseRecord): boolean {
    return (course as CourseRecord & { active?: boolean }).active === false;
  }

  /** Un curso desactivado no admite matrículas nuevas ni se muestra a los estudiantes; sus datos se conservan. */
  toggleActive(course: CourseRecord): void {
    const repo = this.repo as DataRepository & { setCourseActive?: (id: string, active: boolean) => Observable<CourseRecord> };
    if (!repo.setCourseActive) return;
    const active = this.isInactive(course);
    this.message.set('');
    this.error.set('');
    repo.setCourseActive(course.id, active).subscribe({
      next: () => {
        this.message.set(active ? `Curso «${course.name}» activado.` : `Curso «${course.name}» desactivado: los estudiantes ya no lo verán y no admite nuevas asignaciones.`);
        this.refresh();
      },
      error: (e: unknown) => this.error.set(errMsg(e)),
    });
  }

  /** Recarga la lista con los requisitos de publicación de cada curso. */
  refresh(selectId: string | null = this.selectedId()): void {
    this.repo
      .getCourses()
      .pipe(
        switchMap((courses) =>
          courses.length
            ? forkJoin(
                courses.map((course) =>
                  forkJoin({
                    check: this.repo.getPublicationCheck(course.id),
                    content: this.repo.getCourseContent(course.id),
                  }).pipe(
                    map(({ check, content }): CourseRow => {
                      const videos = content.modules.flatMap((m) => m.videos);
                      return { course, check, totalVideos: videos.length, publishedVideos: videos.filter((v) => v.published).length };
                    }),
                  ),
                ),
              )
            : of<CourseRow[]>([]),
        ),
      )
      .subscribe({
        next: (rows) => {
          this.rows.set(rows);
          this.selectedId.set(rows.some((r) => r.course.id === selectId) ? selectId : null);
          this.loading.set(false);
        },
        error: (e) => {
          this.error.set(errMsg(e));
          this.loading.set(false);
        },
      });
  }

  startCreate(): void {
    this.clearMessages();
    this.creating.set(true);
    this.selectedId.set(null);
    this.form.reset({ name: '', description: '', trainingHours: null, level: '', coverMode: 'none', demoCover: DEMO_COVERS[0]?.path ?? '', coverUrl: '' });
    this.resetUpload(null);
  }

  edit(row: CourseRow): void {
    this.clearMessages();
    this.creating.set(false);
    this.confirmUnpublish.set(false);
    this.selectedId.set(row.course.id);
    const cover = row.course.coverImage;
    const isDemo = !!cover && DEMO_COVERS.some((c) => c.path === cover);
    const isUploaded = !!cover && cover.startsWith(UPLOADED_COVER_PREFIX);
    this.form.reset({
      name: row.course.name,
      description: row.course.description,
      trainingHours: row.course.trainingHours,
      level: row.course.level ?? '',
      coverMode: !cover ? 'none' : isDemo ? 'demo' : isUploaded ? 'upload' : 'url',
      demoCover: isDemo ? cover : (DEMO_COVERS[0]?.path ?? ''),
      coverUrl: cover && !isDemo && !isUploaded ? cover : '',
    });
    this.resetUpload(isUploaded ? cover : null);
  }

  /** Cancelar no cambia nada en el servidor: la portada guardada se conserva. */
  cancel(): void {
    this.creating.set(false);
    this.selectedId.set(null);
    this.form.reset();
    this.resetUpload(null);
  }

  /** Valida el archivo elegido y muestra su vista previa local. Un archivo inválido no reemplaza al anterior. */
  pickFile(input: HTMLInputElement): void {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const error = coverFileError(file);
    this.fileError.set(error);
    if (error) return;
    this.setPending(file);
    this.form.markAsDirty();
  }

  /** Quita la imagen: el curso queda sin portada al guardar (el servidor borra el archivo después de guardar). */
  removeImage(input: HTMLInputElement): void {
    input.value = '';
    this.setPending(null);
    this.currentUpload.set(null);
    this.fileError.set('');
    this.form.controls.coverMode.setValue('none');
    this.form.markAsDirty();
  }

  sizeLabel(bytes: number): string {
    return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  private setPending(file: File | null): void {
    const old = this.pendingPreview();
    if (old) URL.revokeObjectURL(old);
    this.pendingFile.set(file);
    this.pendingPreview.set(file ? URL.createObjectURL(file) : null);
  }

  private resetUpload(current: string | null): void {
    this.setPending(null);
    this.currentUpload.set(current);
    this.fileError.set('');
  }


  bad(name: 'name' | 'description' | 'trainingHours'): boolean {
    const c = this.form.controls[name];
    return c.invalid && c.touched;
  }

  badCoverUrl(): boolean {
    const c = this.form.controls.coverUrl;
    return c.touched && !this.validCoverUrl();
  }

  coverUrlTooLong(): boolean {
    return this.form.controls.coverUrl.value.trim().length > COVER_URL_MAX;
  }

  /** Portada según la opción elegida (lo que se guardará con los datos del curso). */
  coverValue(): string | null {
    const v = this.form.getRawValue();
    if (v.coverMode === 'demo') return v.demoCover || null;
    if (v.coverMode === 'url') return this.validCoverUrl() ? v.coverUrl.trim() : null;
    if (v.coverMode === 'upload') {
      // Con un archivo nuevo, la portada actual se conserva hasta que la subida termine bien (el servidor reemplaza
      // y borra la anterior). Sin archivo nuevo se conserva la imagen ya subida.
      if (this.pendingFile()) return this.creating() ? null : (this.selected()?.course.coverImage ?? null);
      return this.currentUpload();
    }
    return null;
  }

  /** Lo que muestra la vista previa: el archivo elegido (local) o la portada que se guardará. */
  coverPreview(): string | null {
    if (this.form.controls.coverMode.value === 'upload') return this.pendingPreview() ?? this.currentUpload();
    return this.coverValue();
  }

  save(): void {
    this.form.markAllAsTouched();
    const mode = this.form.controls.coverMode.value;
    if (this.form.invalid || (mode === 'url' && !this.validCoverUrl())) return;
    if (mode === 'upload' && !this.hasCustomImage()) {
      this.fileError.set('Selecciona una imagen o elige otra opción de portada.');
      return;
    }
    const v = this.form.getRawValue();
    const input: CourseInput = {
      name: v.name,
      description: v.description,
      trainingHours: v.trainingHours === null || (v.trainingHours as unknown) === '' ? null : Number(v.trainingHours),
      coverImage: this.coverValue(),
      level: v.level || null,
    };
    const file = mode === 'upload' ? this.pendingFile() : null;
    const creating = this.creating();
    this.clearMessages();
    this.saving.set(true);
    const current = this.selected();
    const request = creating
      ? this.repo.createCourse(input)
      : this.repo.updateCourseById(current!.course.id, { ...input, status: current!.course.status });
    // Primero se guarda el curso (al crear, así existe su ID) y después se sube la imagen. Si la subida falla, el
    // curso ya quedó guardado: el archivo elegido se conserva para reintentar con «Guardar cambios».
    request
      .pipe(
        switchMap((course) => (file ? this.uploadCover(course, file) : of({ course, uploadError: '' }))),
        finalize(() => this.saving.set(false)),
      )
      .subscribe({
        next: ({ course, uploadError }) => {
          const done = creating ? 'Curso creado en borrador' : 'Cambios guardados';
          this.creating.set(false);
          if (uploadError) {
            this.message.set(`${done}${DEMO_SUFFIX}.`);
            this.error.set(
              `${creating ? 'El curso se creó' : 'Los datos se guardaron'}, pero no se pudo subir la portada: ${uploadError} ` +
                'Puedes reintentarlo con «Guardar cambios».',
            );
            this.currentUpload.set(course.coverImage?.startsWith(UPLOADED_COVER_PREFIX) ? course.coverImage : null);
          } else {
            this.message.set(`${done}${file ? ' con su portada' : ''}${DEMO_SUFFIX}.`);
            if (file) this.resetUpload(course.coverImage);
            else if (mode !== 'upload') this.resetUpload(null);
            this.form.markAsPristine();
          }
          this.refresh(course.id);
        },
        error: (e) => this.error.set(errMsg(e)),
      });
  }

  /** Sube la imagen del curso ya guardado; el error de subida no se propaga (el curso no se pierde). */
  private uploadCover(course: CourseRecord, file: File): Observable<{ course: CourseRecord; uploadError: string }> {
    const repo = this.repo as CoverUploader;
    if (!repo.uploadCourseCover) return of({ course, uploadError: 'La subida de imágenes no está disponible en la demostración.' });
    this.uploading.set(true);
    return repo.uploadCourseCover(course.id, file).pipe(
      map((updated) => ({ course: updated, uploadError: '' })),
      catchError((e: unknown) => of({ course, uploadError: errMsg(e) })),
      finalize(() => this.uploading.set(false)),
    );
  }

  /** Publica con los datos guardados. El repositorio vuelve a validar los requisitos. */
  publish(): void {
    const r = this.selected();
    if (!r) return;
    this.clearMessages();
    if (!r.check.canPublish) {
      this.error.set('El curso no cumple los requisitos obligatorios para publicarse.');
      return;
    }
    this.setStatus(r.course, 'publicado', 'Curso publicado' + DEMO_SUFFIX + '.');
  }

  unpublish(): void {
    const r = this.selected();
    if (!r) return;
    this.clearMessages();
    this.setStatus(r.course, 'borrador', 'El curso pasó a borrador' + DEMO_SUFFIX + '.');
  }

  private setStatus(course: CourseRecord, status: CourseRecord['status'], done: string): void {
    this.publishing.set(true);
    const { name, description, trainingHours, coverImage } = course;
    this.repo.updateCourseById(course.id, { name, description, trainingHours, coverImage, status }).subscribe({
      next: () => {
        this.publishing.set(false);
        this.confirmUnpublish.set(false);
        this.message.set(done);
        this.refresh(course.id);
      },
      error: (e) => {
        this.publishing.set(false);
        this.error.set(errMsg(e));
        this.refresh(course.id);
      },
    });
  }

  private validCoverUrl(): boolean {
    const url = this.form.controls.coverUrl.value.trim();
    return url.length <= COVER_URL_MAX && /^https:\/\/\S+$/i.test(url);
  }

  private clearMessages(): void {
    this.message.set('');
    this.error.set('');
  }
}
