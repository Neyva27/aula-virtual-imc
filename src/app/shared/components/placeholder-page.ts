import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

/** Pantalla provisional: se reemplaza por la pantalla real en la etapa indicada. */
@Component({
  selector: 'app-placeholder-page',
  template: `
    <section class="card stack">
      <h1>{{ title }}</h1>
      <p class="alert alert-info">
        Esta pantalla se construye en la <strong>Etapa {{ stage }}</strong>.
      </p>
      <p class="muted small">La navegación, el diseño base y la protección por rol ya funcionan.</p>
    </section>
  `,
})
export class PlaceholderPage {
  private readonly route = inject(ActivatedRoute);
  readonly title: string = this.route.snapshot.data['title'] ?? 'Pantalla';
  readonly stage: number = this.route.snapshot.data['stage'] ?? 0;
}
