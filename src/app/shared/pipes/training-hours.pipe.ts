import { Pipe, PipeTransform } from '@angular/core';

/** Horas de formación; "Por definir" mientras la empresa no las establezca (PENDIENTES D12). */
@Pipe({ name: 'trainingHours' })
export class TrainingHoursPipe implements PipeTransform {
  transform(hours: number | null | undefined): string {
    return hours === null || hours === undefined ? 'Por definir' : `${hours} h`;
  }
}
