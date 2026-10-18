import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DataRepository } from '../../core/services/data-repository';
import { CourseStatus } from '../../core/models/course.model';
import { errMsg } from './admin-utils';

@Component({
  selector: 'app-admin-courses',
  imports: [ReactiveFormsModule],
  template: `
    <div class="stack">
      <header class="row between">
        <div>
          <h1>Cursos</h1>
          <p class="muted">Edita los datos del curso. Un curso se publica con entre 5 y 7 videos.</p>
        </div>
        <button type="button" class="btn btn-secondary" disabled title="Pendiente de definición">
          Registrar nuevo curso
        </button>
      </header>

      <p class="alert alert-info small">
        Pendiente de definición: las reglas de negocio indican un solo curso configurable para la primera
        versión, por eso el registro de cursos adicionales está deshabilitado.
      </p>

      @if (message()) { <p class="alert alert-success" role="status">{{ message() }}</p> }
      @if (error()) { <p class="alert alert-danger" role="alert">{{ error() }}</p> }

      @if (loading()) {
        <p class="card muted" role="status">Cargando…</p>
      } @else {
        <form class="card stack" [formGroup]="form" (ngSubmit)="save()" novalidate>
          <h2>Datos del curso</h2>
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
          <div class="grid grid-2">
            <div class="field">
              <label for="c-status">Estado</label>
              <select id="c-status" class="input" formControlName="status">
                <option value="borrador">Borrador</option>
                <option value="publicado">Publicado</option>
              </select>
            </div>
            <div class="field">
              <label for="c-hours">Horas de formación (para el certificado)</label>
              <input id="c-hours" class="input" type="number" min="1" formControlName="trainingHours" [class.is-invalid]="bad('trainingHours')" />
              @if (bad('trainingHours')) { <span class="error-text">Ingresa al menos 1 hora.</span> }
            </div>
          </div>
          <div><button type="submit" class="btn btn-primary" [class.is-loading]="saving()" [disabled]="saving()">Guardar cambios</button></div>
          <p class="small muted">Demostración: los cambios se guardan solo en este navegador. Las horas de formación aún deben definirse con la empresa.</p>
        </form>
      }
    </div>
  `,
  styles: ['.between { justify-content: space-between; align-items: flex-start; }'],
})
export class AdminCourses {
  private readonly repo = inject(DataRepository);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly message = signal('');
  readonly error = signal('');

  readonly form = this.fb.group({
    name: ['', Validators.required],
    description: ['', Validators.required],
    status: ['borrador' as CourseStatus],
    trainingHours: [1, [Validators.required, Validators.min(1)]],
  });

  constructor() {
    this.repo.getCourse().subscribe({
      next: (c) => {
        this.form.setValue({
          name: c.name,
          description: c.description,
          status: c.status,
          trainingHours: c.trainingHours,
        });
        this.loading.set(false);
      },
      error: (e) => {
        this.error.set(errMsg(e));
        this.loading.set(false);
      },
    });
  }

  bad(name: 'name' | 'description' | 'trainingHours'): boolean {
    const c = this.form.controls[name];
    return c.invalid && c.touched;
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.message.set('');
    this.error.set('');
    this.repo.updateCourse(this.form.getRawValue()).subscribe({
      next: () => {
        this.saving.set(false);
        this.message.set('Cambios guardados (demostración).');
      },
      error: (e) => {
        this.saving.set(false);
        this.error.set(errMsg(e));
      },
    });
  }
}
