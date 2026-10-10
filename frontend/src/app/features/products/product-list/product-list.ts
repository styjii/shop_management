import { CurrencyPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { catchError, debounceTime, of, switchMap, tap } from 'rxjs';
import { AuthService } from '../../../core/auth';
import { extractError } from '../../../core/errors';
import { ToastService } from '../../../core/toast';
import { Category, Product } from '../../../models/inventory';
import { CategoryService } from '../../../services/category';
import { ProductFilters, ProductService } from '../../../services/product';

@Component({
  selector: 'app-product-list',
  imports: [ReactiveFormsModule, RouterLink, CurrencyPipe],
  templateUrl: './product-list.html',
})
export class ProductList {
  private productApi = inject(ProductService);
  private categoryApi = inject(CategoryService);
  private toast = inject(ToastService);
  protected readonly auth = inject(AuthService);

  readonly pageSize = 20; // must match PAGE_SIZE in the Django settings

  readonly products = signal<Product[]>([]);
  readonly categories = signal<Category[]>([]);
  readonly count = signal(0);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly toDelete = signal<Product | null>(null);

  private readonly criteria = signal<ProductFilters>({ ordering: 'name', page: 1 });
  readonly page = computed(() => this.criteria().page ?? 1);
  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.count() / this.pageSize)));

  readonly filters = new FormGroup({
    search: new FormControl('', { nonNullable: true }),
    category: new FormControl<number | null>(null),
    lowStock: new FormControl(false, { nonNullable: true }),
    ordering: new FormControl('name', { nonNullable: true }),
  });

  constructor() {
    this.categoryApi.list().subscribe({
      next: (list) => this.categories.set(list),
      error: () => undefined,
    });

    // Typing in the filters resets to the first page, after a short pause.
    this.filters.valueChanges
      .pipe(debounceTime(300), takeUntilDestroyed())
      .subscribe((value) => this.criteria.set({ ...value, page: 1 }));

    toObservable(this.criteria)
      .pipe(
        tap(() => this.loading.set(true)),
        switchMap((criteria) =>
          this.productApi.list(criteria).pipe(
            catchError((err) => {
              this.error.set(extractError(err, 'Impossible de charger les produits.'));
              return of(null);
            }),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((page) => {
        this.loading.set(false);
        if (page) {
          this.error.set(null);
          this.products.set(page.results);
          this.count.set(page.count);
        }
      });
  }

  goTo(page: number) {
    if (page < 1 || page > this.pageCount()) return;
    this.criteria.update((criteria) => ({ ...criteria, page }));
  }

  askDelete(product: Product) {
    this.toDelete.set(product);
  }

  cancelDelete() {
    this.toDelete.set(null);
  }

  confirmDelete() {
    const product = this.toDelete();
    if (!product) return;
    this.productApi.remove(product.id).subscribe({
      next: () => {
        this.toDelete.set(null);
        this.toast.success(`Produit « ${product.name} » supprimé.`);
        this.criteria.update((criteria) => ({ ...criteria })); // reload
      },
      error: (err) => {
        this.toDelete.set(null);
        this.toast.error(extractError(err, 'Suppression impossible.'));
      },
    });
  }
}
