import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { DEMO_SUFFIX } from '../../core/config/app-environment';
import { NgTemplateOutlet } from '@angular/common';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Observable } from 'rxjs';
import { DataRepository } from '../../core/services/data-repository';
import { CourseContent, CourseModule, MIN_VIDEOS, VideoRecord } from '../../core/models/course.model';
import { Icon } from '../../shared/components/icon';
import { VideoDurationPipe } from '../../shared/pipes/video-duration.pipe';
import { errMsg } from './admin-utils';

type ContentModule = CourseContent['modules'][number];

/**
 * M2 · «Contenido del curso» (Editar curso): módulos en acordeón y los videos de cada módulo.
 * Solo organiza: no crea ni borra videos y no cambia su publicación, así que RN-03 (5 a 7 videos publicados
 * por curso, repartidos libremente entre los módulos) no se ve afectada.
 */
@Component({
  selector: 'app-admin-course-content',
  imports: [ReactiveFormsModule, RouterLink, NgTemplateOutlet, Icon, VideoDurationPipe],
  template: `
    <section class="card stack" aria-labelledby="content-title">
      <div class="row between head">
        <div>
          <h2 id="content-title">Contenido del curso</h2>
          <p class="small muted">
            Organiza los videos en módulos. Para publicar el curso, cada módulo necesita al menos 1 video publicado (RN-03);
            tú decides cuántos agregar. No hay máximo de videos. El curso tiene {{ totalCount() }}
            {{ totalCount() === 1 ? 'video' : 'videos' }} ({{ publishedCount() }} publicados).
          </p>
        </div>
        <button type="button" class="btn btn-secondary btn-sm" [disabled]="busy() || creating()" (click)="startCreate()">
          <app-icon name="plus" size="sm" /> Agregar módulo
        </button>
      </div>

      @if (message()) { <p class="alert alert-success small" role="status">{{ message() }}</p> }
      @if (error()) { <p class="alert alert-danger small" role="alert">No se pudo completar la operación: {{ error() }}</p> }

      @if (creating()) {
        <ng-container *ngTemplateOutlet="moduleForm; context: { $implicit: null }" />
      }

      @if (loading()) {
        <p class="muted small" role="status">Cargando contenido…</p>
      } @else {
        <ol class="modules" role="list" aria-label="Módulos del curso">
          @for (m of modules(); track m.id; let i = $index; let first = $first; let last = $last) {
            <li class="module" [attr.data-module]="m.id">
              <div class="module__head">
                <button
                  type="button"
                  class="module__toggle"
                  [attr.aria-expanded]="isOpen(m.id)"
                  [attr.aria-controls]="'mod-body-' + m.id"
                  (click)="toggle(m.id)"
                >
                  <app-icon name="chevron-down" size="sm" class="chev" [class.is-open]="isOpen(m.id)" />
                  <span class="module__name">Módulo {{ i + 1 }}: {{ m.title }}</span>
                  <span class="badge badge--neutral">{{ m.videos.length }} {{ m.videos.length === 1 ? 'video' : 'videos' }}</span>
                  <span class="badge" [class]="publishedIn(m) >= min ? 'badge--success' : 'badge--warning'" [attr.data-published]="m.id">
                    {{ publishedIn(m) }} {{ publishedIn(m) === 1 ? 'publicado' : 'publicados' }}
                  </span>
                </button>
                <div class="row act">
                  <button type="button" class="btn btn-ghost btn-sm btn-icon" [disabled]="first || busy()" (click)="moveModule(m, -1)" [attr.aria-label]="'Subir módulo ' + m.title"><app-icon name="arrow-up" /></button>
                  <button type="button" class="btn btn-ghost btn-sm btn-icon" [disabled]="last || busy()" (click)="moveModule(m, 1)" [attr.aria-label]="'Bajar módulo ' + m.title"><app-icon name="arrow-down" /></button>
                  <button type="button" class="btn btn-ghost btn-sm" [disabled]="busy()" (click)="startEdit(m)" [attr.aria-label]="'Editar módulo ' + m.title">Editar</button>
                  <button type="button" class="btn btn-ghost btn-sm is-danger" [disabled]="busy() || modules().length === 1"
                    (click)="askDelete(m)" [attr.aria-label]="'Eliminar módulo ' + m.title">Eliminar</button>
                </div>
              </div>

              @if (editingId() === m.id) {
                <ng-container *ngTemplateOutlet="moduleForm; context: { $implicit: m }" />
              }

              @if (deletingId() === m.id) {
                <div class="alert alert-warning small confirm" role="alertdialog" [attr.aria-labelledby]="'del-title-' + m.id">
                  <p [id]="'del-title-' + m.id"><strong>¿Eliminar el módulo «{{ m.title }}»?</strong></p>
                  @if (m.videos.length) {
                    <p>Sus {{ m.videos.length }} {{ m.videos.length === 1 ? 'video no se elimina: pasa' : 'videos no se eliminan: pasan' }} al final del módulo que elijas, con su publicación y el avance de los participantes. Sus clases en vivo también pasan a ese módulo.</p>
                    <label class="field" [for]="'del-target-' + m.id">
                      <span>Mover los videos a</span>
                      <select class="input" [id]="'del-target-' + m.id" [value]="deleteTarget()" (change)="deleteTarget.set($any($event.target).value)">
                        @for (o of otherModules(m); track o.id) { <option [value]="o.id">{{ o.title }}</option> }
                      </select>
                    </label>
                  } @else {
                    <p>El módulo no tiene videos. Si tiene clases en vivo, quedan como clases de todo el curso (sin módulo).</p>
                  }
                  <div class="row">
                    <button type="button" class="btn btn-danger btn-sm" [disabled]="busy()" (click)="confirmDelete(m)">Sí, eliminar módulo</button>
                    <button type="button" class="btn btn-ghost btn-sm" (click)="deletingId.set(null)">Cancelar</button>
                  </div>
                </div>
              }

              @if (isOpen(m.id)) {
                <div class="module__body stack" [id]="'mod-body-' + m.id">
                  @if (m.description) { <p class="small muted desc">{{ m.description }}</p> }
                  @if (m.videos.length === 0) {
                    <p class="small muted">Este módulo aún no tiene videos.</p>
                  } @else {
                    <ol class="videos" role="list" [attr.aria-label]="'Videos de ' + m.title">
                      @for (v of m.videos; track v.id; let vf = $first; let vl = $last) {
                        <li class="video" [attr.data-video]="v.id">
                          <span class="video__num" aria-hidden="true">{{ v.order }}</span>
                          <span class="video__info">
                            <strong>{{ v.title }}</strong>
                            <span class="small muted">
                              {{ v.durationSec | videoDuration }} ·
                              <span class="badge" [class]="v.published ? 'badge--success' : 'badge--neutral'">{{ v.published ? 'Publicado' : 'No publicado' }}</span>
                            </span>
                          </span>
                          <span class="row act">
                            <button type="button" class="btn btn-ghost btn-sm btn-icon" [disabled]="vf || busy()" (click)="moveVideo(v, -1)" [attr.aria-label]="'Subir ' + v.title"><app-icon name="arrow-up" /></button>
                            <button type="button" class="btn btn-ghost btn-sm btn-icon" [disabled]="vl || busy()" (click)="moveVideo(v, 1)" [attr.aria-label]="'Bajar ' + v.title"><app-icon name="arrow-down" /></button>
                            @if (modules().length > 1) {
                              <select class="input input-sm" [disabled]="busy()" [attr.aria-label]="'Mover ' + v.title + ' a otro módulo'"
                                (change)="assign(v, $any($event.target).value); $any($event.target).value = ''">
                                <option value="">Mover a…</option>
                                @for (o of otherModules(m); track o.id) { <option [value]="o.id">{{ o.title }}</option> }
                              </select>
                            }
                          </span>
                        </li>
                      }
                    </ol>
                  }

                  <div class="add row">
                    @if (otherVideos(m).length) {
                      <label class="sr-only" [for]="'add-' + m.id">Video existente para agregar a {{ m.title }}</label>
                      <select class="input input-sm" [id]="'add-' + m.id" [disabled]="busy()"
                        (change)="assign(otherVideoById($any($event.target).value), m.id); $any($event.target).value = ''">
                        <option value="">Agregar un video existente…</option>
                        @for (o of otherVideos(m); track o.video.id) { <option [value]="o.video.id">{{ o.video.title }} ({{ o.module }})</option> }
                      </select>
                    }
                    <a class="btn btn-secondary btn-sm" routerLink="/instructor/videos" [queryParams]="{ curso: courseId(), modulo: m.id, nuevo: 1 }">
                      <app-icon name="plus" size="sm" /> Crear video en este módulo
                    </a>
                  </div>
                </div>
              }
            </li>
          }
        </ol>
      }

      <ng-template #moduleForm let-m>
        <form class="module-form stack" [formGroup]="form" (ngSubmit)="saveModule(m)" novalidate
          [attr.aria-label]="m ? 'Editar módulo ' + m.title : 'Nuevo módulo'">
          <div class="field">
            <label for="m-title">Nombre del módulo</label>
            <input id="m-title" class="input" formControlName="title" maxlength="120" [class.is-invalid]="badTitle()"
              [attr.aria-invalid]="badTitle()" [attr.aria-describedby]="badTitle() ? 'm-title-error' : null" />
            @if (badTitle()) { <span id="m-title-error" class="error-text">Ingresa el nombre del módulo.</span> }
          </div>
          <div class="field">
            <label for="m-desc">Descripción (opcional)</label>
            <textarea id="m-desc" class="input" rows="2" maxlength="500" formControlName="description"></textarea>
          </div>
          <div class="row">
            <button type="submit" class="btn btn-primary btn-sm" [class.is-loading]="busy()" [disabled]="busy()">
              {{ m ? 'Guardar módulo' : 'Crear módulo' }}
            </button>
            <button type="button" class="btn btn-ghost btn-sm" (click)="closeForm()">Cancelar</button>
          </div>
        </form>
      </ng-template>
    </section>
  `,
  styles: [
    `
      .head { align-items: flex-start; }
      h2 { margin: 0; }
      .head p { margin: 0.25rem 0 0; }
      .modules, .videos { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--space-3); }
      .module { border: 1px solid var(--c-border); border-radius: var(--radius-sm); background: var(--c-surface); }
      .module__head { display: flex; align-items: center; gap: var(--space-2); padding: var(--space-2) var(--space-3); flex-wrap: wrap; }
      .module__toggle {
        flex: 1 1 220px; display: flex; align-items: center; gap: var(--space-2); min-height: 40px; padding: var(--space-1);
        border: 0; background: none; color: var(--c-primary); font: inherit; font-weight: var(--weight-bold); text-align: left; cursor: pointer;
        border-radius: var(--radius-sm);
      }
      .module__toggle:hover { background: var(--c-primary-50); }
      .module__name { min-width: 0; overflow-wrap: anywhere; }
      .chev { transition: transform 0.15s; transform: rotate(-90deg); flex: none; }
      .chev.is-open { transform: none; }
      .act { flex-wrap: wrap; gap: 0.15rem; }
      .module__body { padding: 0 var(--space-3) var(--space-3); border-top: 1px solid var(--c-border); padding-top: var(--space-3); }
      .desc { margin: 0; }
      .video { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; padding: var(--space-2); border-radius: var(--radius-sm); background: var(--c-bg); }
      .video__num {
        display: grid; place-items: center; width: 28px; height: 28px; flex: none; border-radius: var(--radius-pill);
        background: var(--c-primary-100); color: var(--c-primary); font-size: var(--text-xs); font-weight: var(--weight-bold);
      }
      .video__info { flex: 1 1 200px; display: grid; gap: 2px; min-width: 0; overflow-wrap: anywhere; }
      .input-sm { min-height: 36px; padding-top: 0.25rem; padding-bottom: 0.25rem; width: auto; max-width: 100%; }
      .add { flex-wrap: wrap; gap: var(--space-2); align-items: center; }
      .confirm { margin: 0 var(--space-3) var(--space-3); display: grid; gap: var(--space-2); }
      .confirm p { margin: 0; }
      .confirm .field { margin: 0; display: grid; gap: 0.25rem; }
      .module-form { padding: var(--space-3); border-top: 1px solid var(--c-border); }
      .stack > .module-form, section > .module-form { border: 1px solid var(--c-border); border-radius: var(--radius-sm); }
    `,
  ],
})
export class AdminCourseContent {
  private readonly repo = inject(DataRepository);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly courseId = input.required<string>();

  readonly min = MIN_VIDEOS;
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly message = signal('');
  readonly error = signal('');
  readonly content = signal<CourseContent | null>(null);
  readonly open = signal<ReadonlySet<string>>(new Set());
  readonly creating = signal(false);
  readonly editingId = signal<string | null>(null);
  readonly deletingId = signal<string | null>(null);
  readonly deleteTarget = signal('');

  readonly modules = computed<ContentModule[]>(() => this.content()?.modules ?? []);
  readonly totalCount = computed(() => this.modules().reduce((n, m) => n + m.videos.length, 0));
  /** RN-03 por módulo (19/11/2026): videos publicados propios del módulo. */
  publishedIn(m: CourseModule & { videos: VideoRecord[] }): number {
    return m.videos.filter((v) => v.published).length;
  }
  readonly publishedCount = computed(() => this.modules().reduce((n, m) => n + m.videos.filter((v) => v.published).length, 0));

  readonly form = this.fb.group({ title: ['', Validators.required], description: [''] });

  constructor() {
    effect(() => {
      const id = this.courseId();
      untracked(() => this.load(id));
    });
  }

  private load(courseId: string): void {
    this.loading.set(true);
    this.repo.getCourseContent(courseId).subscribe({
      next: (content) => {
        if (content.course.id !== this.courseId()) return;
        this.content.set(content);
        // Al abrir un curso se despliega el primer módulo.
        this.open.set(new Set(content.modules.slice(0, 1).map((m) => m.id)));
        this.loading.set(false);
      },
      error: (e) => {
        this.error.set(errMsg(e));
        this.loading.set(false);
      },
    });
  }

  isOpen(id: string): boolean {
    return this.open().has(id);
  }

  toggle(id: string): void {
    const next = new Set(this.open());
    if (!next.delete(id)) next.add(id);
    this.open.set(next);
  }

  otherModules(m: ContentModule): ContentModule[] {
    return this.modules().filter((o) => o.id !== m.id);
  }

  /** Videos de los demás módulos del mismo curso (un video no se comparte entre cursos). */
  otherVideos(m: ContentModule): { video: VideoRecord; module: string }[] {
    return this.otherModules(m).flatMap((o) => o.videos.map((video) => ({ video, module: o.title })));
  }

  otherVideoById(id: string): VideoRecord | undefined {
    return this.modules().flatMap((m) => m.videos).find((v) => v.id === id);
  }

  badTitle(): boolean {
    const c = this.form.controls.title;
    return c.touched && !c.value.trim();
  }

  startCreate(): void {
    this.closeForm();
    this.form.reset({ title: '', description: '' });
    this.creating.set(true);
  }

  startEdit(m: ContentModule): void {
    this.closeForm();
    this.form.reset({ title: m.title, description: m.description ?? '' });
    this.editingId.set(m.id);
  }

  closeForm(): void {
    this.creating.set(false);
    this.editingId.set(null);
    this.deletingId.set(null);
  }

  saveModule(m: ContentModule | null): void {
    this.form.markAllAsTouched();
    const v = this.form.getRawValue();
    if (!v.title.trim()) return;
    const before = new Set(this.modules().map((x) => x.id));
    this.run(
      this.repo.saveCourseModule(this.courseId(), { ...(m ? { id: m.id } : {}), title: v.title, description: v.description }),
      m ? 'Módulo actualizado' + DEMO_SUFFIX + '.' : 'Módulo creado' + DEMO_SUFFIX + '.',
      (content) => {
        this.closeForm();
        // El módulo nuevo se muestra desplegado.
        const added = content.modules.find((x) => !before.has(x.id));
        if (added) this.open.set(new Set([...this.open(), added.id]));
      },
    );
  }

  moveModule(m: ContentModule, delta: -1 | 1): void {
    this.run(this.repo.moveCourseModule(this.courseId(), m.id, delta), 'Orden de los módulos actualizado' + DEMO_SUFFIX + '.');
  }

  askDelete(m: ContentModule): void {
    this.closeForm();
    this.deleteTarget.set(this.otherModules(m)[0]?.id ?? '');
    this.deletingId.set(m.id);
  }

  confirmDelete(m: ContentModule): void {
    const target = m.videos.length ? this.deleteTarget() : undefined;
    this.run(this.repo.deleteCourseModule(this.courseId(), m.id, target), 'Módulo eliminado' + DEMO_SUFFIX + '. Sus videos se conservan.', () =>
      this.deletingId.set(null),
    );
  }

  moveVideo(v: VideoRecord, delta: -1 | 1): void {
    this.run(this.repo.moveCourseVideo(this.courseId(), v.id, delta), 'Orden de los videos actualizado' + DEMO_SUFFIX + '.');
  }

  assign(v: VideoRecord | undefined, moduleId: string): void {
    if (!v || !moduleId || v.moduleId === moduleId) return;
    const target = this.modules().find((m) => m.id === moduleId);
    this.run(this.repo.assignCourseVideoToModule(this.courseId(), v.id, moduleId), `«${v.title}» pasó a «${target?.title}»${DEMO_SUFFIX}.`, () =>
      this.open.set(new Set([...this.open(), moduleId])),
    );
  }

  private run(op: Observable<CourseContent>, okMessage: string, after?: (content: CourseContent) => void): void {
    this.message.set('');
    this.error.set('');
    this.busy.set(true);
    op.subscribe({
      next: (content) => {
        if (content.course.id === this.courseId()) this.content.set(content);
        this.busy.set(false);
        this.message.set(okMessage);
        after?.(content);
      },
      error: (e) => {
        this.busy.set(false);
        this.error.set(errMsg(e));
      },
    });
  }
}
