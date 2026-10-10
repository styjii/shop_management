import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { catchError, debounceTime, distinctUntilChanged, of, switchMap, tap } from 'rxjs';
import { extractError, fieldErrors } from '../../../core/errors';
import { ToastService } from '../../../core/toast';
import { MOVEMENT_KINDS, MovementKind, Product, StockMovement } from '../../../models/inventory';
import { MovementFilters, MovementService } from '../../../services/movement';
import { ProductService } from '../../../services/product';

@Component({
  selector: 'app-movements',
  imports: [ReactiveFormsModule, DatePipe],
  templateUrl: './movements.html',
})
export class Movements {
  private movementApi = inject(MovementService);
  private productApi = inject(ProductService);
  private route = inject(ActivatedRoute);
  private toast = inject(ToastService);

  readonly kinds = MOVEMENT_KINDS;
  readonly pageSize = 20; // must match PAGE_SIZE in the Django settings

  // ---- history
  readonly movements = signal<StockMovement[]>([]);
  readonly count = signal(0);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly filterProduct = signal<Product | null>(null);
  readonly kindFilter = new FormControl<MovementKind | ''>('', { nonNullable: true });

  private readonly criteria = signal<MovementFilters>({ page: 1 });
  readonly page = computed(() => this.criteria().page ?? 1);
  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.count() / this.pageSize)));

  // ---- new movement
  readonly candidates = signal<Product[]>([]);
  readonly selected = signal<Product | null>(null);
  readonly productSearch = new FormControl('', { nonNullable: true });
  readonly saving = signal(false);
  readonly serverErrors = signal<Record<string, string[]>>({});
  readonly generalError = signal<string | null>(null);

  readonly form = new FormGroup({
    product: new FormControl<number | null>(null, Validators.required),
    kind: new FormControl<MovementKind>('IN', { nonNullable: true }),
    quantity: new FormControl(1, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(1)],
    }),
    reason: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(200)] }),
  });

  constructor() {
    // /movements?product=12 opens the page for one product (link from the product list).
    const productId = Number(this.route.snapshot.queryParamMap.get('product')) || null;
    if (productId) {
      this.criteria.set({ page: 1, product: productId });
      this.productApi.get(productId).subscribe({
        next: (product) => {
          this.filterProduct.set(product);
          this.select(product);
        },
        error: () => undefined,
      });
    }

    this.searchProducts('');
    this.productSearch.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe((search) => this.searchProducts(search.trim()));

    this.form.controls.product.valueChanges.pipe(takeUntilDestroyed()).subscribe((id) => {
      this.selected.set(this.candidates().find((product) => product.id === id) ?? null);
    });

    this.kindFilter.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((kind) => this.criteria.update((criteria) => ({ ...criteria, kind, page: 1 })));

    toObservable(this.criteria)
      .pipe(
        tap(() => this.loading.set(true)),
        switchMap((criteria) =>
          this.movementApi.list(criteria).pipe(
            catchError((err) => {
              this.error.set(extractError(err, "Impossible de charger l'historique."));
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
          this.movements.set(page.results);
          this.count.set(page.count);
        }
      });
  }

  kindLabel(kind: MovementKind) {
    return this.kinds.find((item) => item.value === kind)?.label ?? kind;
  }

  currentHint() {
    return this.kinds.find((item) => item.value === this.form.controls.kind.value)?.hint ?? '';
  }

  select(product: Product) {
    this.candidates.update((list) =>
      list.some((item) => item.id === product.id)
        ? list.map((item) => (item.id === product.id ? product : item))
        : [product, ...list],
    );
    this.form.controls.product.setValue(product.id);
  }

  clearProductFilter() {
    this.filterProduct.set(null);
    this.criteria.update((criteria) => ({ ...criteria, product: null, page: 1 }));
  }

  goTo(page: number) {
    if (page < 1 || page > this.pageCount()) return;
    this.criteria.update((criteria) => ({ ...criteria, page }));
  }

  submit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    if (value.product === null) return;

    this.saving.set(true);
    this.serverErrors.set({});
    this.generalError.set(null);

    this.movementApi
      .create({
        product: value.product,
        kind: value.kind,
        quantity: value.quantity,
        reason: value.reason.trim(),
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.toast.success('Mouvement enregistré.');
          this.form.patchValue({ quantity: 1, reason: '' });
          this.form.controls.quantity.markAsUntouched();
          this.refreshSelected(value.product as number);
          this.criteria.update((criteria) => ({ ...criteria, page: 1 }));
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

  errorsFor(field: string): string[] {
    return this.serverErrors()[field] ?? [];
  }

  /** Re-read the product so the displayed stock reflects the new movement. */
  private refreshSelected(id: number) {
    this.productApi.get(id).subscribe({
      next: (product) => this.select(product),
      error: () => undefined,
    });
  }

  private searchProducts(search: string) {
    this.productApi.list({ search, ordering: 'name' }).subscribe({
      next: (page) => {
        const selected = this.selected();
        const results = page.results;
        this.candidates.set(
          selected && !results.some((product) => product.id === selected.id)
            ? [selected, ...results]
            : results,
        );
      },
      error: () => undefined,
    });
  }
}
