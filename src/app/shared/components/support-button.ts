import { Component } from '@angular/core';
import { SUPPORT_CONFIG, supportWhatsappUrl } from '../../core/config/support.config';

/**
 * Botón flotante «Contactar soporte» (23/11/2026). Abre WhatsApp en una pestaña nueva y no envía ningún dato del usuario
 * (el enlace no lleva nombre, DNI, correo ni texto prellenado). En móvil queda sobre la barra inferior de pestañas.
 */
@Component({
  selector: 'app-support-button',
  template: `
    <a class="support" [href]="url" target="_blank" rel="noopener noreferrer" data-test="support-whatsapp">
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
        <path
          fill="currentColor"
          d="M12.04 2a9.9 9.9 0 0 0-8.5 14.96L2 22l5.17-1.5A9.9 9.9 0 1 0 12.04 2zm0 18.1a8.2 8.2 0 0 1-4.2-1.15l-.3-.18-3.07.89.9-2.99-.2-.31a8.2 8.2 0 1 1 6.87 3.74zm4.5-6.14c-.25-.12-1.46-.72-1.69-.8-.23-.08-.39-.12-.56.12-.16.25-.64.8-.78.97-.14.16-.29.18-.54.06a6.7 6.7 0 0 1-1.98-1.22 7.5 7.5 0 0 1-1.37-1.71c-.14-.25-.02-.38.11-.5.11-.11.25-.29.37-.43.12-.15.16-.25.25-.41.08-.17.04-.31-.02-.43-.06-.13-.56-1.35-.76-1.85-.2-.48-.4-.42-.56-.42h-.48a.92.92 0 0 0-.66.31 2.8 2.8 0 0 0-.87 2.07c0 1.22.89 2.4 1.01 2.57.13.16 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.47-.07 1.46-.6 1.67-1.18.2-.58.2-1.07.14-1.18-.06-.1-.22-.16-.47-.29z"
        />
      </svg>
      <span class="support__text">
        <span>Contactar soporte</span>
        @if (provisional) { <small>Número provisional</small> }
      </span>
      <span class="sr-only">(WhatsApp, se abre en una pestaña nueva)</span>
    </a>
  `,
  styles: [
    `
      .support {
        position: fixed; right: 1rem; bottom: 1rem; z-index: 40; display: inline-flex; align-items: center; gap: 0.5rem;
        min-height: 44px; padding: 0.45rem 0.95rem; border-radius: 999px; background: var(--c-primary); color: #fff;
        font-weight: 600; font-size: 0.875rem; line-height: 1.15; text-decoration: none; box-shadow: 0 4px 14px rgba(10, 30, 80, 0.3);
      }
      .support:hover { filter: brightness(1.1); color: #fff; }
      .support:focus-visible { outline: 3px solid var(--c-primary-100); outline-offset: 2px; }
      .support__text { display: inline-flex; flex-direction: column; }
      .support__text small { font-weight: 400; font-size: 0.7rem; opacity: 0.9; }
      @media (max-width: 760px) {
        .support { bottom: calc(76px + env(safe-area-inset-bottom)); right: 0.75rem; padding: 0.4rem 0.75rem; }
      }
      @media print { .support { display: none; } }
    `,
  ],
})
export class SupportButton {
  readonly url = supportWhatsappUrl();
  readonly provisional: boolean = SUPPORT_CONFIG.provisional;
}
