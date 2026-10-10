import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../environments/environment';
import { Category, CategoryPayload } from '../models/inventory';

@Injectable({ providedIn: 'root' })
export class CategoryService {
  private http = inject(HttpClient);
  private url = `${environment.apiUrl}/categories/`;

  /** The API does not paginate categories. */
  list() {
    return this.http.get<Category[]>(this.url);
  }

  create(body: CategoryPayload) {
    return this.http.post<Category>(this.url, body);
  }

  update(id: number, body: CategoryPayload) {
    return this.http.put<Category>(`${this.url}${id}/`, body);
  }

  remove(id: number) {
    return this.http.delete<void>(`${this.url}${id}/`);
  }
}
