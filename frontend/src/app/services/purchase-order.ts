import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { DownloadService } from '../core/download';
import { environment } from '../../environments/environment';
import { OrderStatus, Page, PurchaseOrder, PurchaseOrderPayload } from '../models/inventory';

export interface OrderFilters {
  status?: OrderStatus | '';
  page?: number;
}

@Injectable({ providedIn: 'root' })
export class PurchaseOrderService {
  private http = inject(HttpClient);
  private download = inject(DownloadService);
  private url = `${environment.apiUrl}/purchase-orders/`;

  list(filters: OrderFilters) {
    return this.http.get<Page<PurchaseOrder>>(this.url, { params: this.params(filters) });
  }

  get(id: number) {
    return this.http.get<PurchaseOrder>(`${this.url}${id}/`);
  }

  create(body: PurchaseOrderPayload) {
    return this.http.post<PurchaseOrder>(this.url, body);
  }

  /** Only a draft can be updated. */
  update(id: number, body: PurchaseOrderPayload) {
    return this.http.put<PurchaseOrder>(`${this.url}${id}/`, body);
  }

  remove(id: number) {
    return this.http.delete<void>(`${this.url}${id}/`);
  }

  send(id: number) {
    return this.http.post<PurchaseOrder>(`${this.url}${id}/send/`, {});
  }

  /** Receiving adds every line to the stock (done by the API, atomically). */
  receive(id: number) {
    return this.http.post<PurchaseOrder>(`${this.url}${id}/receive/`, {});
  }

  cancel(id: number) {
    return this.http.post<PurchaseOrder>(`${this.url}${id}/cancel/`, {});
  }

  exportCsv(filters: OrderFilters) {
    return this.download.csv(
      'purchase-orders',
      'bons-de-commande',
      this.params({ ...filters, page: undefined }),
    );
  }

  private params(filters: OrderFilters) {
    let params = new HttpParams();
    if (filters.status) params = params.set('status', filters.status);
    if (filters.page) params = params.set('page', filters.page);
    return params;
  }
}
