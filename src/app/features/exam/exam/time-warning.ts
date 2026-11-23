import { Component, output } from '@angular/core';
import { Icon } from '../../../shared/components/icon';

/**
 * Etapa 1: aviso de que quedan 5 minutos. Ventana NO modal: no tiene fondo que bloquee, no mueve el foco (no
 * interrumpe al estudiante mientras escribe) y se anuncia a los lectores de pantalla (role="alert"). Cerrarla no
 * detiene el temporizador.
 */
@Component({
  selector: 'app-exam-time-warning',
  imports: [Icon],
  template: `
    <div class="time-warning alert alert-warning card" role="alert" aria-labelledby="time-warning-title">
      <p id="time-warning-title" class="time-warning__title">
        <app-icon name="clock" size="sm" /> <strong>Quedan 5 minutos o menos</strong>
      </p>
      <p class="small">
        El temporizador sigue corriendo. Cuando llegue a cero, tus respuestas guardadas se enviarán automáticamente.
      </p>
      <button type="button" class="btn btn-secondary btn-sm" (click)="closed.emit()">Entendido</button>
    </div>
  `,
  styles: [
    `
      .time-warning {
        position: fixed; right: var(--space-4); bottom: var(--space-4); z-index: 50;
        width: min(380px, calc(100vw - 2 * var(--space-4)));
        display: grid; gap: var(--space-2); margin: 0; box-shadow: var(--shadow-md);
      }
      .time-warning p { margin: 0; }
      .time-warning__title { display: flex; align-items: center; gap: var(--space-2); }
      .time-warning .btn { justify-self: start; }
    `,
  ],
})
export class ExamTimeWarning {
  readonly closed = output<void>();
}
