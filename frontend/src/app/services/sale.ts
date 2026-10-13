import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../environments/environment';
import { DownloadService } from '../core/download';
import { Page, Sale, SaleLine, SalesStats } from '../models/inventory';

@Injectable({ providedIn: 'root' })
export class SaleService {
  private http = inject(HttpClient);
  private download = inject(DownloadService);
  private url = `${environment.apiUrl}/sales/`;

  list(page = 1) {
    return this.http.get<Page<Sale>>(this.url, { params: new HttpParams().set('page', page) });
  }

  create(items: SaleLine[]) {
    return this.http.post<Sale>(this.url, { items });
  }

  /** Totals, daily revenue and rankings over the last `days` days. */
  stats(days: number) {
    return this.http.get<SalesStats>(`${this.url}stats/`, {
      params: new HttpParams().set('days', days),
    });
  }

  /** CSV with one row per sold line (a seller only gets their own sales). */
  exportCsv() {
    return this.download.csv('sales', 'ventes');
  }
}
