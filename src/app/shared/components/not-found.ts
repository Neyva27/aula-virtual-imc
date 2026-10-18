import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-not-found',
  imports: [RouterLink],
  template: `
    <main class="wrap">
      <div class="card stack">
        <p class="code">404</p>
        <h1>Página no encontrada</h1>
        <p class="muted">La dirección que buscas no existe o fue movida.</p>
        <a class="btn btn-primary" routerLink="/login">Ir al inicio</a>
      </div>
    </main>
  `,
  styles: [
    `
      .wrap { min-height: 100vh; display: grid; place-items: center; padding: 1rem; }
      .card { max-width: 440px; text-align: center; }
      .code { font-size: 3.5rem; font-weight: 800; margin: 0; color: var(--c-primary); }
    `,
  ],
})
export class NotFound {}
