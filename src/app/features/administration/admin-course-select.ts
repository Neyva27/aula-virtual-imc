import { Component, input, output } from '@angular/core';
import { CourseRecord } from '../../core/models/course.model';

/** Selector de curso para las pantallas de administración (nombre y estado de cada curso). */
@Component({
  selector: 'app-admin-course-select',
  template: `
    <div class="field picker">
      <label for="admin-course-select">Curso</label>
      <select id="admin-course-select" class="input" (change)="selectedChange.emit($any($event.target).value)">
        @if (allLabel(); as label) {
          <option value="" [selected]="!selected()">{{ label }}</option>
        }
        @for (c of courses(); track c.id) {
          <option [value]="c.id" [selected]="c.id === selected()">
            {{ c.name }} · {{ c.status === 'publicado' ? 'Publicado' : 'Borrador' }}
          </option>
        }
      </select>
    </div>
  `,
  styles: [
    `
      /* En bloque para que el espaciado vertical del contenedor (.stack) se aplique al selector. */
      :host { display: block; }
      .picker { max-width: 520px; margin-bottom: 0; }
    `,
  ],
})
export class AdminCourseSelect {
  readonly courses = input.required<CourseRecord[]>();
  readonly selected = input<string | null>(null);
  /** Si se indica, agrega una opción para ver todos los cursos (emite cadena vacía). */
  readonly allLabel = input<string | null>(null);
  readonly selectedChange = output<string>();
}
