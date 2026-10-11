import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../environments/environment';
import { AppUser, Page, Role, UserPayload, UserStatus } from '../models/inventory';

export interface UserFilters {
  search?: string;
  status?: UserStatus | '';
  role?: Role | '';
  page?: number;
}

@Injectable({ providedIn: 'root' })
export class UserService {
  private http = inject(HttpClient);
  private url = `${environment.apiUrl}/users/`;

  list(filters: UserFilters) {
    let params = new HttpParams();
    if (filters.search) params = params.set('search', filters.search);
    if (filters.status) params = params.set('status', filters.status);
    if (filters.role) params = params.set('role', filters.role);
    if (filters.page) params = params.set('page', filters.page);
    return this.http.get<Page<AppUser>>(this.url, { params });
  }

  create(body: UserPayload) {
    return this.http.post<AppUser>(this.url, body);
  }

  update(id: number, body: Partial<UserPayload>) {
    return this.http.patch<AppUser>(`${this.url}${id}/`, body);
  }

  remove(id: number) {
    return this.http.delete<void>(`${this.url}${id}/`);
  }

  setPassword(id: number, newPassword: string) {
    return this.http.post<{ detail: string }>(`${this.url}${id}/set-password/`, {
      new_password: newPassword,
    });
  }
}
