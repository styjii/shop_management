import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, of, switchMap, tap } from 'rxjs';
import { extractError } from '../../../core/errors';
import { ToastService } from '../../../core/toast';
import { ORDER_STATUSES, OrderStatus, PurchaseOrder } from '../../../models/inventory';
import { PurchaseOrderService } from '../../../services/purchase-order';

@Component({
  selector: 'app-purchase-order-list',
  imports: [CurrencyPipe, DatePipe, RouterLink],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './purchase-order-list.html',
})
export class PurchaseOrderList {
  private api = inject(PurchaseOrderService);
  private toast = inject(ToastService);

  readonly pageSize = 20; // must match PAGE_SIZE in the Django settings
  readonly statuses = ORDER_STATUSES;

  readonly orders = signal<PurchaseOrder[]>([]);
  readonly count = signal(0);
  readonly loading = signal(true);
  readonly exporting = signal(false);
  readonly error = signal<string | null>(null);
  readonly status = signal<OrderStatus | ''>('');
  readonly page = signal(1);
  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.count() / this.pageSize)));

  constructor() {
    toObservable(computed(() => ({ status: this.status(), page: this.page() })))
      .pipe(
        tap(() => this.loading.set(true)),
        switchMap((filters) =>
          this.api.list(filters).pipe(
            catchError((err) => {
              this.error.set(extractError(err, 'Impossible de charger les bons de commande.'));
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
          this.orders.set(result.results);
          this.count.set(result.count);
        }
      });
  }

  setStatus(value: string) {
    this.status.set(value as OrderStatus | '');
    this.page.set(1);
  }

  goTo(page: number) {
    if (page < 1 || page > this.pageCount()) return;
    this.page.set(page);
  }

  statusOf(order: PurchaseOrder) {
    return this.statuses.find((s) => s.value === order.status)!;
  }

  exportCsv() {
    this.exporting.set(true);
    this.api.exportCsv({ status: this.status() }).subscribe({
      next: () => this.exporting.set(false),
      error: (err) => {
        this.exporting.set(false);
        this.toast.error(extractError(err, "L'export a échoué."));
      },
    });
  }
}
