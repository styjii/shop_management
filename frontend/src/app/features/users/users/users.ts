import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { catchError, debounceTime, of, switchMap, tap } from 'rxjs';
import { AuthService } from '../../../core/auth';
import { extractError, fieldErrors } from '../../../core/errors';
import { ToastService } from '../../../core/toast';
import { PASSWORD_MIN_LENGTH } from '../../../core/validators';
import {
  AppUser,
  CAPABILITIES,
  Capability,
  Role,
  UserPayload,
  UserStatus,
} from '../../../models/inventory';
import { UserFilters, UserService } from '../../../services/user';

const STATUS_LABELS: Record<UserStatus, string> = {
  pending: 'En attente',
  active: 'Actif',
  inactive: 'Désactivé',
};

@Component({
  selector: 'app-users',
  imports: [ReactiveFormsModule, DatePipe],
  templateUrl: './users.html',
})
export class Users {
  private api = inject(UserService);
  private toast = inject(ToastService);
  protected readonly auth = inject(AuthService);

  readonly capabilities = CAPABILITIES;
  readonly passwordMinLength = PASSWORD_MIN_LENGTH;
  readonly pageSize = 20; // must match PAGE_SIZE in the Django settings

  // ---- list
  readonly users = signal<AppUser[]>([]);
  readonly count = signal(0);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  private readonly criteria = signal<UserFilters>({ page: 1 });
  readonly page = computed(() => this.criteria().page ?? 1);
  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.count() / this.pageSize)));

  readonly filters = new FormGroup({
    search: new FormControl('', { nonNullable: true }),
    status: new FormControl<UserStatus | ''>('', { nonNullable: true }),
    role: new FormControl<Role | ''>('', { nonNullable: true }),
  });

  // ---- editor (create / edit / approve)
  /** `'new'` to create, a user to edit, `null` when the editor is closed. */
  readonly editing = signal<'new' | AppUser | null>(null);
  readonly saving = signal(false);
  readonly serverErrors = signal<Record<string, string[]>>({});
  readonly generalError = signal<string | null>(null);

  readonly form = new FormGroup({
    username: new FormControl('', { nonNullable: true }),
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
    first_name: new FormControl('', { nonNullable: true }),
    last_name: new FormControl('', { nonNullable: true }),
    password: new FormControl('', { nonNullable: true }),
    role: new FormControl<Role | null>(null, Validators.required),
    capabilities: new FormGroup({
      manage_catalog: new FormControl(false, { nonNullable: true }),
      manage_stock: new FormControl(false, { nonNullable: true }),
      view_all_sales: new FormControl(false, { nonNullable: true }),
    }),
    is_active: new FormControl(true, { nonNullable: true }),
  });

  // ---- other dialogs
  readonly passwordTarget = signal<AppUser | null>(null);
  readonly newPassword = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.minLength(PASSWORD_MIN_LENGTH)],
  });
  readonly passwordErrors = signal<string[]>([]);
  readonly toDelete = signal<AppUser | null>(null);

  constructor() {
    this.filters.valueChanges
      .pipe(debounceTime(300), takeUntilDestroyed())
      .subscribe((value) => this.criteria.set({ ...value, page: 1 }));

    toObservable(this.criteria)
      .pipe(
        tap(() => this.loading.set(true)),
        switchMap((criteria) =>
          this.api.list(criteria).pipe(
            catchError((err) => {
              this.error.set(extractError(err, 'Impossible de charger les utilisateurs.'));
              return of(null);
            }),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((result) => {
        this.loading.set(false);
        if (result) {
          this.error.set(null);
          this.users.set(result.results);
          this.count.set(result.count);
        }
      });
  }

  statusLabel(status: UserStatus) {
    return STATUS_LABELS[status];
  }

  displayName(user: AppUser) {
    return `${user.first_name} ${user.last_name}`.trim() || user.username;
  }

  capabilityLabel(code: Capability) {
    return this.capabilities.find((item) => item.value === code)?.label ?? code;
  }

  goTo(page: number) {
    if (page < 1 || page > this.pageCount()) return;
    this.criteria.update((criteria) => ({ ...criteria, page }));
  }

  private reload() {
    this.criteria.update((criteria) => ({ ...criteria }));
  }

  errorsFor(field: string): string[] {
    return this.serverErrors()[field] ?? [];
  }

  // ---- editor
  openCreate() {
    this.resetEditor();
    this.form.reset({ role: 'seller', is_active: true });
    this.form.controls.username.setValidators([Validators.required, Validators.maxLength(150)]);
    this.form.controls.password.setValidators([
      Validators.required,
      Validators.minLength(PASSWORD_MIN_LENGTH),
    ]);
    this.refreshValidity();
    this.editing.set('new');
  }

  /** Edit a user. A pending registration opens ready to be approved. */
  openEdit(user: AppUser) {
    this.resetEditor();
    const approving = user.status === 'pending';
    this.form.reset({
      username: user.username,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      role: user.role ?? 'seller',
      capabilities: {
        manage_catalog: user.capabilities.includes('manage_catalog'),
        manage_stock: user.capabilities.includes('manage_stock'),
        view_all_sales: user.capabilities.includes('view_all_sales'),
      },
      is_active: approving ? true : user.is_active,
    });
    this.form.controls.username.clearValidators();
    this.form.controls.password.clearValidators();
    this.refreshValidity();
    this.editing.set(user);
  }

  closeEditor() {
    this.editing.set(null);
  }

  private resetEditor() {
    this.serverErrors.set({});
    this.generalError.set(null);
    this.saving.set(false);
  }

  private refreshValidity() {
    this.form.controls.username.updateValueAndValidity();
    this.form.controls.password.updateValueAndValidity();
  }

  private selectedCapabilities(): Capability[] {
    const value = this.form.controls.capabilities.getRawValue();
    return this.capabilities.map((item) => item.value).filter((code) => value[code]);
  }

  save() {
    const editing = this.editing();
    if (!editing) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const role = value.role;
    const body: UserPayload = {
      email: value.email,
      first_name: value.first_name,
      last_name: value.last_name,
      role,
      // A manager already has every right: nothing to grant individually.
      capabilities: role === 'seller' ? this.selectedCapabilities() : [],
      is_active: value.is_active,
    };

    this.saving.set(true);
    this.serverErrors.set({});
    this.generalError.set(null);

    const request =
      editing === 'new'
        ? this.api.create({ ...body, username: value.username, password: value.password })
        : this.api.update(editing.id, body);

    request.subscribe({
      next: (user) => {
        this.saving.set(false);
        this.editing.set(null);
        this.toast.success(
          editing === 'new'
            ? `Utilisateur « ${user.username} » créé.`
            : `Utilisateur « ${user.username} » enregistré.`,
        );
        this.reload();
      },
      error: (err) => {
        this.saving.set(false);
        const errors = fieldErrors(err);
        this.serverErrors.set(errors);
        const general = errors['non_field_errors']?.[0];
        if (general) {
          this.generalError.set(general);
        } else if (Object.keys(errors).length === 0) {
          this.generalError.set(extractError(err, "L'enregistrement a échoué."));
        }
      },
    });
  }

  // ---- activation
  toggleActive(user: AppUser) {
    if (!user.is_active && user.role === null) {
      this.openEdit(user); // an account needs a role before it can be activated
      return;
    }
    this.api.update(user.id, { is_active: !user.is_active }).subscribe({
      next: () => {
        this.toast.success(
          user.is_active ? `« ${user.username} » désactivé.` : `« ${user.username} » réactivé.`,
        );
        this.reload();
      },
      error: (err) => this.toast.error(extractError(err, 'Modification impossible.')),
    });
  }

  // ---- password
  openPassword(user: AppUser) {
    this.newPassword.reset();
    this.passwordErrors.set([]);
    this.passwordTarget.set(user);
  }

  closePassword() {
    this.passwordTarget.set(null);
  }

  savePassword() {
    const user = this.passwordTarget();
    if (!user) return;
    if (this.newPassword.invalid) {
      this.newPassword.markAsTouched();
      return;
    }
    this.api.setPassword(user.id, this.newPassword.value).subscribe({
      next: () => {
        this.passwordTarget.set(null);
        this.toast.success(`Mot de passe de « ${user.username} » modifié.`);
      },
      error: (err) => {
        const errors = fieldErrors(err)['new_password'];
        this.passwordErrors.set(errors ?? [extractError(err, 'Modification impossible.')]);
      },
    });
  }

  // ---- deletion
  askDelete(user: AppUser) {
    this.toDelete.set(user);
  }

  cancelDelete() {
    this.toDelete.set(null);
  }

  confirmDelete() {
    const user = this.toDelete();
    if (!user) return;
    this.api.remove(user.id).subscribe({
      next: () => {
        this.toDelete.set(null);
        this.toast.success(`Utilisateur « ${user.username} » supprimé.`);
        this.reload();
      },
      error: (err) => {
        this.toDelete.set(null);
        this.toast.error(extractError(err, 'Suppression impossible.'));
      },
    });
  }
}
