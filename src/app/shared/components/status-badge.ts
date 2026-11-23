import { Component, computed, input } from '@angular/core';
import { ParticipantStatus } from '../../core/models/course.model';

const LABELS: Record<ParticipantStatus, string> = {
  pendiente: 'Pendiente',
  en_progreso: 'En progreso',
  listo_examen: 'Listo para examen',
  en_revision: 'En revisión',
  aprobado: 'Aprobado',
  desaprobado: 'Desaprobado',
};

const TONES: Record<ParticipantStatus, string> = {
  pendiente: 'neutral',
  en_progreso: 'info',
  listo_examen: 'warning',
  en_revision: 'warning',
  aprobado: 'success',
  desaprobado: 'danger',
};

@Component({
  selector: 'app-status-badge',
  template: `<span class="badge" [class]="'badge--' + tone()">{{ label() }}</span>`,
})
export class StatusBadge {
  readonly status = input.required<ParticipantStatus>();
  /**
   * R6: vistas del estudiante. Las preguntas abiertas sin calificar se muestran como «Pendiente de calificación»;
   * las pantallas del Instructor no lo indican y conservan su texto.
   */
  readonly student = input(false);
  readonly label = computed(() =>
    this.student() && this.status() === 'en_revision' ? 'Pendiente de calificación' : LABELS[this.status()],
  );
  readonly tone = computed(() => TONES[this.status()]);
}
