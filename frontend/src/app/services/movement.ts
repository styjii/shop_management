import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
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
  private url = `${environment.apiUrl}/movements/`;

  list(filters: MovementFilters) {
    let params = new HttpParams();
    if (filters.product) params = params.set('product', filters.product);
    if (filters.kind) params = params.set('kind', filters.kind);
    if (filters.page) params = params.set('page', filters.page);
    return this.http.get<Page<StockMovement>>(this.url, { params });
  }

  create(body: MovementPayload) {
    return this.http.post<StockMovement>(this.url, body);
  }
}
