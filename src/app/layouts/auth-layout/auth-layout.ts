import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { LogoPlaceholder } from '../../shared/components/logo-placeholder';

@Component({
  selector: 'app-auth-layout',
  imports: [RouterOutlet, LogoPlaceholder],
  templateUrl: './auth-layout.html',
  styleUrl: './auth-layout.css',
})
export class AuthLayout {}
