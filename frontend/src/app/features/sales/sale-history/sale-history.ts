import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, of, switchMap, tap } from 'rxjs';
import { AuthService } from '../../../core/auth';
import { extractError } from '../../../core/errors';
import { Sale } from '../../../models/inventory';
import { SaleService } from '../../../services/sale';

@Component({
  selector: 'app-sale-history',
  imports: [CurrencyPipe, DatePipe, RouterLink],
  templateUrl: './sale-history.html',
})
export class SaleHistory {
  private saleApi = inject(SaleService);
  protected readonly auth = inject(AuthService);

  readonly pageSize = 20; // must match PAGE_SIZE in the Django settings

  readonly sales = signal<Sale[]>([]);
  readonly count = signal(0);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly expanded = signal<number | null>(null);
  readonly page = signal(1);
  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.count() / this.pageSize)));

  constructor() {
    toObservable(this.page)
      .pipe(
        tap(() => this.loading.set(true)),
        switchMap((page) =>
          this.saleApi.list(page).pipe(
            catchError((err) => {
              this.error.set(extractError(err, "Impossible de charger l'historique."));
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
          this.sales.set(result.results);
          this.count.set(result.count);
        }
      });
  }

  goTo(page: number) {
    if (page < 1 || page > this.pageCount()) return;
    this.expanded.set(null);
    this.page.set(page);
  }

  toggle(id: number) {
    this.expanded.update((current) => (current === id ? null : id));
  }

  itemCount(sale: Sale) {
    return sale.items.reduce((sum, item) => sum + item.quantity, 0);
  }
}
