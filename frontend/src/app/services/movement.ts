import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { DownloadService } from '../core/download';
import { environment } from '../../environments/environment';
import { MovementKind, MovementPayload, Page, StockMovement } from '../models/inventory';

export interface MovementFilters {
  product?: number | null;
  kind?: MovementKind | '';
  page?: number;
}

@Injectable({ providedIn: 'root' })
export class MovementService {
  private http = inject(HttpClient);
  private download = inject(DownloadService);
  private url = `${environment.apiUrl}/movements/`;

  list(filters: MovementFilters) {
    return this.http.get<Page<StockMovement>>(this.url, { params: this.params(filters) });
  }

  /** CSV of the movements matching the filters (all pages). */
  exportCsv(filters: MovementFilters) {
    return this.download.csv(
      'movements',
      'mouvements',
      this.params({ ...filters, page: undefined }),
    );
  }

  private params(filters: MovementFilters) {
    let params = new HttpParams();
    if (filters.product) params = params.set('product', filters.product);
    if (filters.kind) params = params.set('kind', filters.kind);
    if (filters.page) params = params.set('page', filters.page);
    return params;
  }

  create(body: MovementPayload) {
    return this.http.post<StockMovement>(this.url, body);
  }
}
