import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../environments/environment';
import { Page, Sale, SaleLine } from '../models/inventory';

@Injectable({ providedIn: 'root' })
export class SaleService {
  private http = inject(HttpClient);
  private url = `${environment.apiUrl}/sales/`;

  list(page = 1) {
    return this.http.get<Page<Sale>>(this.url, { params: new HttpParams().set('page', page) });
  }

  create(items: SaleLine[]) {
    return this.http.post<Sale>(this.url, { items });
  }
}
