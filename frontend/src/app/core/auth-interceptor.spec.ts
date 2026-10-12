import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { environment } from '../../environments/environment';
import { AuthService } from './auth';
import { authInterceptor } from './auth-interceptor';

describe('authInterceptor', () => {
  const api = environment.apiUrl;
  const unauthorized = { status: 401, statusText: 'Unauthorized' };
  let client: HttpClient;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    TestBed.inject(AuthService).startSession('old');
    client = TestBed.inject(HttpClient);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('adds the Bearer token to API calls, including /auth/me/', () => {
    client.get(`${api}/products/`).subscribe();
    client.get(`${api}/auth/me/`).subscribe();
    expect(http.expectOne(`${api}/products/`).request.headers.get('Authorization')).toBe(
      'Bearer old',
    );
    expect(http.expectOne(`${api}/auth/me/`).request.headers.get('Authorization')).toBe(
      'Bearer old',
    );
  });

  it('does not add the token to the public auth endpoints', () => {
    client.post(`${api}/auth/token/`, {}).subscribe();
    expect(http.expectOne(`${api}/auth/token/`).request.headers.has('Authorization')).toBe(false);
  });

  it('does not add the token to foreign URLs', () => {
    client.get('https://example.com/data').subscribe();
    expect(http.expectOne('https://example.com/data').request.headers.has('Authorization')).toBe(
      false,
    );
  });

  it('refreshes the token on a 401 and retries the request', () => {
    const next = vi.fn();
    client.get(`${api}/products/`).subscribe(next);

    http.expectOne(`${api}/products/`).flush({}, unauthorized);
    http.expectOne(`${api}/auth/refresh/`).flush({ access: 'new' });

    const retry = http.expectOne(`${api}/products/`);
    expect(retry.request.headers.get('Authorization')).toBe('Bearer new');
    retry.flush({ ok: true });
    expect(next).toHaveBeenCalledWith({ ok: true });
  });

  it('sends a single refresh request when several calls expire together', () => {
    client.get(`${api}/products/`).subscribe();
    client.get(`${api}/categories/`).subscribe();

    http.expectOne(`${api}/products/`).flush({}, unauthorized);
    http.expectOne(`${api}/categories/`).flush({}, unauthorized);
    http.expectOne(`${api}/auth/refresh/`).flush({ access: 'new' }); // expectOne: exactly one

    http.expectOne(`${api}/products/`).flush({});
    http.expectOne(`${api}/categories/`).flush({});
  });

  it('logs out when the refresh fails', () => {
    const error = vi.fn();
    client.get(`${api}/products/`).subscribe({ error });

    http.expectOne(`${api}/products/`).flush({}, unauthorized);
    http.expectOne(`${api}/auth/refresh/`).flush({}, unauthorized);
    http.expectOne(`${api}/auth/logout/`).flush({});

    expect(error).toHaveBeenCalled();
    expect(TestBed.inject(AuthService).isLoggedIn()).toBe(false);
  });

  it('does not try to refresh when nobody is logged in', () => {
    TestBed.inject(AuthService).isLoggedIn.set(false);
    const error = vi.fn();
    client.get(`${api}/products/`).subscribe({ error });

    http.expectOne(`${api}/products/`).flush({}, unauthorized);
    http.expectNone(`${api}/auth/refresh/`);
    expect(error).toHaveBeenCalled();
  });

  it('does not log out when the retried request fails for another reason', () => {
    const error = vi.fn();
    client.get(`${api}/products/`).subscribe({ error });

    http.expectOne(`${api}/products/`).flush({}, unauthorized);
    http.expectOne(`${api}/auth/refresh/`).flush({ access: 'new' });
    http
      .expectOne(`${api}/products/`)
      .flush({ detail: 'Interdit' }, { status: 403, statusText: 'Forbidden' });

    expect(error).toHaveBeenCalled();
    expect(TestBed.inject(AuthService).isLoggedIn()).toBe(true);
  });

  it('does not send the token to the registration and password reset endpoints', () => {
    for (const path of ['register/', 'password-reset/', 'password-reset/confirm/']) {
      client.post(`${api}/auth/${path}`, {}).subscribe();
      expect(http.expectOne(`${api}/auth/${path}`).request.headers.has('Authorization')).toBe(
        false,
      );
    }
  });

  it('sends the token to change-password', () => {
    client.post(`${api}/auth/change-password/`, {}).subscribe();
    expect(
      http.expectOne(`${api}/auth/change-password/`).request.headers.get('Authorization'),
    ).toBe('Bearer old');
  });
});
