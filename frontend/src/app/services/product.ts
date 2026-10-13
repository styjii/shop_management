import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';
import { DownloadService } from '../core/download';
import { environment } from '../../environments/environment';
import { Page, Product, ProductPayload } from '../models/inventory';

export interface ProductFilters {
  search?: string;
  category?: number | null;
  supplier?: number | null;
  barcode?: string;
  hasBarcode?: boolean;
  lowStock?: boolean;
  isActive?: boolean;
  ordering?: string;
  page?: number;
}

@Injectable({ providedIn: 'root' })
export class ProductService {
  private http = inject(HttpClient);
  private download = inject(DownloadService);
  private url = `${environment.apiUrl}/products/`;

  list(filters: ProductFilters) {
    return this.http.get<Page<Product>>(this.url, { params: this.params(filters) });
  }

  /** The product with this exact barcode (cash register scan), or null. */
  findByBarcode(barcode: string) {
    return this.list({ barcode, isActive: true }).pipe(map((page) => page.results[0] ?? null));
  }

  /** A free in-store EAN-13 for a product without a manufacturer code. */
  nextBarcode() {
    return this.http.get<{ barcode: string }>(`${this.url}next-barcode/`);
  }

  /** CSV of the products matching the filters (all pages). */
  exportCsv(filters: ProductFilters) {
    return this.download.csv('products', 'produits', this.params({ ...filters, page: undefined }));
  }

  private params(filters: ProductFilters) {
    let params = new HttpParams();
    if (filters.search) params = params.set('search', filters.search);
    if (filters.category) params = params.set('category', filters.category);
    if (filters.supplier) params = params.set('supplier', filters.supplier);
    if (filters.barcode) params = params.set('barcode', filters.barcode);
    if (filters.hasBarcode) params = params.set('has_barcode', true);
    if (filters.lowStock) params = params.set('low_stock', true);
    if (filters.isActive !== undefined) params = params.set('is_active', filters.isActive);
    if (filters.ordering) params = params.set('ordering', filters.ordering);
    if (filters.page) params = params.set('page', filters.page);
    return params;
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
      // null is sent as an empty value so that the API clears the field (supplier, barcode)
      if (value !== undefined) form.append(key, value === null ? '' : String(value));
    }
    form.append('image', image);
    return form;
  }
}
