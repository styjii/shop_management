import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { catchError, of, switchMap, tap } from 'rxjs';
import { extractError } from '../../../core/errors';
import { ToastService } from '../../../core/toast';
import { SalesStats } from '../../../models/inventory';
import { SaleService } from '../../../services/sale';
import { BarChart, ChartPoint } from '../../../shared/bar-chart/bar-chart';

export const PERIODS = [
  { days: 7, label: '7 jours' },
  { days: 30, label: '30 jours' },
  { days: 90, label: '90 jours' },
];

@Component({
  selector: 'app-sales-stats',
  imports: [CurrencyPipe, BarChart],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './sales-stats.html',
})
export class SalesStatsPage {
  private api = inject(SaleService);
  private toast = inject(ToastService);

  readonly periods = PERIODS;
  readonly days = signal(30);
  readonly stats = signal<SalesStats | null>(null);
  readonly loading = signal(true);
  readonly exporting = signal(false);
  readonly error = signal<string | null>(null);

  /** One bar per day: "12/10" and the revenue of that day. */
  readonly points = computed<ChartPoint[]>(() =>
    (this.stats()?.daily ?? []).map((day) => ({
      label: `${day.date.slice(8, 10)}/${day.date.slice(5, 7)}`,
      value: Number(day.revenue),
    })),
  );

  readonly topMax = computed(() =>
    Math.max(1, ...(this.stats()?.top_products ?? []).map((p) => Number(p.revenue))),
  );
  readonly categoryMax = computed(() =>
    Math.max(1, ...(this.stats()?.by_category ?? []).map((c) => Number(c.revenue))),
  );

  constructor() {
    toObservable(this.days)
      .pipe(
        tap(() => this.loading.set(true)),
        switchMap((days) =>
          this.api.stats(days).pipe(
            catchError((err) => {
              this.error.set(extractError(err, 'Impossible de charger les statistiques.'));
              return of(null);
            }),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((stats) => {
        this.loading.set(false);
        if (stats) {
          this.error.set(null);
          this.stats.set(stats);
        }
      });
  }

  setDays(value: string) {
    this.days.set(Number(value));
  }

  share(value: string, max: number) {
    return Math.round((Number(value) / max) * 100);
  }

  exportCsv() {
    this.exporting.set(true);
    this.api.exportCsv().subscribe({
      next: () => this.exporting.set(false),
      error: (err) => {
        this.exporting.set(false);
        this.toast.error(extractError(err, "L'export a échoué."));
      },
    });
  }
}
