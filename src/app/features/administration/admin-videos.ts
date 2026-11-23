import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { DEMO_SUFFIX } from '../../core/config/app-environment';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Observable } from 'rxjs';
import { DataRepository } from '../../core/services/data-repository';
import { DEMO_CONFIG } from '../../core/config/demo.config';
import { APP_ENVIRONMENT, isApiMode } from '../../core/config/app-environment';
import {
  CourseContent,
  CourseRecord,
  MIN_VIDEOS,
  VideoRecord,
  VideoSource,
  VIDEO_SOURCE_REQUIRED,
  VideoSourceChoice,
} from '../../core/models/course.model';
import { formatDuration, parseDuration } from '../../core/utils/duration';
import { parseYouTubeId, youTubeWatchUrl } from '../../core/utils/youtube';
import { driveViewUrl, parseDriveFileId } from '../../core/utils/drive';
import { VideoPlayer } from '../../shared/components/video-player';
import { Icon } from '../../shared/components/icon';
import { VideoDurationPipe } from '../../shared/pipes/video-duration.pipe';
import { AdminCourseSelect } from './admin-course-select';
import { errMsg } from './admin-utils';

function durationValidator(control: AbstractControl): ValidationErrors | null {
  return parseDuration(control.value) === null ? { duration: true } : null;
}

/** Enlace guardado tal como se mostró al administrador (si no cambia, el repositorio conserva la fuente). */
function sourceLink(source: VideoSource): string {
  if (source.kind === 'youtube') return youTubeWatchUrl(source.videoId);
  if (source.kind === 'drive') return driveViewUrl(source.fileId);
  return source.kind === 'url' ? source.url : '';
}

/** Fuente que se muestra seleccionada al editar un video guardado. */
/** Un video existente sin fuente (anterior al 21/11/2026) se muestra con YouTube elegido y el enlace vacío. */
function sourceChoice(source: VideoSource): VideoSourceChoice {
  return source.kind === 'placeholder' ? 'youtube' : source.kind;
}

const SOURCE_HELP: Record<VideoSourceChoice, string> = {
  youtube: 'Pega el enlace del video de YouTube (youtube.com/watch?v=…, youtu.be/…).',
  drive:
    'Pega el enlace para compartir del archivo (drive.google.com/file/d/…). En Drive, compártelo como «Cualquier persona con el enlace» con permiso de lector; si no, los participantes no podrán verlo. La plataforma no puede comprobar ese permiso.',
  url: 'Otro enlace https: no se integra en el aula, se ofrece abrirlo en otra pestaña.',
};

@Component({
  selector: 'app-admin-videos',
  imports: [ReactiveFormsModule, AdminCourseSelect, VideoPlayer, VideoDurationPipe, Icon],
  template: `
    <div class="stack">
      <header class="row between page-head">
        <div>
          <h1>Videos</h1>
          <p class="muted">Gestiona los videos de cada curso. Solo los videos publicados se muestran a los participantes.</p>
        </div>
        <button type="button" class="btn btn-primary" (click)="openNew()" [disabled]="!course()">
          <app-icon name="plus" size="sm" /> Agregar video
        </button>
      </header>

      @if (courses().length) {
        <app-admin-course-select [courses]="courses()" [selected]="courseId()" (selectedChange)="selectCourse($event)" />
      }
      @if (unknownCourse()) {
        <p class="alert alert-warning small" role="status">No se encontró el curso indicado; se muestra «{{ course()?.name }}».</p>
      }

      @if (course(); as c) {
        <p class="alert small" [class]="c.status === 'publicado' ? 'alert-warning' : 'alert-info'">
          {{ videos().length }} {{ videos().length === 1 ? 'video' : 'videos' }} en {{ modules().length }}
          {{ modules().length === 1 ? 'módulo' : 'módulos' }}. No hay máximo de videos.
          @if (c.status === 'publicado') {
            Este curso está publicado: debe mantener al menos 1 video publicado (RN-03). Los cambios que no cumplan se
            rechazan. Los videos pueden tener cualquier duración.
          } @else {
            Curso en borrador: para publicarlo, cada módulo necesita al menos 1 video publicado (RN-03). Tú decides
            cuántos videos agregar a cada módulo. Los videos pueden tener cualquier duración.
          }
        </p>
      }

      @if (message()) { <p class="alert alert-success" role="status">{{ message() }}</p> }
      @if (error()) { <p class="alert alert-danger" role="alert">No se pudo completar la operación: {{ error() }}</p> }

      @if (showForm()) {
        <form class="card stack" [formGroup]="form" (ngSubmit)="save()" novalidate aria-labelledby="video-form-title">
          <h2 id="video-form-title">{{ editingId() ? 'Editar video' : 'Nuevo video' }}</h2>
          <div class="field">
            <label for="v-title">Título</label>
            <input id="v-title" class="input" formControlName="title" [class.is-invalid]="bad('title')" />
            @if (bad('title')) { <span class="error-text">Ingresa el título del video.</span> }
          </div>
          <div class="field">
            <label for="v-desc">Descripción (opcional)</label>
            <textarea id="v-desc" class="input" rows="2" formControlName="description"></textarea>
          </div>
          <div class="grid grid-2">
            <div class="field">
              <label for="v-dur">Duración real (mm:ss o h:mm:ss)</label>
              <input id="v-dur" class="input" inputmode="numeric" placeholder="45:00 o 1:30:00" formControlName="duration"
                [class.is-invalid]="bad('duration')" aria-describedby="v-dur-help" />
              <span id="v-dur-help" class="small muted">Sin límite de duración. Por ejemplo 8:33, 45:00 o 1:30:00.</span>
              @if (bad('duration')) { <span class="error-text">Ingresa una duración válida mayor que 0 en formato mm:ss o h:mm:ss (por ejemplo, 8:33 o 1:30:00).</span> }
            </div>
          </div>
          <fieldset class="field source">
            <legend>Fuente del video</legend>
            <div class="row source__opts">
              @for (o of sourceOptions; track o.value) {
                <label class="check"><input type="radio" formControlName="sourceKind" [value]="o.value" (click)="sourceChosen = true" (change)="sourceChosen = true" /> {{ o.label }}</label>
              }
            </div>
            <label for="v-url">{{ urlLabel() }}</label>
            <input id="v-url" class="input" type="url" formControlName="url" [placeholder]="urlPlaceholder()"
              [class.is-invalid]="showUrlError()" [attr.aria-invalid]="showUrlError()"
              [attr.aria-describedby]="showUrlError() ? 'v-url-error v-url-help' : 'v-url-help'" />
            @if (showUrlError()) { <span id="v-url-error" class="error-text">{{ urlError() }}</span> }
            @if (editingPlaceholder()) {
              <span class="small" data-test="no-source-note">Este video no tiene fuente de reproducción. Agrégale un enlace; si lo dejas vacío, se conserva como está.</span>
            }
            <span id="v-url-help" class="small muted">{{ sourceHelp() }}</span>
          </fieldset>
          <div class="field">
            <label for="v-module">Módulo</label>
            <select id="v-module" class="input" formControlName="moduleId" aria-describedby="v-module-help">
              @for (m of modules(); track m.id; let i = $index) { <option [value]="m.id">Módulo {{ i + 1 }}: {{ m.title }}</option> }
            </select>
            @if (selectedModuleStats(); as st) {
              <span class="small" data-test="module-count">
                Este módulo tiene {{ st.total }} {{ st.total === 1 ? 'video' : 'videos' }} ({{ st.published }} {{ st.published === 1 ? 'publicado' : 'publicados' }}; para publicar el curso basta con 1).
              </span>
            }
            <span id="v-module-help" class="small muted">Los módulos se crean y ordenan en Cursos › Editar curso › Contenido del curso.</span>
          </div>
          <label class="check"><input type="checkbox" formControlName="published" /> Publicar este video</label>

          @if (preview(); as p) {
            <div class="preview">
              <p class="small muted">Vista previa</p>
              <app-video-player [video]="p" />
            </div>
          } @else if (form.controls.url.value.trim() && formValue().sourceKind === 'url') {
            <p class="small muted">La vista previa solo está disponible para enlaces de YouTube y de Google Drive.</p>
          }

          <div class="field">
            <label for="v-material">Material complementario (opcional)</label>
            <input id="v-material" class="input" type="url" formControlName="materialUrl" placeholder="https://…" aria-describedby="v-material-help"
              [class.is-invalid]="materialError()" />
            <span id="v-material-help" class="small muted">Enlace https a una guía, lectura o archivo de apoyo. El estudiante lo verá junto al video.</span>
            @if (materialError()) { <span class="error-text">Ingresa un enlace que empiece con https://</span> }
          </div>

          <div class="row">
            <button type="submit" class="btn btn-primary" [class.is-loading]="saving()" [disabled]="saving()">Guardar</button>
            <button type="button" class="btn btn-secondary" (click)="closeForm()">Cancelar</button>
          </div>
          <p class="small muted">{{ apiMode ? 'Los videos se reproducen desde su enlace (YouTube, Google Drive o un almacenamiento https): la base de datos solo guarda la referencia.' : 'No se suben archivos: el almacenamiento de videos se definirá con el backend.' }}</p>
        </form>
      }

      @if (loading()) {
        <p class="card muted" role="status">Cargando…</p>
      } @else if (course()) {
        @if (videos().length === 0) {
          <p class="card muted">Este curso aún no tiene videos.</p>
        } @else {
          <div class="table-wrap table-cards">
            <table>
              <caption class="sr-only">Videos de {{ course()?.name }}</caption>
              <thead>
                <tr>
                  <th scope="col">Orden</th><th scope="col">Título</th><th scope="col">Módulo</th><th scope="col">Enlace</th>
                  <th scope="col">Duración</th><th scope="col">Estado</th><th scope="col"><span class="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                @for (v of videos(); track v.id; let i = $index) {
                  <tr [attr.data-video]="v.id">
                    <td data-label="Orden">{{ v.order }}</td>
                    <td data-label="Título"><strong>{{ v.title }}</strong></td>
                    <td data-label="Módulo">{{ moduleLabel(v) }}</td>
                    <td data-label="Enlace" class="link">
                      @switch (v.source.kind) {
                        @case ('youtube') { <span class="badge badge--info">YouTube</span> <span class="small">{{ v.source.videoId }}</span> }
                        @case ('drive') { <span class="badge badge--info">Google Drive</span> }
                        @case ('url') { <span class="badge badge--neutral">Enlace externo</span> }
                        @default { <span class="muted small">Sin fuente</span> }
                      }
                    </td>
                    <td data-label="Duración">
                      {{ v.durationSec | videoDuration }}
                    </td>
                    <td data-label="Estado">
                      <span class="badge" [class]="v.published ? 'badge--success' : 'badge--neutral'">
                        {{ v.published ? 'Publicado' : 'No publicado' }}
                      </span>
                    </td>
                    <td class="actions">
                      <div class="row act">
                        <button type="button" class="btn btn-ghost btn-sm btn-icon" [disabled]="!canMove(i, -1) || saving()" (click)="move(v, -1)" [attr.aria-label]="'Subir ' + v.title"><app-icon name="arrow-up" /></button>
                        <button type="button" class="btn btn-ghost btn-sm btn-icon" [disabled]="!canMove(i, 1) || saving()" (click)="move(v, 1)" [attr.aria-label]="'Bajar ' + v.title"><app-icon name="arrow-down" /></button>
                        <button type="button" class="btn btn-ghost btn-sm" [disabled]="saving()" (click)="togglePublished(v)">{{ v.published ? 'Despublicar' : 'Publicar' }}</button>
                        <button type="button" class="btn btn-ghost btn-sm" (click)="openEdit(v)" [attr.aria-label]="'Editar ' + v.title">Editar</button>
                        @if (confirmDeleteId() === v.id) {
                          <button type="button" class="btn btn-danger btn-sm" (click)="remove(v)">Confirmar</button>
                          <button type="button" class="btn btn-ghost btn-sm" (click)="confirmDeleteId.set(null)">No</button>
                        } @else {
                          <button type="button" class="btn btn-ghost btn-sm is-danger" (click)="confirmDeleteId.set(v.id)" [attr.aria-label]="'Eliminar ' + v.title">Eliminar</button>
                        }
                      </div>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      }
      <p class="small muted">Demostración: los cambios se guardan solo en este navegador, no en un servidor.</p>
    </div>
  `,
  styles: [
    `
      .between { align-items: flex-start; }
      .act { flex-wrap: wrap; gap: 0.15rem; }
      .check { display: flex; align-items: center; gap: 0.5rem; font-weight: 600; }
      fieldset.source { border: 0; padding: 0; margin: 0; min-width: 0; display: grid; gap: 0.35rem; }
      .source legend { font-weight: 600; font-size: 0.95rem; margin-bottom: 0.35rem; padding: 0; }
      .source__opts { flex-wrap: wrap; gap: 0.35rem 1.25rem; }
      .source__opts .check { font-weight: 400; min-height: 32px; }
      .preview { max-width: 560px; }
      .preview p { margin: 0 0 0.35rem; }
      td .badge + .small { margin-left: 0.3rem; }
      td:nth-child(5) .badge { margin-left: 0.35rem; }
    `,
  ],
})
export class AdminVideos {
  private readonly repo = inject(DataRepository);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly router = inject(Router);

  /** Parámetro ?curso= (curso seleccionado). */
  readonly curso = input<string>();
  /** M2: ?modulo=<id>&nuevo=1 abre el formulario de un video nuevo en ese módulo («Contenido del curso»). */
  readonly modulo = input<string>();
  readonly nuevo = input<string>();

  readonly min = MIN_VIDEOS;

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly message = signal('');
  readonly error = signal('');
  readonly showForm = signal(false);
  readonly editingId = signal<string | null>(null);
  readonly confirmDeleteId = signal<string | null>(null);
  readonly courses = signal<CourseRecord[]>([]);
  readonly content = signal<CourseContent | null>(null);

  /** Curso pedido en la URL; si no existe, el curso principal o el primero. */
  readonly courseId = computed(() => {
    const list = this.courses();
    const wanted = this.curso();
    return (
      list.find((c) => c.id === wanted)?.id ??
      list.find((c) => c.id === DEMO_CONFIG.legacyCourseId)?.id ??
      list[0]?.id ??
      null
    );
  });
  readonly unknownCourse = computed(() => !!this.curso() && this.courses().length > 0 && this.curso() !== this.courseId());
  readonly course = computed(() => {
    const c = this.content()?.course;
    return c && c.id === this.courseId() ? c : null;
  });
  readonly videos = computed<VideoRecord[]>(() => (this.course() ? this.content()!.modules.flatMap((m) => m.videos) : []));
  readonly modules = computed(() => (this.course() ? this.content()!.modules : []));
  /** RN-03 por módulo (19/11/2026): conteo del módulo elegido en el formulario, no del curso. */
  readonly selectedModuleStats = computed(() => {
    const m = this.modules().find((x) => x.id === this.formValue().moduleId);
    return m ? { total: m.videos.length, published: m.videos.filter((v) => v.published).length } : null;
  });

  readonly form = this.fb.group({
    title: ['', Validators.required],
    description: [''],
    duration: ['', durationValidator],
    url: [''],
    sourceKind: this.fb.control<VideoSourceChoice>('youtube'),
    moduleId: [''],
    published: [true],
    /** Material complementario (enlace https, opcional). */
    materialUrl: ['', Validators.pattern(/^\s*(https:\/\/\S+)?\s*$/i)],
  });

  readonly apiMode = isApiMode(inject(APP_ENVIRONMENT));

  materialError(): boolean {
    const c = this.form.controls.materialUrl;
    return c.invalid && c.touched;
  }

  /** Valores del formulario como señal, para la vista previa y los avisos. */
  private readonly formValue = signal(this.form.getRawValue());

  readonly sourceOptions: { value: VideoSourceChoice; label: string }[] = [
    { value: 'youtube', label: 'YouTube' },
    { value: 'drive', label: 'Google Drive' },
    { value: 'url', label: 'Otro enlace https' },
  ];
  readonly sourceHelp = computed(() => SOURCE_HELP[this.formValue().sourceKind]);
  readonly urlLabel = computed(
    () => ({ youtube: 'Enlace de YouTube', drive: 'Enlace compartido de Google Drive', url: 'Enlace https' })[this.formValue().sourceKind],
  );
  readonly urlPlaceholder = computed(
    () =>
      ({ youtube: 'https://www.youtube.com/watch?v=…', drive: 'https://drive.google.com/file/d/…/view', url: 'https://…' })[
        this.formValue().sourceKind
      ],
  );
  /**
   * M4: orientación inmediata si el enlace no corresponde a la fuente elegida. No bloquea el envío: como en el resto
   * de la administración, el repositorio valida y su rechazo se muestra. 21/11/2026: el enlace es obligatorio, salvo al
   * editar un video existente que ya no tenía fuente (se conserva tal cual si se deja vacío).
   */
  readonly editingPlaceholder = signal(false);
  readonly urlError = computed(() => {
    const { sourceKind, url } = this.formValue();
    const link = url.trim();
    if (!link) return this.editingPlaceholder() ? '' : VIDEO_SOURCE_REQUIRED;
    if (sourceKind === 'youtube' && !parseYouTubeId(link)) {
      return 'No es un enlace de video de YouTube válido (por ejemplo, https://www.youtube.com/watch?v=…).';
    }
    if (sourceKind === 'drive' && !parseDriveFileId(link)) {
      return 'No es un enlace de archivo de Google Drive válido. Usa «Compartir › Copiar enlace» del video (drive.google.com/file/d/…).';
    }
    if (sourceKind === 'url' && !/^https:\/\/\S+$/i.test(link)) return 'Ingresa un enlace que empiece con https://';
    if (sourceKind === 'url' && (parseYouTubeId(link) || parseDriveFileId(link))) {
      return 'Es un enlace de YouTube o de Google Drive: elige esa fuente.';
    }
    return '';
  });
  readonly urlTouched = signal(false);
  readonly showUrlError = computed(() => this.urlTouched() && !!this.urlError());
  /** Mientras el administrador no elija una fuente, la selección sigue al enlace pegado (YouTube, Drive u otro). */
  sourceChosen = false;

  /** Vista previa para YouTube y Google Drive, que son las fuentes que admite el reproductor integrado. */
  readonly preview = computed<VideoRecord | null>(() => {
    const v = this.formValue();
    const videoId = v.sourceKind === 'youtube' ? parseYouTubeId(v.url) : null;
    const fileId = v.sourceKind === 'drive' ? parseDriveFileId(v.url) : null;
    if (!videoId && !fileId) return null;
    return {
      id: 'vista-previa',
      courseId: this.courseId() ?? '',
      moduleId: '',
      order: 0,
      title: v.title || 'Vista previa',
      durationSec: parseDuration(v.duration) ?? 0,
      published: v.published,
      source: videoId ? { kind: 'youtube', videoId } : { kind: 'drive', fileId: fileId! },
    };
  });

  constructor() {
    this.form.valueChanges.subscribe(() => this.formValue.set(this.form.getRawValue()));
    this.form.controls.url.valueChanges.subscribe((url) => {
      this.urlTouched.set(true);
      const link = url.trim();
      if (this.sourceChosen || !link) return;
      const detected: VideoSourceChoice = parseYouTubeId(link) ? 'youtube' : parseDriveFileId(link) ? 'drive' : 'url';
      if (detected !== this.form.controls.sourceKind.value) this.form.controls.sourceKind.setValue(detected);
    });
    this.repo.getCourses().subscribe({
      next: (list) => this.courses.set(list),
      error: (e) => {
        this.error.set(errMsg(e));
        this.loading.set(false);
      },
    });
    effect(() => {
      const id = this.courseId();
      if (id) untracked(() => this.load(id));
    });
  }

  private load(courseId: string): void {
    this.loading.set(true);
    this.repo.getCourseContent(courseId).subscribe({
      next: (content) => {
        if (content.course.id !== this.courseId()) return; // respuesta de un curso anterior
        this.content.set(content);
        this.loading.set(false);
        this.openFromQuery();
      },
      error: (e) => {
        this.error.set(errMsg(e));
        this.loading.set(false);
      },
    });
  }

  selectCourse(courseId: string): void {
    this.closeForm();
    this.confirmDeleteId.set(null);
    this.clearMessages();
    this.router.navigate([], { queryParams: { curso: courseId }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  /** Abre una sola vez el formulario pedido con ?nuevo=1, en el módulo de ?modulo= si es de este curso. */
  private openedFromQuery = false;
  private openFromQuery(): void {
    if (this.openedFromQuery || this.nuevo() !== '1') return;
    this.openedFromQuery = true;
    this.openNew();
    const wanted = this.modules().find((m) => m.id === this.modulo());
    if (wanted) this.form.controls.moduleId.setValue(wanted.id);
  }

  moduleLabel(v: VideoRecord): string {
    const i = this.modules().findIndex((m) => m.id === v.moduleId);
    return i < 0 ? '—' : `${i + 1}. ${this.modules()[i].title}`;
  }

  /** El orden se cambia dentro del módulo; para pasar a otro módulo se usa el campo «Módulo». */
  canMove(i: number, delta: -1 | 1): boolean {
    const list = this.videos();
    return !!list[i + delta] && list[i + delta].moduleId === list[i].moduleId;
  }

  bad(name: 'title' | 'duration'): boolean {
    const c = this.form.controls[name];
    return c.invalid && c.touched;
  }

  openNew(): void {
    this.editingId.set(null);
    this.form.reset({ title: '', description: '', duration: '', url: '', sourceKind: 'youtube', moduleId: this.modules()[0]?.id ?? '', published: true, materialUrl: '' });
    this.urlTouched.set(false);
    this.sourceChosen = false;
    this.editingPlaceholder.set(false);
    this.showForm.set(true);
    this.clearMessages();
  }

  openEdit(v: VideoRecord): void {
    this.editingId.set(v.id);
    this.form.reset({
      title: v.title,
      description: v.description ?? '',
      duration: formatDuration(v.durationSec),
      url: sourceLink(v.source),
      sourceKind: sourceChoice(v.source),
      moduleId: v.moduleId,
      published: v.published,
      materialUrl: v.materialUrl ?? '',
    });
    this.urlTouched.set(false);
    this.sourceChosen = false;
    this.editingPlaceholder.set(v.source.kind === 'placeholder');
    this.showForm.set(true);
    this.clearMessages();
  }

  closeForm(): void {
    this.showForm.set(false);
    this.editingId.set(null);
  }

  save(): void {
    const courseId = this.courseId();
    this.form.markAllAsTouched();
    this.urlTouched.set(true);
    if (!courseId || this.form.invalid) return;
    const v = this.form.getRawValue();
    if (!v.url.trim() && !this.editingPlaceholder()) return; // 21/11/2026: un video nuevo necesita fuente
    const id = this.editingId();
    this.run(
      this.repo.saveCourseVideo(courseId, {
        ...(id ? { id } : {}),
        title: v.title,
        description: v.description,
        durationSec: parseDuration(v.duration)!,
        published: v.published,
        url: v.url,
        // Con enlace, el repositorio comprueba que corresponda a la fuente elegida.
        ...(v.url.trim() ? { sourceKind: v.sourceKind } : {}),
        ...(v.moduleId ? { moduleId: v.moduleId } : {}),
        materialUrl: v.materialUrl.trim(),
      }),
      id ? 'Video actualizado' + DEMO_SUFFIX + '.' : 'Video agregado' + DEMO_SUFFIX + '.',
      () => this.closeForm(),
    );
  }

  move(v: VideoRecord, delta: -1 | 1): void {
    this.run(this.repo.moveCourseVideo(v.courseId, v.id, delta), 'Orden actualizado' + DEMO_SUFFIX + '.');
  }

  togglePublished(v: VideoRecord): void {
    this.run(
      this.repo.setCourseVideoPublished(v.courseId, v.id, !v.published),
      v.published ? 'Video despublicado' + DEMO_SUFFIX + '.' : 'Video publicado' + DEMO_SUFFIX + '.',
    );
  }

  remove(v: VideoRecord): void {
    this.confirmDeleteId.set(null);
    this.run(this.repo.deleteCourseVideo(v.courseId, v.id), 'Video eliminado' + DEMO_SUFFIX + '.');
  }

  private clearMessages(): void {
    this.message.set('');
    this.error.set('');
  }

  private run(op: Observable<CourseContent>, okMessage: string, after?: () => void): void {
    this.clearMessages();
    this.saving.set(true);
    op.subscribe({
      next: (content) => {
        if (content.course.id === this.courseId()) this.content.set(content);
        this.saving.set(false);
        this.message.set(okMessage);
        after?.();
      },
      error: (e) => {
        this.saving.set(false);
        this.error.set(errMsg(e));
      },
    });
  }
}
