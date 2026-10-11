import { Component, effect, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../../core/auth';
import { extractError, fieldErrors } from '../../../core/errors';
import { ToastService } from '../../../core/toast';
import { PASSWORD_MIN_LENGTH, fieldsMatch } from '../../../core/validators';
import { CAPABILITIES } from '../../../models/inventory';

@Component({
  selector: 'app-account',
  imports: [ReactiveFormsModule],
  templateUrl: './account.html',
})
export class Account {
  protected readonly auth = inject(AuthService);
  private toast = inject(ToastService);

  readonly capabilities = CAPABILITIES;
  readonly passwordMinLength = PASSWORD_MIN_LENGTH;

  readonly savingProfile = signal(false);
  readonly profileErrors = signal<Record<string, string[]>>({});
  readonly savingPassword = signal(false);
  readonly passwordErrors = signal<Record<string, string[]>>({});

  readonly profileForm = new FormGroup({
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
    first_name: new FormControl('', { nonNullable: true }),
    last_name: new FormControl('', { nonNullable: true }),
  });

  readonly passwordForm = new FormGroup(
    {
      old_password: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
      new_password: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required, Validators.minLength(PASSWORD_MIN_LENGTH)],
      }),
      confirm: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    },
    { validators: fieldsMatch('new_password', 'confirm') },
  );

  constructor() {
    this.auth.ensureUser().subscribe({ error: () => undefined });
    // Fill the profile form once the user is known.
    effect(() => {
      const user = this.auth.user();
      if (user) {
        this.profileForm.reset(
          { email: user.email, first_name: user.first_name, last_name: user.last_name },
          { emitEvent: false },
        );
      }
    });
  }

  hasCapability(code: string) {
    return this.auth.user()?.capabilities.includes(code as never) ?? false;
  }

  profileErrorsFor(field: string): string[] {
    return this.profileErrors()[field] ?? [];
  }

  passwordErrorsFor(field: string): string[] {
    return this.passwordErrors()[field] ?? [];
  }

  saveProfile() {
    if (this.profileForm.invalid) {
      this.profileForm.markAllAsTouched();
      return;
    }
    this.savingProfile.set(true);
    this.profileErrors.set({});
    this.auth.updateProfile(this.profileForm.getRawValue()).subscribe({
      next: () => {
        this.savingProfile.set(false);
        this.toast.success('Profil enregistré.');
      },
      error: (err) => {
        this.savingProfile.set(false);
        const errors = fieldErrors(err);
        this.profileErrors.set(errors);
        if (Object.keys(errors).length === 0) {
          this.toast.error(extractError(err, "L'enregistrement a échoué."));
        }
      },
    });
  }

  changePassword() {
    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      return;
    }
    const { old_password, new_password } = this.passwordForm.getRawValue();
    this.savingPassword.set(true);
    this.passwordErrors.set({});

    this.auth.changePassword(old_password, new_password).subscribe({
      next: () => {
        this.savingPassword.set(false);
        this.toast.success('Mot de passe modifié. Reconnectez-vous avec le nouveau.');
        this.auth.logout(); // every session was revoked by the API
      },
      error: (err) => {
        this.savingPassword.set(false);
        const errors = fieldErrors(err);
        this.passwordErrors.set(errors);
        if (Object.keys(errors).length === 0) {
          this.toast.error(extractError(err, 'Le changement a échoué.'));
        }
      },
    });
  }
}
