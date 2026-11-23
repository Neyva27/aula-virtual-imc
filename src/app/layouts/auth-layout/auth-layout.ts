import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { APP_ENVIRONMENT, isApiMode } from '../../core/config/app-environment';
import { LogoPlaceholder } from '../../shared/components/logo-placeholder';
import { Icon } from '../../shared/components/icon';
import { skipToContent } from '../../shared/a11y/skip-link';

@Component({
  selector: 'app-auth-layout',
  imports: [RouterOutlet, LogoPlaceholder, Icon],
  templateUrl: './auth-layout.html',
  styleUrl: './auth-layout.css',
})
export class AuthLayout {
  readonly skip = skipToContent;
  /** Modo API: sin el aviso «Versión de demostración». */
  readonly apiMode = isApiMode(inject(APP_ENVIRONMENT));
}
