import { Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Observable } from 'rxjs';
import { DataRepository } from '../../core/services/data-repository';
import {
  Course,
  MAX_VIDEOS,
  MAX_VIDEO_MIN,
  MIN_VIDEOS,
  MIN_VIDEO_MIN,
  Video,
} from '../../core/models/course.model';
import { errMsg } from './admin-utils';

@Component({
  selector: 'app-admin-videos',
  imports: [ReactiveFormsModule],
  template: `
    <div class="stack">
      <header class="row between">
        <div>
          <h1>Videos</h1>
          <p class="muted">
            {{ videos().length }} de {{ max }} videos (mínimo {{ min }}) · duración de {{ minDur }} a {{ maxDur }} minutos.
            Solo los videos publicados se muestran a los participantes.
          </p>
        </div>
        <button type="button" class="btn btn-primary" (click)="openNew()" [disabled]="videos().length >= max">
          Agregar video
        </button>
      </header>

      @if (message()) { <p class="alert alert-success" role="status">{{ message() }}</p> }
      @if (error()) { <p class="alert alert-danger" role="alert">{{ error() }}</p> }

      @if (showForm()) {
        <form class="card stack" [formGroup]="form" (ngSubmit)="save()" novalidate>
          <h2>{{ editingId() ? 'Editar video' : 'Nuevo video' }}</h2>
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
              <label for="v-dur">Duración (minutos)</label>
              <input id="v-dur" class="input" type="number" formControlName="durationMin" [class.is-invalid]="bad('durationMin')" />
              @if (bad('durationMin')) { <span class="error-text">Debe estar entre {{ minDur }} y {{ maxDur }} minutos.</span> }
            </div>
            <div class="field">
              <label for="v-url">Archivo o enlace de reproducción (opcional)</label>
              <input id="v-url" class="input" formControlName="url" placeholder="https://..." />
            </div>
          </div>
          <label class="check"><input type="checkbox" formControlName="published" /> Publicar este video</label>
          <div class="row">
            <button type="submit" class="btn btn-primary" [class.is-loading]="saving()" [disabled]="saving()">Guardar</button>
            <button type="button" class="btn btn-secondary" (click)="closeForm()">Cancelar</button>
          </div>
        </form>
      }

      @if (loading()) {
        <p class="card muted" role="status">Cargando…</p>
      } @else {
        <div class="table-wrap">
          <table>
            <thead><tr><th>Orden</th><th>Título</th><th>Duración</th><th>Estado</th><th>Acciones</th></tr></thead>
            <tbody>
              @for (v of videos(); track v.id; let i = $index; let last = $last) {
                <tr>
                  <td>{{ v.order }}</td>
                  <td>{{ v.title }}</td>
                  <td>{{ v.durationMin }} min</td>
                  <td>
                    <span class="badge" [class]="v.published ? 'badge--success' : 'badge--neutral'">
                      {{ v.published ? 'Publicado' : 'Borrador' }}
                    </span>
                  </td>
                  <td>
                    <div class="row act">
                      <button type="button" class="btn btn-ghost" [disabled]="i === 0" (click)="move(v, -1)" [attr.aria-label]="'Subir ' + v.title">↑</button>
                      <button type="button" class="btn btn-ghost" [disabled]="last" (click)="move(v, 1)" [attr.aria-label]="'Bajar ' + v.title">↓</button>
                      <button type="button" class="btn btn-ghost" (click)="togglePublished(v)">{{ v.published ? 'Despublicar' : 'Publicar' }}</button>
                      <button type="button" class="btn btn-ghost" (click)="openEdit(v)">Editar</button>
                      @if (confirmDeleteId() === v.id) {
                        <button type="button" class="btn btn-danger" (click)="remove(v)">Confirmar</button>
                        <button type="button" class="btn btn-ghost" (click)="confirmDeleteId.set(null)">No</button>
                      } @else {
                        <button type="button" class="btn btn-ghost" (click)="confirmDeleteId.set(v.id)">Eliminar</button>
                      }
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
      <p class="small muted">Demostración: los cambios se guardan solo en este navegador, no en un servidor.</p>
    </div>
  `,
  styles: [
    `
      .between { justify-content: space-between; align-items: flex-start; }
      .act { flex-wrap: nowrap; gap: 0.15rem; }
      .act .btn { min-height: 34px; padding: 0.25rem 0.55rem; font-size: 0.85rem; }
      .check { display: flex; align-items: center; gap: 0.5rem; font-weight: 600; }
    `,
  ],
})
export class AdminVideos {
  private readonly repo = inject(DataRepository);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly min = MIN_VIDEOS;
  readonly max = MAX_VIDEOS;
  readonly minDur = MIN_VIDEO_MIN;
  readonly maxDur = MAX_VIDEO_MIN;

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly message = signal('');
  readonly error = signal('');
  readonly showForm = signal(false);
  readonly editingId = signal<string | null>(null);
  readonly confirmDeleteId = signal<string | null>(null);
  readonly course = signal<Course | null>(null);

  readonly videos = computed<Video[]>(() =>
    [...(this.course()?.videos ?? [])].sort((a, b) => a.order - b.order),
  );

  readonly form = this.fb.group({
    title: ['', Validators.required],
    description: [''],
    durationMin: [6, [Validators.required, Validators.min(MIN_VIDEO_MIN), Validators.max(MAX_VIDEO_MIN)]],
    url: [''],
    published: [true],
  });

  constructor() {
    this.repo.getCourse().subscribe({
      next: (c) => {
        this.course.set(c);
        this.loading.set(false);
      },
      error: (e) => {
        this.error.set(errMsg(e));
        this.loading.set(false);
      },
    });
  }

  bad(name: 'title' | 'durationMin'): boolean {
    const c = this.form.controls[name];
    return c.invalid && c.touched;
  }

  openNew(): void {
    this.editingId.set(null);
    this.form.reset({ title: '', description: '', durationMin: 6, url: '', published: true });
    this.showForm.set(true);
    this.clearMessages();
  }

  openEdit(v: Video): void {
    this.editingId.set(v.id);
    this.form.setValue({
      title: v.title,
      description: v.description ?? '',
      durationMin: v.durationMin,
      url: v.url ?? '',
      published: v.published,
    });
    this.showForm.set(true);
    this.clearMessages();
  }

  closeForm(): void {
    this.showForm.set(false);
    this.editingId.set(null);
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const id = this.editingId();
    this.run(
      this.repo.saveVideo({ ...this.form.getRawValue(), ...(id ? { id } : {}) }),
      id ? 'Video actualizado (demostración).' : 'Video agregado (demostración).',
      () => this.closeForm(),
    );
  }

  move(v: Video, delta: -1 | 1): void {
    this.run(this.repo.moveVideo(v.id, delta), 'Orden actualizado (demostración).');
  }

  togglePublished(v: Video): void {
    this.run(
      this.repo.setVideoPublished(v.id, !v.published),
      v.published ? 'Video despublicado (demostración).' : 'Video publicado (demostración).',
    );
  }

  remove(v: Video): void {
    this.confirmDeleteId.set(null);
    this.run(this.repo.deleteVideo(v.id), 'Video eliminado (demostración).');
  }

  private clearMessages(): void {
    this.message.set('');
    this.error.set('');
  }

  private run(op: Observable<Course>, okMessage: string, after?: () => void): void {
    this.clearMessages();
    this.saving.set(true);
    op.subscribe({
      next: (course) => {
        this.course.set(course);
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
