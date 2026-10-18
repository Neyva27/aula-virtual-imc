import { Component, input } from '@angular/core';

/** Espacio reservado: reemplazar por el logotipo oficial autorizado de IMC. */
@Component({
  selector: 'app-logo-placeholder',
  template: `
    <div class="logo" [class.light]="light()">
      <span class="mark" aria-hidden="true">LOGO</span>
      <span class="name">Aula Virtual <strong>IMC</strong></span>
    </div>
  `,
  styles: [
    `
      .logo { display: inline-flex; align-items: center; gap: 0.6rem; color: var(--c-primary); }
      .mark {
        display: grid; place-items: center; width: 44px; height: 44px;
        border: 2px dashed currentColor; border-radius: 8px;
        font-size: 0.65rem; font-weight: 700; letter-spacing: 0.05em; opacity: 0.8;
      }
      .name { font-size: 1.05rem; line-height: 1.1; }
      .light { color: #fff; }
    `,
  ],
})
export class LogoPlaceholder {
  readonly light = input(false);
}
