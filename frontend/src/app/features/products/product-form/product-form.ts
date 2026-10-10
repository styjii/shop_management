import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { extractError, fieldErrors } from '../../../core/errors';
import { ToastService } from '../../../core/toast';
import { Category } from '../../../models/inventory';
import { CategoryService } from '../../../services/category';
import { ProductService } from '../../../services/product';

@Component({
  selector: 'app-product-form',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './product-form.html',
})
export class ProductForm {
  private products = inject(ProductService);
  private categoryApi = inject(CategoryService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private toast = inject(ToastService);

  readonly id = Number(this.route.snapshot.paramMap.get('id')) || null;

  readonly categories = signal<Category[]>([]);
  readonly serverErrors = signal<Record<string, string[]>>({});
  readonly generalError = signal<string | null>(null);
  readonly saving = signal(false);
  readonly currentImage = signal<string | null>(null);
  readonly newCategory = new FormControl('', { nonNullable: true });

  private imageFile: File | null = null;

  readonly form = new FormGroup({
    sku: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(40)],
    }),
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(150)],
    }),
    category: new FormControl<number | null>(null, Validators.required),
    price: new FormControl(0, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0)],
    }),
    quantity: new FormControl(0, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0)],
    }),
    low_stock_threshold: new FormControl(5, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0)],
    }),
    is_active: new FormControl(true, { nonNullable: true }),
  });

  constructor() {
    this.categoryApi.list().subscribe({
      next: (list) => this.categories.set(list),
      error: (err) => this.generalError.set(extractError(err)),
    });

    if (this.id) {
      this.products.get(this.id).subscribe({
        next: (product) => {
          this.currentImage.set(product.image);
          this.form.patchValue({
            sku: product.sku,
            name: product.name,
            category: product.category,
            price: Number(product.price),
            quantity: product.quantity,
            low_stock_threshold: product.low_stock_threshold,
            is_active: product.is_active,
          });
        },
        error: (err) => this.generalError.set(extractError(err, 'Produit introuvable.')),
      });
    }
  }

  errorsFor(field: string): string[] {
    return this.serverErrors()[field] ?? [];
  }

  onImageSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    this.imageFile = input.files?.item(0) ?? null;
  }

  addCategory() {
    const name = this.newCategory.value.trim();
    if (!name) return;
    this.categoryApi.create({ name }).subscribe({
      next: (category) => {
        this.categories.update((list) =>
          [...list, category].sort((a, b) => a.name.localeCompare(b.name)),
        );
        this.form.controls.category.setValue(category.id);
        this.newCategory.reset();
        this.toast.success(`Catégorie « ${category.name} » ajoutée.`);
      },
      error: (err) => this.toast.error(extractError(err, "Impossible d'ajouter la catégorie.")),
    });
  }

  save() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const body = this.form.getRawValue();
    const request = this.id
      ? this.products.update(this.id, body, this.imageFile)
      : this.products.create(body, this.imageFile);

    this.saving.set(true);
    this.serverErrors.set({});
    this.generalError.set(null);

    request.subscribe({
      next: (product) => {
        this.toast.success(`Produit « ${product.name} » enregistré.`);
        void this.router.navigate(['/products']);
      },
      error: (err) => {
        this.saving.set(false);
        const errors = fieldErrors(err);
        this.serverErrors.set(errors);
        if (Object.keys(errors).length === 0) {
          this.generalError.set(extractError(err, "L'enregistrement a échoué."));
        }
      },
    });
  }
}
