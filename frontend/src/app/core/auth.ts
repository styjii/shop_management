import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, finalize, map, of, shareReplay, tap, throwError } from 'rxjs';
import { environment } from '../../environments/environment';
import { CurrentUser } from '../models/inventory';

interface Tokens {
  access: string;
  refresh: string;
}

const ACCESS_KEY = 'access';
const REFRESH_KEY = 'refresh';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);
  private api = environment.apiUrl;
  private refreshing$: Observable<string> | null = null;

  readonly isLoggedIn = signal(!!sessionStorage.getItem(ACCESS_KEY));
  readonly user = signal<CurrentUser | null>(null);
  readonly isManager = computed(() => this.user()?.is_manager ?? false);

  get accessToken() {
    return sessionStorage.getItem(ACCESS_KEY);
  }

  get refreshToken() {
    return sessionStorage.getItem(REFRESH_KEY);
  }

  login(username: string, password: string) {
    return this.http
      .post<Tokens>(`${this.api}/auth/token/`, { username, password })
      .pipe(tap((tokens) => this.store(tokens.access, tokens.refresh)));
  }

  /**
   * Renew the access token. Concurrent calls share one request: the backend
   * rotates and blacklists refresh tokens, so a second call would be rejected.
   */
  refresh(): Observable<string> {
    const refresh = this.refreshToken;
    if (!refresh) {
      return throwError(() => new Error('No refresh token'));
    }
    if (this.refreshing$) {
      return this.refreshing$;
    }
    const request$ = this.http
      .post<{ access: string; refresh?: string }>(`${this.api}/auth/refresh/`, { refresh })
      .pipe(
        tap((tokens) => this.store(tokens.access, tokens.refresh ?? refresh)),
        map((tokens) => tokens.access),
        finalize(() => (this.refreshing$ = null)),
        shareReplay(1),
      );
    this.refreshing$ = request$;
    return request$;
  }

  loadUser(): Observable<CurrentUser> {
    return this.http
      .get<CurrentUser>(`${this.api}/auth/me/`)
      .pipe(tap((user) => this.user.set(user)));
  }

  ensureUser(): Observable<CurrentUser> {
    const current = this.user();
    return current ? of(current) : this.loadUser();
  }

  logout() {
    const refresh = this.refreshToken;
    if (refresh) {
      this.http.post(`${this.api}/auth/logout/`, { refresh }).subscribe({ error: () => undefined });
    }
    sessionStorage.removeItem(ACCESS_KEY);
    sessionStorage.removeItem(REFRESH_KEY);
    this.isLoggedIn.set(false);
    this.user.set(null);
    void this.router.navigate(['/login']);
  }

  private store(access: string, refresh: string) {
    sessionStorage.setItem(ACCESS_KEY, access);
    sessionStorage.setItem(REFRESH_KEY, refresh);
    this.isLoggedIn.set(true);
  }
}
