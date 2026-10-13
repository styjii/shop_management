import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { extractError, fieldErrors } from '../../../core/errors';
import { ToastService } from '../../../core/toast';
import { Supplier, SupplierPayload } from '../../../models/inventory';
import { SupplierService } from '../../../services/supplier';

const EMPTY: SupplierPayload = {
  name: '',
  contact_name: '',
  email: '',
  phone: '',
  address: '',
  notes: '',
  is_active: true,
};

@Component({
  selector: 'app-suppliers',
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './suppliers.html',
})
export class Suppliers {
  private api = inject(SupplierService);
  private toast = inject(ToastService);

  readonly suppliers = signal<Supplier[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly serverErrors = signal<Record<string, string[]>>({});
  readonly editing = signal<Supplier | null>(null);
  readonly toDelete = signal<Supplier | null>(null);

  readonly form = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(150)],
    }),
    contact_name: new FormControl('', { nonNullable: true }),
    email: new FormControl('', { nonNullable: true, validators: [Validators.email] }),
    phone: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(30)] }),
    address: new FormControl('', { nonNullable: true }),
    notes: new FormControl('', { nonNullable: true }),
    is_active: new FormControl(true, { nonNullable: true }),
  });

  constructor() {
    this.load();
  }

  load() {
    this.api.list().subscribe({
      next: (list) => {
        this.suppliers.set(list);
        this.loading.set(false);
        this.error.set(null);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(extractError(err, 'Impossible de charger les fournisseurs.'));
      },
    });
  }

  errorsFor(field: string): string[] {
    return this.serverErrors()[field] ?? [];
  }

  edit(supplier: Supplier) {
    this.editing.set(supplier);
    this.serverErrors.set({});
    this.form.setValue({
      name: supplier.name,
      contact_name: supplier.contact_name,
      email: supplier.email,
      phone: supplier.phone,
      address: supplier.address,
      notes: supplier.notes,
      is_active: supplier.is_active,
    });
  }

  cancelEdit() {
    this.editing.set(null);
    this.serverErrors.set({});
    this.form.reset(EMPTY);
  }

  save() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const body = this.form.getRawValue();
    const editing = this.editing();
    const request = editing ? this.api.update(editing.id, body) : this.api.create(body);

    this.saving.set(true);
    this.serverErrors.set({});

    request.subscribe({
      next: (supplier) => {
        this.saving.set(false);
        this.toast.success(
          editing
            ? `Fournisseur « ${supplier.name} » modifié.`
            : `Fournisseur « ${supplier.name} » ajouté.`,
        );
        this.cancelEdit();
        this.load();
      },
      error: (err) => {
        this.saving.set(false);
        const errors = fieldErrors(err);
        this.serverErrors.set(errors);
        if (Object.keys(errors).length === 0) {
          this.toast.error(extractError(err, "L'enregistrement a échoué."));
        }
      },
    });
  }

  askDelete(supplier: Supplier) {
    this.toDelete.set(supplier);
  }

  cancelDelete() {
    this.toDelete.set(null);
  }

  confirmDelete() {
    const supplier = this.toDelete();
    if (!supplier) return;
    this.api.remove(supplier.id).subscribe({
      next: () => {
        this.toDelete.set(null);
        this.toast.success(`Fournisseur « ${supplier.name} » supprimé.`);
        if (this.editing()?.id === supplier.id) this.cancelEdit();
        this.load();
      },
      error: (err) => {
        this.toDelete.set(null);
        this.toast.error(extractError(err, 'Suppression impossible.'));
      },
    });
  }
}
