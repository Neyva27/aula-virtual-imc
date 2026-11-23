import { Component, computed, input } from '@angular/core';
import { CourseLevel, courseLevelLabel } from '../../core/models/course.model';

/** Nivel oficial del curso (23/11/2026). Sin nivel: «Pendiente de clasificación» (no se asigna ninguno por defecto). */
@Component({
  selector: 'app-level-badge',
  template: `<span class="badge" [class]="level() ? 'badge--info level' : 'badge--neutral'" data-test="course-level">{{ label() }}</span>`,
  styles: [':host { display: inline-flex; } .level { background: var(--c-primary-100); color: var(--c-primary); }'],
})
export class LevelBadge {
  readonly level = input<CourseLevel | null | undefined>(null);
  readonly label = computed(() => courseLevelLabel(this.level()));
}
