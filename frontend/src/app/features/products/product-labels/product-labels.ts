import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { catchError, debounceTime, of, switchMap, tap } from 'rxjs';
import { extractError } from '../../../core/errors';
import { Product } from '../../../models/inventory';
import { ProductService } from '../../../services/product';
import { Barcode } from '../../../shared/barcode/barcode';

/** Printable sheet of barcode labels for the products that have a barcode. */
@Component({
  selector: 'app-product-labels',
  imports: [ReactiveFormsModule, RouterLink, CurrencyPipe, Barcode],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './product-labels.html',
})
export class ProductLabels {
  private api = inject(ProductService);

  readonly pageSize = 20; // must match PAGE_SIZE in the Django settings
  readonly search = new FormControl('', { nonNullable: true });
  readonly products = signal<Product[]>([]);
  readonly count = signal(0);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly page = signal(1);
  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.count() / this.pageSize)));

  private readonly query = signal('');

  constructor() {
    // Typing a new search goes back to the first page, after a short pause.
    this.search.valueChanges.pipe(debounceTime(300), takeUntilDestroyed()).subscribe((value) => {
      this.query.set(value.trim());
      this.page.set(1);
    });

    toObservable(computed(() => ({ search: this.query(), page: this.page() })))
      .pipe(
        tap(() => this.loading.set(true)),
        switchMap(({ search, page }) =>
          this.api.list({ search, hasBarcode: true, isActive: true, ordering: 'name', page }).pipe(
            catchError((err) => {
              this.error.set(extractError(err, 'Impossible de charger les produits.'));
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
          this.products.set(result.results);
          this.count.set(result.count);
        }
      });
  }

  goTo(page: number) {
    if (page < 1 || page > this.pageCount()) return;
    this.page.set(page);
  }

  print() {
    window.print();
  }
}
