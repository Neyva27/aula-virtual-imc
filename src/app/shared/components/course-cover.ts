import { Component, computed, input, linkedSignal } from '@angular/core';
import { DEMO_CONFIG } from '../../core/config/demo.config';

/** Portada del curso. Si no tiene imagen o no se puede cargar, muestra la portada de respaldo. */
@Component({
  selector: 'app-course-cover',
  template: `<img class="cover" [src]="src()" [alt]="alt()" loading="lazy" (error)="failed.set(true)" />`,
  styles: [
    `
      .cover { display: block; width: 100%; aspect-ratio: 16 / 9; object-fit: cover; background: var(--c-primary-100); }
    `,
  ],
})
export class CourseCover {
  readonly image = input<string | null>(null);
  /** Vacío por defecto: la portada es decorativa y el nombre del curso va como texto al lado. */
  readonly alt = input('');
  /** Se reinicia cuando cambia la imagen. */
  readonly failed = linkedSignal({ source: this.image, computation: () => false });
  readonly src = computed(() => (!this.failed() && this.image()) || DEMO_CONFIG.coverFallback);
}
