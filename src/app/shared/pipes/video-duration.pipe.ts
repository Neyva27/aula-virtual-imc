import { Pipe, PipeTransform } from '@angular/core';
import { formatDuration } from '../../core/utils/duration';

/** Duración real del video, sin redondear: «m:ss» (10:03) o, desde una hora, «h:mm:ss» (1:30:30). */
@Pipe({ name: 'videoDuration' })
export class VideoDurationPipe implements PipeTransform {
  transform(seconds: number): string {
    return formatDuration(seconds);
  }
}
