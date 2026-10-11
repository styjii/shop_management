import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth';
import { makeCurrentUser, makeManager } from '../../testing/factories';

describe('AuthService', () => {
  const api = environment.apiUrl;
  let auth: AuthService;
  let http: HttpTestingController;

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    auth = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('stores the tokens after a login', () => {
    auth.login('admin', 'secret').subscribe();
    const request = http.expectOne(`${api}/auth/token/`);
    expect(request.request.body).toEqual({ username: 'admin', password: 'secret' });
    request.flush({ access: 'a1', refresh: 'r1' });

    expect(auth.isLoggedIn()).toBe(true);
    expect(auth.accessToken).toBe('a1');
    expect(auth.refreshToken).toBe('r1');
  });

  it('clears the session, blacklists the refresh token and goes to /login on logout', () => {
    sessionStorage.setItem('access', 'a1');
    sessionStorage.setItem('refresh', 'r1');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    auth.logout();

    expect(http.expectOne(`${api}/auth/logout/`).request.body).toEqual({ refresh: 'r1' });
    expect(auth.isLoggedIn()).toBe(false);
    expect(auth.accessToken).toBeNull();
    expect(navigate).toHaveBeenCalledWith(['/login']);
  });

  it('loads the current user once and exposes the manager role', async () => {
    const first = firstValueFrom(auth.ensureUser());
    http.expectOne(`${api}/auth/me/`).flush(makeManager({ username: 'admin' }));
    await first;
    expect(auth.isManager()).toBe(true);

    await firstValueFrom(auth.ensureUser()); // cached: no new request (verified by http.verify)
  });

  it('shares one refresh request between concurrent callers', async () => {
    sessionStorage.setItem('access', 'old');
    sessionStorage.setItem('refresh', 'r1');

    const first = firstValueFrom(auth.refresh());
    const second = firstValueFrom(auth.refresh());
    http.expectOne(`${api}/auth/refresh/`).flush({ access: 'new', refresh: 'r2' });

    expect(await first).toBe('new');
    expect(await second).toBe('new');
    expect(auth.refreshToken).toBe('r2');
  });

  it('fails to refresh without a refresh token', async () => {
    await expect(firstValueFrom(auth.refresh())).rejects.toThrow('No refresh token');
  });

  it('can() gives managers every right and sellers only the granted ones', () => {
    expect(auth.can('manage_stock')).toBe(false); // nobody loaded yet
    auth.user.set(makeManager());
    expect(auth.can('manage_catalog')).toBe(true);
    auth.user.set(makeCurrentUser({ capabilities: ['manage_stock'] }));
    expect(auth.can('manage_stock')).toBe(true);
    expect(auth.can('manage_catalog')).toBe(false);
  });

  it('registers an account', () => {
    auth
      .register({ username: 'nouveau', email: 'n@example.com', password: 'Secret-12345' })
      .subscribe();
    const request = http.expectOne(`${api}/auth/register/`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toMatchObject({ username: 'nouveau', email: 'n@example.com' });
  });

  it('requests and confirms a password reset', () => {
    auth.requestPasswordReset('a@example.com').subscribe();
    expect(http.expectOne(`${api}/auth/password-reset/`).request.body).toEqual({
      email: 'a@example.com',
    });

    auth.confirmPasswordReset('uid1', 'tok1', 'Nouveau-12345').subscribe();
    expect(http.expectOne(`${api}/auth/password-reset/confirm/`).request.body).toEqual({
      uid: 'uid1',
      token: 'tok1',
      new_password: 'Nouveau-12345',
    });
  });

  it('changes the password with the old one', () => {
    auth.changePassword('ancien', 'Nouveau-12345').subscribe();
    expect(http.expectOne(`${api}/auth/change-password/`).request.body).toEqual({
      old_password: 'ancien',
      new_password: 'Nouveau-12345',
    });
  });

  it('updates the profile and refreshes the current user', () => {
    auth.updateProfile({ email: 'new@example.com', first_name: 'Léa', last_name: '' }).subscribe();
    const request = http.expectOne(`${api}/auth/me/`);
    expect(request.request.method).toBe('PATCH');
    request.flush(makeCurrentUser({ email: 'new@example.com', first_name: 'Léa' }));
    expect(auth.user()?.email).toBe('new@example.com');
  });
});
