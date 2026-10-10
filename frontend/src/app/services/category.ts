import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../environments/environment';
import { Category } from '../models/inventory';

@Injectable({ providedIn: 'root' })
export class CategoryService {
  private http = inject(HttpClient);
  private url = `${environment.apiUrl}/categories/`;

  /** The API does not paginate categories. */
  list() {
    return this.http.get<Category[]>(this.url);
  }

  create(name: string) {
    return this.http.post<Category>(this.url, { name });
  }
}
