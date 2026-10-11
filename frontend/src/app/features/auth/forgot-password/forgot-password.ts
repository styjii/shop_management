import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth';
import { extractError } from '../../../core/errors';

@Component({
  selector: 'app-forgot-password',
  imports: [ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './forgot-password.html',
})
export class ForgotPassword {
  private auth = inject(AuthService);

  readonly sending = signal(false);
  readonly sent = signal<string | null>(null);
  readonly error = signal<string | null>(null);

  readonly form = new FormGroup({
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
  });

  submit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.sending.set(true);
    this.error.set(null);
    this.auth.requestPasswordReset(this.form.controls.email.value).subscribe({
      next: (response) => {
        this.sending.set(false);
        this.sent.set(response.detail);
      },
      error: (err) => {
        this.sending.set(false);
        this.error.set(extractError(err, "L'envoi a échoué. Réessayez plus tard."));
      },
    });
  }
}
