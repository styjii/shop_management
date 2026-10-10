import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../environments/environment';
import { Page, Product, ProductPayload } from '../models/inventory';

export interface ProductFilters {
  search?: string;
  category?: number | null;
  lowStock?: boolean;
  isActive?: boolean;
  ordering?: string;
  page?: number;
}

@Injectable({ providedIn: 'root' })
export class ProductService {
  private http = inject(HttpClient);
  private url = `${environment.apiUrl}/products/`;

  list(filters: ProductFilters) {
    let params = new HttpParams();
    if (filters.search) params = params.set('search', filters.search);
    if (filters.category) params = params.set('category', filters.category);
    if (filters.lowStock) params = params.set('low_stock', true);
    if (filters.isActive !== undefined) params = params.set('is_active', filters.isActive);
    if (filters.ordering) params = params.set('ordering', filters.ordering);
    if (filters.page) params = params.set('page', filters.page);
    return this.http.get<Page<Product>>(this.url, { params });
  }

  get(id: number) {
    return this.http.get<Product>(`${this.url}${id}/`);
  }

  create(body: ProductPayload, image?: File | null) {
    return this.http.post<Product>(this.url, this.toBody(body, image));
  }

  update(id: number, body: ProductPayload, image?: File | null) {
    return this.http.put<Product>(`${this.url}${id}/`, this.toBody(body, image));
  }

  remove(id: number) {
    return this.http.delete<void>(`${this.url}${id}/`);
  }

  lowStock() {
    return this.http.get<Product[]>(`${this.url}low-stock/`);
  }

  /** JSON by default, multipart only when an image file is attached. */
  private toBody(body: ProductPayload, image?: File | null): ProductPayload | FormData {
    if (!image) return body;
    const form = new FormData();
    for (const [key, value] of Object.entries(body)) {
      if (value !== null && value !== undefined) form.append(key, String(value));
    }
    form.append('image', image);
    return form;
  }
}
