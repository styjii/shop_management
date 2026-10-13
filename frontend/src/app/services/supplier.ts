import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../environments/environment';
import { Supplier, SupplierPayload } from '../models/inventory';

@Injectable({ providedIn: 'root' })
export class SupplierService {
  private http = inject(HttpClient);
  private url = `${environment.apiUrl}/suppliers/`;

  /** The API does not paginate suppliers. */
  list() {
    return this.http.get<Supplier[]>(this.url);
  }

  create(body: SupplierPayload) {
    return this.http.post<Supplier>(this.url, body);
  }

  update(id: number, body: SupplierPayload) {
    return this.http.put<Supplier>(`${this.url}${id}/`, body);
  }

  remove(id: number) {
    return this.http.delete<void>(`${this.url}${id}/`);
  }
}
