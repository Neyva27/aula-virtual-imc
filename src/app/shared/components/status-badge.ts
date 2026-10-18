import { Component, computed, input } from '@angular/core';
import { ParticipantStatus } from '../../core/models/course.model';

const LABELS: Record<ParticipantStatus, string> = {
  pendiente: 'Pendiente',
  en_progreso: 'En progreso',
  listo_examen: 'Listo para examen',
  aprobado: 'Aprobado',
  desaprobado: 'Desaprobado',
};

const TONES: Record<ParticipantStatus, string> = {
  pendiente: 'neutral',
  en_progreso: 'info',
  listo_examen: 'warning',
  aprobado: 'success',
  desaprobado: 'danger',
};

@Component({
  selector: 'app-status-badge',
  template: `<span class="badge" [class]="'badge--' + tone()">{{ label() }}</span>`,
})
export class StatusBadge {
  readonly status = input.required<ParticipantStatus>();
  readonly label = computed(() => LABELS[this.status()]);
  readonly tone = computed(() => TONES[this.status()]);
}
