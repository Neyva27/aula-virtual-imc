import { Pipe, PipeTransform } from '@angular/core';

/** Duración de un intento de examen: «18 min 0 s» o «45 s». Reemplaza tres métodos duration() idénticos. */
@Pipe({ name: 'attemptDuration' })
export class AttemptDurationPipe implements PipeTransform {
  transform(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m} min ${s} s` : `${s} s`;
  }
}
