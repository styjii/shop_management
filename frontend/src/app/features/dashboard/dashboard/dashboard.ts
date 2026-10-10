import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Product, Sale } from '../../../models/inventory';
import { ProductService } from '../../../services/product';
import { SaleService } from '../../../services/sale';
import { extractError } from '../../../core/errors';

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, CurrencyPipe, DatePipe],
  templateUrl: './dashboard.html',
})
export class Dashboard {
  readonly alerts = signal<Product[]>([]);
  readonly recentSales = signal<Sale[]>([]);
  readonly salesCount = signal(0);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  readonly outOfStock = computed(() => this.alerts().filter((p) => p.quantity === 0).length);

  constructor() {
    const products = inject(ProductService);
    const sales = inject(SaleService);

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

    sales.list().subscribe({
      next: (page) => {
        this.salesCount.set(page.count);
        this.recentSales.set(page.results.slice(0, 5));
      },
      error: () => undefined,
    });
  }
}
