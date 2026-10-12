import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, finalize, map, of, shareReplay, tap } from 'rxjs';
import { environment } from '../../environments/environment';
import { Capability, CurrentUser, ProfilePayload, RegisterPayload } from '../models/inventory';

interface AccessToken {
  access: string;
}

// Token storage, by design:
// - the access token (15 min) lives in memory only: it is gone when the tab closes or reloads;
// - the refresh token is an HttpOnly cookie set by the API: JavaScript can never read it, so an
//   XSS flaw cannot steal a long-lived session. The browser sends it to /api/auth/* only
//   (withCredentials), and the app restores the session at startup with restoreSession().
const WITH_COOKIE = { withCredentials: true };

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);
  private api = environment.apiUrl;
  private refreshing$: Observable<string> | null = null;

  private access: string | null = null;

  readonly isLoggedIn = signal(false);
  readonly user = signal<CurrentUser | null>(null);
  readonly isManager = computed(() => this.user()?.is_manager ?? false);

  /** Does the current user have this right? (Managers have them all.) */
  can(capability: Capability): boolean {
    const user = this.user();
    return !!user && (user.is_manager || user.capabilities.includes(capability));
  }

  get accessToken() {
    return this.access;
  }

  login(username: string, password: string) {
    return this.http
      .post<AccessToken>(`${this.api}/auth/token/`, { username, password }, WITH_COOKIE)
      .pipe(tap((token) => this.startSession(token.access)));
  }

  /**
   * Renew the access token with the refresh cookie. Concurrent calls share one request: the
   * backend rotates and blacklists refresh tokens, so a second call would be rejected.
   */
  refresh(): Observable<string> {
    if (this.refreshing$) {
      return this.refreshing$;
    }
    const request$ = this.http.post<AccessToken>(`${this.api}/auth/refresh/`, {}, WITH_COOKIE).pipe(
      tap((token) => this.startSession(token.access)),
      map((token) => token.access),
      finalize(() => (this.refreshing$ = null)),
      shareReplay(1),
    );
    this.refreshing$ = request$;
    return request$;
  }

  /** At startup: is there a valid refresh cookie? Emits true and logs in when there is. */
  restoreSession(): Observable<boolean> {
    return this.refresh().pipe(
      map(() => true),
      catchError(() => of(false)),
    );
  }

  /** Keep the access token in memory and mark the user as logged in. */
  startSession(access: string) {
    this.access = access;
    this.isLoggedIn.set(true);
  }

  register(body: RegisterPayload) {
    return this.http.post<{ detail: string }>(`${this.api}/auth/register/`, body);
  }

  requestPasswordReset(email: string) {
    return this.http.post<{ detail: string }>(`${this.api}/auth/password-reset/`, { email });
  }

  confirmPasswordReset(uid: string, token: string, newPassword: string) {
    return this.http.post<{ detail: string }>(`${this.api}/auth/password-reset/confirm/`, {
      uid,
      token,
      new_password: newPassword,
    });
  }

  /** The API revokes every refresh token: the caller must log out afterwards. */
  changePassword(oldPassword: string, newPassword: string) {
    return this.http.post<{ detail: string }>(`${this.api}/auth/change-password/`, {
      old_password: oldPassword,
      new_password: newPassword,
    });
  }

  updateProfile(body: ProfilePayload) {
    return this.http
      .patch<CurrentUser>(`${this.api}/auth/me/`, body)
      .pipe(tap((user) => this.user.set(user)));
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
    // The API revokes the refresh token of the cookie and deletes the cookie.
    this.http
      .post(`${this.api}/auth/logout/`, {}, WITH_COOKIE)
      .subscribe({ error: () => undefined });
    this.access = null;
    this.isLoggedIn.set(false);
    this.user.set(null);
    void this.router.navigate(['/login']);
  }
}
