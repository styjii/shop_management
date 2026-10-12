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
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    auth = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('keeps the access token in memory after a login and never stores a token in the browser', () => {
    auth.login('admin', 'secret').subscribe();
    const request = http.expectOne(`${api}/auth/token/`);
    expect(request.request.body).toEqual({ username: 'admin', password: 'secret' });
    expect(request.request.withCredentials).toBe(true); // the refresh cookie is set by the API
    request.flush({ access: 'a1' });

    expect(auth.isLoggedIn()).toBe(true);
    expect(auth.accessToken).toBe('a1');
    expect(sessionStorage.length).toBe(0);
    expect(localStorage.length).toBe(0);
  });

  it('clears the session, revokes the refresh cookie and goes to /login on logout', () => {
    auth.startSession('a1');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    auth.logout();

    const request = http.expectOne(`${api}/auth/logout/`);
    expect(request.request.withCredentials).toBe(true);
    expect(auth.isLoggedIn()).toBe(false);
    expect(auth.accessToken).toBeNull();
    expect(navigate).toHaveBeenCalledWith(['/login']);
    request.flush({});
  });

  it('loads the current user once and exposes the manager role', async () => {
    const first = firstValueFrom(auth.ensureUser());
    http.expectOne(`${api}/auth/me/`).flush(makeManager({ username: 'admin' }));
    await first;
    expect(auth.isManager()).toBe(true);

    await firstValueFrom(auth.ensureUser()); // cached: no new request (verified by http.verify)
  });

  it('shares one refresh request between concurrent callers', async () => {
    auth.startSession('old');

    const first = firstValueFrom(auth.refresh());
    const second = firstValueFrom(auth.refresh());
    const request = http.expectOne(`${api}/auth/refresh/`); // exactly one request
    expect(request.request.withCredentials).toBe(true);
    request.flush({ access: 'new' });

    expect(await first).toBe('new');
    expect(await second).toBe('new');
    expect(auth.accessToken).toBe('new');
  });

  it('restores the session at startup when the refresh cookie is valid', async () => {
    const restored = firstValueFrom(auth.restoreSession());
    http.expectOne(`${api}/auth/refresh/`).flush({ access: 'a2' });

    expect(await restored).toBe(true);
    expect(auth.isLoggedIn()).toBe(true);
    expect(auth.accessToken).toBe('a2');
  });

  it('stays logged out at startup when there is no valid refresh cookie', async () => {
    const restored = firstValueFrom(auth.restoreSession());
    http.expectOne(`${api}/auth/refresh/`).flush({}, { status: 401, statusText: 'Unauthorized' });

    expect(await restored).toBe(false);
    expect(auth.isLoggedIn()).toBe(false);
    expect(auth.accessToken).toBeNull();
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
