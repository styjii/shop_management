import { NgTemplateOutlet } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth';
import { ToastService } from './core/toast';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, NgTemplateOutlet],
  templateUrl: './app.html',
})
export class App {
  protected readonly auth = inject(AuthService);
  protected readonly toasts = inject(ToastService);

  constructor() {
    // Restore the user (name and role) after a page reload.
    if (this.auth.isLoggedIn()) {
      this.auth.ensureUser().subscribe({ error: () => undefined });
    }
  }

  protected logout() {
    this.auth.logout();
  }
}
