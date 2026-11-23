import { Component, effect, inject, input, signal, untracked } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DEMO_SUFFIX } from '../../core/config/app-environment';
import { CourseModule, LiveSession, LiveSessionInput, LiveSessionStatus, livePhase } from '../../core/models/course.model';
import { DataRepository } from '../../core/services/data-repository';
import { formatLima, isoToLima, limaToIso } from '../../core/utils/lima-time';
import { MEET_URL_ERROR, normalizeMeetUrl } from '../../core/utils/meet';
import { Icon } from '../../shared/components/icon';
import { errMsg } from './admin-utils';

/**
 * Clases en vivo del curso (20/11/2026), sección propia de «Editar curso» (no es un módulo de videos). Enlaces
 * externos de Google Meet: programar, consultar, editar, reprogramar, cancelar y agregar la grabación después de la
 * clase. El módulo relacionado es opcional. Las canceladas se conservan (el estudiante las ve como «Cancelada»).
 */
@Component({
  selector: 'app-admin-live-sessions',
  imports: [ReactiveFormsModule, Icon],
  template: `
    <section class="card stack live" aria-labelledby="live-title" data-test="live-section">
      <div class="row between">
        <div>
          <h2 id="live-title">Clases en vivo</h2>
          <p class="small muted">Sesiones por Google Meet (hora de Lima). Los participantes las ven en su aula con el botón «Unirse a la clase».</p>
        </div>
        @if (!formOpen()) {
          <button type="button" class="btn btn-secondary btn-sm" [disabled]="busy() || !!loadError()" (click)="startCreate()">
            <app-icon name="plus" size="sm" /> Programar clase en vivo
          </button>
        }
      </div>
      @if (message()) { <p class="alert alert-success small" role="status">{{ message() }}</p> }
      @if (error()) { <p class="alert alert-danger small" role="alert">No se pudo completar la operación: {{ error() }}</p> }
      @if (loadError()) {
        <div class="alert alert-warning small row between" role="alert" data-test="live-load-error">
          <span>No se pudieron cargar las clases en vivo: {{ loadError() }}</span>
          <button type="button" class="btn btn-secondary btn-sm" (click)="reload()">Reintentar</button>
        </div>
      }

      @if (formOpen()) {
        <form class="live-form stack" [formGroup]="form" (ngSubmit)="save()" novalidate
          [attr.aria-label]="editingId() ? 'Editar clase en vivo' : 'Nueva clase en vivo'">
          <div class="field">
            <label for="ls-title">Título</label>
            <input id="ls-title" class="input" formControlName="title" maxlength="150" [class.is-invalid]="bad('title')" />
            @if (bad('title')) { <span class="error-text">Ingresa el título de la clase en vivo.</span> }
          </div>
          <div class="field">
            <label for="ls-desc">Descripción (opcional)</label>
            <textarea id="ls-desc" class="input" rows="2" maxlength="2000" formControlName="description"></textarea>
          </div>
          <div class="grid grid-2">
            <div class="field">
              <label for="ls-date">Fecha</label>
              <input id="ls-date" class="input" type="date" formControlName="date" [class.is-invalid]="bad('date')" />
            </div>
            <div class="field">
              <label for="ls-time">Hora (America/Lima)</label>
              <input id="ls-time" class="input" type="time" formControlName="time" [class.is-invalid]="bad('time')" />
            </div>
          </div>
          @if (bad('date') || bad('time')) { <span class="error-text">Ingresa la fecha y la hora de inicio.</span> }
          <div class="field">
            <label for="ls-module">Módulo relacionado (opcional)</label>
            <select id="ls-module" class="input" formControlName="moduleId">
              <option value="">Sin módulo (todo el curso)</option>
              @for (m of modules(); track m.id; let i = $index) { <option [value]="m.id">Módulo {{ i + 1 }}: {{ m.title }}</option> }
            </select>
          </div>
          <div class="field">
            <label for="ls-meet">Enlace de Google Meet</label>
            <input id="ls-meet" class="input" type="url" formControlName="meetUrl" placeholder="https://meet.google.com/abc-defg-hij"
              [class.is-invalid]="badMeet()" />
            @if (badMeet()) { <span class="error-text">{{ meetError }}</span> }
          </div>
          <div class="row">
            <button type="submit" class="btn btn-primary btn-sm" [class.is-loading]="busy()" [disabled]="busy()">
              {{ editingId() ? 'Guardar cambios' : 'Programar clase' }}
            </button>
            <button type="button" class="btn btn-ghost btn-sm" (click)="closeForm()">Cancelar</button>
          </div>
        </form>
      }

      @if (loaded() && sessions().length === 0 && !formOpen() && !loadError()) {
        <p class="small muted" data-test="live-empty">Este curso no tiene clases en vivo programadas.</p>
      }
      @if (sessions().length) {
        <ul class="sessions" role="list">
          @for (s of sessions(); track s.id) {
            <li class="session" [attr.data-live-session]="s.id" [class.is-cancelled]="s.status === 'cancelada'">
              <div class="session__info">
                <strong class="session__title">{{ s.title }}</strong>
                <span class="small">{{ when(s) }}</span>
                <span class="small muted">{{ s.moduleOrder ? 'Módulo ' + s.moduleOrder + ': ' + s.moduleTitle : 'Todo el curso (sin módulo)' }}</span>
                @if (s.description) { <span class="small muted">{{ s.description }}</span> }
                <a class="small" [href]="s.meetUrl" target="_blank" rel="noopener noreferrer">{{ s.meetUrl }}</a>
                @if (s.recordingUrl) {
                  <span class="small">Grabación: <a [href]="s.recordingUrl" target="_blank" rel="noopener noreferrer">{{ s.recordingUrl }}</a></span>
                }
              </div>
              <div class="row act">
                <span class="badge" [class]="badgeClass(s)">{{ phaseLabel(s) }}</span>
                <button type="button" class="btn btn-ghost btn-sm" [disabled]="busy()" (click)="startEdit(s)" [attr.aria-label]="'Editar o reprogramar ' + s.title">Editar o reprogramar</button>
                @if (s.status === 'programada') {
                  <button type="button" class="btn btn-ghost btn-sm is-danger" [disabled]="busy()" (click)="setStatus(s, 'cancelada')" [attr.aria-label]="'Cancelar clase ' + s.title">Cancelar clase</button>
                  @if (phase(s) !== 'proxima') {
                    <button type="button" class="btn btn-ghost btn-sm" [disabled]="busy()" (click)="startRecording(s)" [attr.aria-label]="'Grabación de ' + s.title">
                      {{ s.recordingUrl ? 'Cambiar grabación' : 'Agregar grabación' }}
                    </button>
                  }
                } @else {
                  <button type="button" class="btn btn-ghost btn-sm" [disabled]="busy()" (click)="setStatus(s, 'programada')" [attr.aria-label]="'Volver a programar ' + s.title">Volver a programar</button>
                }
              </div>
              @if (recordingFor() === s.id) {
                <form class="recording row" (submit)="$event.preventDefault(); saveRecording(s)" novalidate [attr.aria-label]="'Grabación de ' + s.title">
                  <label class="sr-only" for="ls-recording">Enlace de la grabación</label>
                  <input id="ls-recording" class="input" type="url" placeholder="https://drive.google.com/… o https://youtube.com/…"
                    [value]="recordingDraft()" (input)="recordingDraft.set($any($event.target).value)" />
                  <button type="submit" class="btn btn-primary btn-sm" [disabled]="busy()">Guardar grabación</button>
                  @if (s.recordingUrl) {
                    <button type="button" class="btn btn-ghost btn-sm is-danger" [disabled]="busy()" (click)="removeRecording(s)">Quitar grabación</button>
                  }
                  <button type="button" class="btn btn-ghost btn-sm" (click)="recordingFor.set(null)">Cancelar</button>
                  <span class="small muted">Google Meet no graba solo: agrega el enlace de la grabación que guardaste (Drive, YouTube u otra fuente https).</span>
                </form>
              }
            </li>
          }
        </ul>
      }
    </section>
  `,
  styles: [
    `
      .live h2 { margin: 0; }
      .between { justify-content: space-between; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
      .sessions { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.5rem; }
      .session { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 0.5rem; padding: 0.6rem 0.75rem; border: 1px solid var(--c-border); border-radius: var(--radius-sm); }
      .session.is-cancelled .session__title { text-decoration: line-through; color: var(--c-muted); }
      .session__info { display: grid; gap: 2px; min-width: 0; flex: 1 1 260px; overflow-wrap: anywhere; }
      .act { gap: 0.35rem; align-items: center; flex-wrap: wrap; }
      .live-form { padding: 0.75rem; border: 1px solid var(--c-border); border-radius: var(--radius-sm); }
      .recording { flex: 1 1 100%; gap: 0.5rem; flex-wrap: wrap; align-items: center; }
      .recording .input { flex: 1 1 260px; }
    `,
  ],
})
export class AdminLiveSessions {
  private readonly repo = inject(DataRepository);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly courseId = input.required<string>();

  readonly meetError = MEET_URL_ERROR;
  readonly busy = signal(false);
  readonly loaded = signal(false);
  readonly message = signal('');
  readonly error = signal('');
  readonly loadError = signal('');
  readonly formOpen = signal(false);
  readonly editingId = signal<string | null>(null);
  readonly submitted = signal(false);
  readonly sessions = signal<LiveSession[]>([]);
  readonly modules = signal<CourseModule[]>([]);
  readonly recordingFor = signal<string | null>(null);
  readonly recordingDraft = signal('');
  readonly now = signal(Date.now());

  readonly form = this.fb.group({
    title: ['', Validators.required],
    description: [''],
    date: ['', Validators.required],
    time: ['', Validators.required],
    meetUrl: [''],
    moduleId: [''],
  });

  constructor() {
    effect(() => {
      const id = this.courseId();
      untracked(() => this.reload(id));
    });
  }

  reload(courseId = this.courseId()): void {
    this.loadError.set('');
    this.repo.getCourseLiveSessions(courseId).subscribe({
      next: (list) => {
        if (courseId !== this.courseId()) return;
        this.sessions.set(list);
        this.loaded.set(true);
      },
      error: (e: unknown) => this.loadError.set(errMsg(e)),
    });
    this.loadModules(courseId);
  }

  /** Módulos actuales del curso (pueden cambiar en «Contenido del curso»). */
  private loadModules(courseId = this.courseId()): void {
    this.repo.getCourseContent(courseId).subscribe({
      next: (c) => {
        if (courseId === this.courseId()) this.modules.set(c.modules);
      },
      error: () => undefined,
    });
  }

  when(s: LiveSession): string {
    return formatLima(s.startsAt);
  }

  phase(s: LiveSession) {
    return livePhase(s, this.now());
  }

  phaseLabel(s: LiveSession): string {
    return { proxima: 'Programada', en_curso: 'En curso', finalizada: 'Finalizada', cancelada: 'Cancelada' }[this.phase(s)];
  }

  badgeClass(s: LiveSession): string {
    return { proxima: 'badge--success', en_curso: 'badge--info', finalizada: 'badge--neutral', cancelada: 'badge--danger' }[this.phase(s)];
  }

  bad(name: 'title' | 'date' | 'time'): boolean {
    const c = this.form.controls[name];
    return (c.touched || this.submitted()) && !c.value.trim();
  }

  badMeet(): boolean {
    const c = this.form.controls.meetUrl;
    return (c.touched || this.submitted()) && !normalizeMeetUrl(c.value);
  }

  startCreate(): void {
    this.clear();
    this.loadModules();
    this.editingId.set(null);
    this.submitted.set(false);
    this.form.reset({ title: '', description: '', date: '', time: '', meetUrl: '', moduleId: '' });
    this.formOpen.set(true);
  }

  startEdit(s: LiveSession): void {
    this.clear();
    this.loadModules();
    const { date, time } = isoToLima(s.startsAt);
    this.editingId.set(s.id);
    this.submitted.set(false);
    this.form.reset({ title: s.title, description: s.description ?? '', date, time, meetUrl: s.meetUrl, moduleId: s.moduleId ?? '' });
    this.formOpen.set(true);
  }

  closeForm(): void {
    this.formOpen.set(false);
    this.editingId.set(null);
  }

  save(): void {
    this.submitted.set(true);
    this.form.markAllAsTouched();
    const v = this.form.getRawValue();
    const startsAt = limaToIso(v.date, v.time);
    if (!v.title.trim() || !startsAt || !normalizeMeetUrl(v.meetUrl)) return;
    const input: LiveSessionInput = {
      moduleId: v.moduleId || null,
      title: v.title.trim(),
      description: v.description.trim() || null,
      startsAt,
      meetUrl: v.meetUrl.trim(),
    };
    const id = this.editingId();
    const op = id ? this.repo.updateCourseLiveSession(this.courseId(), id, input) : this.repo.createCourseLiveSession(this.courseId(), input);
    this.run(op, (id ? 'Clase en vivo actualizada' : 'Clase en vivo programada') + DEMO_SUFFIX + '.', () => this.closeForm());
  }

  setStatus(s: LiveSession, status: LiveSessionStatus): void {
    const op = this.repo.setCourseLiveSessionStatus(this.courseId(), s.id, status);
    this.run(op, (status === 'cancelada' ? `Clase «${s.title}» cancelada` : `Clase «${s.title}» programada de nuevo`) + DEMO_SUFFIX + '.');
  }

  startRecording(s: LiveSession): void {
    this.clear();
    this.recordingDraft.set(s.recordingUrl ?? '');
    this.recordingFor.set(s.id);
  }

  saveRecording(s: LiveSession): void {
    const url = this.recordingDraft().trim();
    if (!url) {
      this.error.set('Ingresa el enlace de la grabación.');
      return;
    }
    this.run(this.repo.setCourseLiveSessionRecording(this.courseId(), s.id, url), 'Grabación guardada' + DEMO_SUFFIX + '.', () => this.recordingFor.set(null));
  }

  removeRecording(s: LiveSession): void {
    this.run(this.repo.setCourseLiveSessionRecording(this.courseId(), s.id, null), 'Grabación quitada' + DEMO_SUFFIX + '.', () => this.recordingFor.set(null));
  }

  private run(op: ReturnType<DataRepository['getCourseLiveSessions']>, ok: string, after?: () => void): void {
    this.clear();
    this.busy.set(true);
    op.subscribe({
      next: (list) => {
        this.busy.set(false);
        this.message.set(ok);
        this.sessions.set(list);
        this.now.set(Date.now());
        after?.();
      },
      error: (e: unknown) => {
        this.busy.set(false);
        this.error.set(errMsg(e));
      },
    });
  }

  private clear(): void {
    this.message.set('');
    this.error.set('');
  }
}
