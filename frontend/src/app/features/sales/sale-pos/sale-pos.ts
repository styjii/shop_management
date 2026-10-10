import { CurrencyPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { catchError, debounceTime, distinctUntilChanged, of, switchMap, tap } from 'rxjs';
import { extractError } from '../../../core/errors';
import { ToastService } from '../../../core/toast';
import { Product, SaleLine } from '../../../models/inventory';
import { ProductService } from '../../../services/product';
import { SaleService } from '../../../services/sale';

export interface CartLine {
  product: Product;
  quantity: number;
}

@Component({
  selector: 'app-sale-pos',
  imports: [ReactiveFormsModule, CurrencyPipe],
  templateUrl: './sale-pos.html',
})
export class SalePos {
  private productApi = inject(ProductService);
  private saleApi = inject(SaleService);
  private toast = inject(ToastService);

  readonly search = new FormControl('', { nonNullable: true });
  readonly products = signal<Product[]>([]);
  readonly loading = signal(true);
  readonly cart = signal<CartLine[]>([]);
  readonly error = signal<string | null>(null);
  readonly submitting = signal(false);

  private readonly query = signal('');

  /** Total in cents then euros, to avoid floating point drift. */
  readonly total = computed(
    () =>
      this.cart().reduce(
        (sum, line) => sum + Math.round(Number(line.product.price) * 100) * line.quantity,
        0,
      ) / 100,
  );

  constructor() {
    this.search.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe((value) => this.query.set(value.trim()));

    toObservable(this.query)
      .pipe(
        tap(() => this.loading.set(true)),
        switchMap((search) =>
          this.productApi.list({ search, isActive: true, ordering: 'name' }).pipe(
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
        if (page) this.products.set(page.results);
      });
  }

  quantityInCart(product: Product) {
    return this.cart().find((line) => line.product.id === product.id)?.quantity ?? 0;
  }

  canAdd(product: Product) {
    return this.quantityInCart(product) < product.quantity;
  }

  add(product: Product) {
    if (!this.canAdd(product)) return;
    this.error.set(null);
    this.cart.update((lines) => {
      const found = lines.find((line) => line.product.id === product.id);
      return found
        ? lines.map((line) => (line === found ? { ...line, quantity: line.quantity + 1 } : line))
        : [...lines, { product, quantity: 1 }];
    });
  }

  decrease(line: CartLine) {
    if (line.quantity <= 1) {
      this.remove(line);
      return;
    }
    this.cart.update((lines) =>
      lines.map((l) => (l === line ? { ...l, quantity: l.quantity - 1 } : l)),
    );
  }

  remove(line: CartLine) {
    this.cart.update((lines) => lines.filter((l) => l !== line));
  }

  clear() {
    this.cart.set([]);
    this.error.set(null);
  }

  validate() {
    if (this.cart().length === 0 || this.submitting()) return;
    const items: SaleLine[] = this.cart().map((line) => ({
      product: line.product.id,
      quantity: line.quantity,
    }));

    this.submitting.set(true);
    this.error.set(null);

    this.saleApi.create(items).subscribe({
      next: (sale) => {
        this.submitting.set(false);
        this.cart.set([]);
        this.toast.success(`Vente n°${sale.id} enregistrée.`);
        this.reload();
      },
      error: (err) => {
        this.submitting.set(false);
        this.error.set(extractError(err, 'La vente a été refusée.'));
        this.reload(); // the stock may have changed
      },
    });
  }

  /** Re-run the current search to refresh the displayed stock. */
  private reload() {
    this.productApi.list({ search: this.query(), isActive: true, ordering: 'name' }).subscribe({
      next: (page) => this.products.set(page.results),
      error: () => undefined,
    });
  }
}
