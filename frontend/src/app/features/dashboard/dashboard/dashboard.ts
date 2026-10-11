import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { filter, switchMap, take } from 'rxjs';
import { AuthService } from '../../../core/auth';
import { Product, Sale } from '../../../models/inventory';
import { ProductService } from '../../../services/product';
import { SaleService } from '../../../services/sale';
import { UserService } from '../../../services/user';
import { extractError } from '../../../core/errors';

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, CurrencyPipe, DatePipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './dashboard.html',
})
export class Dashboard {
  protected readonly auth = inject(AuthService);

  readonly alerts = signal<Product[]>([]);
  readonly recentSales = signal<Sale[]>([]);
  readonly salesCount = signal(0);
  readonly pendingAccounts = signal(0);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  readonly outOfStock = computed(() => this.alerts().filter((p) => p.quantity === 0).length);

  constructor() {
    const products = inject(ProductService);
    const sales = inject(SaleService);
    const users = inject(UserService);

    products.lowStock().subscribe({
      next: (list) => {
        this.alerts.set(list);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(extractError(err));
        this.loading.set(false);
      },
    });

    // Managers are told when registrations are waiting for approval. The role may only be
    // known after /auth/me/ answers, so wait for it.
    toObservable(this.auth.isManager)
      .pipe(
        filter(Boolean),
        take(1),
        switchMap(() => users.list({ status: 'pending' })),
      )
      .subscribe({
        next: (page) => this.pendingAccounts.set(page.count),
        error: () => undefined,
      });

    sales.list().subscribe({
      next: (page) => {
        this.salesCount.set(page.count);
        this.recentSales.set(page.results.slice(0, 5));
      },
      error: () => undefined,
    });
  }
}
