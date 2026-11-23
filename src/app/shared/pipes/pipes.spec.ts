import { TrainingHoursPipe } from './training-hours.pipe';
import { VideoDurationPipe } from './video-duration.pipe';
import { AttemptDurationPipe } from './attempt-duration.pipe';

describe('TrainingHoursPipe', () => {
  const pipe = new TrainingHoursPipe();

  it('muestra "Por definir" cuando las horas no están definidas (nunca "null h")', () => {
    expect(pipe.transform(null)).toBe('Por definir');
    expect(pipe.transform(undefined)).toBe('Por definir');
  });

  it('muestra las horas definidas', () => {
    expect(pipe.transform(8)).toBe('8 h');
  });
});

describe('VideoDurationPipe', () => {
  const pipe = new VideoDurationPipe();

  it('muestra la duración real en m:ss, sin redondear', () => {
    expect(pipe.transform(513)).toBe('8:33');
    expect(pipe.transform(603)).toBe('10:03');
    expect(pipe.transform(360)).toBe('6:00');
  });
});

describe('AttemptDurationPipe', () => {
  const pipe = new AttemptDurationPipe();

  it('muestra minutos y segundos, o solo segundos si dura menos de un minuto (mismo formato que antes de V1)', () => {
    expect(pipe.transform(1080)).toBe('18 min 0 s');
    expect(pipe.transform(1215)).toBe('20 min 15 s');
    expect(pipe.transform(60)).toBe('1 min 0 s');
    expect(pipe.transform(45)).toBe('45 s');
    expect(pipe.transform(0)).toBe('0 s');
  });
});
