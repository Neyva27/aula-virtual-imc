import { Component, input } from '@angular/core';

@Component({
  selector: 'app-progress-bar',
  template: `
    <div
      class="pb"
      role="progressbar"
      aria-valuemin="0"
      aria-valuemax="100"
      [attr.aria-valuenow]="value()"
      [attr.aria-label]="label()"
    >
      <div class="pb__fill" [style.width.%]="value()"></div>
    </div>
  `,
  styles: [
    `
      .pb { height: 10px; background: #e1e6f0; border-radius: 999px; overflow: hidden; }
      .pb__fill { height: 100%; background: var(--c-accent); border-radius: 999px; transition: width 0.3s; }
    `,
  ],
})
export class ProgressBar {
  readonly value = input(0);
  readonly label = input('Progreso');
}
