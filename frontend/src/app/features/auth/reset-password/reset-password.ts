import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth';
import { extractError, fieldErrors } from '../../../core/errors';
import { PASSWORD_MIN_LENGTH, fieldsMatch } from '../../../core/validators';

@Component({
  selector: 'app-reset-password',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './reset-password.html',
})
export class ResetPassword {
  private auth = inject(AuthService);
  private route = inject(ActivatedRoute);

  /** uid and token come from the link of the e-mail. */
  private readonly uid = this.route.snapshot.queryParamMap.get('uid');
  private readonly token = this.route.snapshot.queryParamMap.get('token');

  readonly linkIsComplete = !!this.uid && !!this.token;
  readonly passwordMinLength = PASSWORD_MIN_LENGTH;
  readonly saving = signal(false);
  readonly done = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly serverErrors = signal<Record<string, string[]>>({});

  readonly form = new FormGroup(
    {
      password: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required, Validators.minLength(PASSWORD_MIN_LENGTH)],
      }),
      confirm: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    },
    { validators: fieldsMatch('password', 'confirm') },
  );

  errorsFor(field: string): string[] {
    return this.serverErrors()[field] ?? [];
  }

  submit() {
    if (this.form.invalid || !this.uid || !this.token) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    this.serverErrors.set({});

    this.auth
      .confirmPasswordReset(this.uid, this.token, this.form.controls.password.value)
      .subscribe({
        next: (response) => {
          this.saving.set(false);
          this.done.set(response.detail);
        },
        error: (err) => {
          this.saving.set(false);
          const errors = fieldErrors(err);
          this.serverErrors.set(errors);
          if (Object.keys(errors).length === 0) {
            this.error.set(extractError(err, 'La réinitialisation a échoué.'));
          }
        },
      });
  }
}
