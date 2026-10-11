import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth';
import { extractError, fieldErrors } from '../../../core/errors';
import { PASSWORD_MIN_LENGTH, fieldsMatch } from '../../../core/validators';

@Component({
  selector: 'app-register',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './register.html',
})
export class Register {
  private auth = inject(AuthService);

  readonly passwordMinLength = PASSWORD_MIN_LENGTH;
  readonly saving = signal(false);
  readonly done = signal<string | null>(null);
  readonly generalError = signal<string | null>(null);
  readonly serverErrors = signal<Record<string, string[]>>({});

  readonly form = new FormGroup(
    {
      username: new FormControl('', {
        nonNullable: true,
        validators: [
          Validators.required,
          Validators.maxLength(150),
          Validators.pattern(/^[\w.@+-]+$/),
        ],
      }),
      email: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required, Validators.email],
      }),
      first_name: new FormControl('', { nonNullable: true }),
      last_name: new FormControl('', { nonNullable: true }),
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
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { confirm: _confirm, ...body } = this.form.getRawValue();
    this.saving.set(true);
    this.serverErrors.set({});
    this.generalError.set(null);

    this.auth.register(body).subscribe({
      next: (response) => {
        this.saving.set(false);
        this.done.set(response.detail);
      },
      error: (err) => {
        this.saving.set(false);
        const errors = fieldErrors(err);
        this.serverErrors.set(errors);
        if (Object.keys(errors).length === 0) {
          this.generalError.set(extractError(err, "L'inscription a échoué."));
        }
      },
    });
  }
}
