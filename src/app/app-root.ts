import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { IS_API_BUILD } from './core/config/app-environment';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: '<router-outlet />',
})
export class AppRoot {
  constructor() {
    // Modo API (18/11/2026): oculta los textos fijos de demostración (clase `demo-only`, ver styles.css).
    if (IS_API_BUILD) document.body.classList.add('api-mode');
  }
}
