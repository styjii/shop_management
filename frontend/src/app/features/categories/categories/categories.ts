import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { extractError, fieldErrors } from '../../../core/errors';
import { ToastService } from '../../../core/toast';
import { Category } from '../../../models/inventory';
import { CategoryService } from '../../../services/category';

@Component({
  selector: 'app-categories',
  imports: [ReactiveFormsModule],
  templateUrl: './categories.html',
})
export class Categories {
  private api = inject(CategoryService);
  private toast = inject(ToastService);

  readonly categories = signal<Category[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly serverErrors = signal<Record<string, string[]>>({});
  readonly editing = signal<Category | null>(null);
  readonly toDelete = signal<Category | null>(null);

  readonly form = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(100)],
    }),
    description: new FormControl('', { nonNullable: true }),
  });

  constructor() {
    this.load();
  }

  load() {
    this.api.list().subscribe({
      next: (list) => {
        this.categories.set(list);
        this.loading.set(false);
        this.error.set(null);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(extractError(err, 'Impossible de charger les catégories.'));
      },
    });
  }

  errorsFor(field: string): string[] {
    return this.serverErrors()[field] ?? [];
  }

  edit(category: Category) {
    this.editing.set(category);
    this.serverErrors.set({});
    this.form.setValue({ name: category.name, description: category.description });
  }

  cancelEdit() {
    this.editing.set(null);
    this.serverErrors.set({});
    this.form.reset({ name: '', description: '' });
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
      next: (category) => {
        this.saving.set(false);
        this.toast.success(
          editing
            ? `Catégorie « ${category.name} » modifiée.`
            : `Catégorie « ${category.name} » ajoutée.`,
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

  askDelete(category: Category) {
    this.toDelete.set(category);
  }

  cancelDelete() {
    this.toDelete.set(null);
  }

  confirmDelete() {
    const category = this.toDelete();
    if (!category) return;
    this.api.remove(category.id).subscribe({
      next: () => {
        this.toDelete.set(null);
        this.toast.success(`Catégorie « ${category.name} » supprimée.`);
        if (this.editing()?.id === category.id) this.cancelEdit();
        this.load();
      },
      error: (err) => {
        this.toDelete.set(null);
        this.toast.error(extractError(err, 'Suppression impossible.'));
      },
    });
  }
}
