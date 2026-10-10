import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  RouterStateSnapshot,
  UrlTree,
  provideRouter,
} from '@angular/router';
import { Observable, firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth';
import { authGuard, guestGuard, managerGuard } from './auth-guard';

type GuardFn = typeof authGuard;

describe('guards', () => {
  const route = {} as ActivatedRouteSnapshot;
  const state = {} as RouterStateSnapshot;
  let auth: AuthService;

  const run = (guard: GuardFn) => TestBed.runInInjectionContext(() => guard(route, state));
  const urlOf = (result: unknown) => (result as UrlTree).toString();

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    auth = TestBed.inject(AuthService);
  });

  it('authGuard redirects anonymous users to /login', () => {
    expect(urlOf(run(authGuard))).toBe('/login');
    auth.isLoggedIn.set(true);
    expect(run(authGuard)).toBe(true);
  });

  it('guestGuard sends logged-in users to the home page', () => {
    expect(run(guestGuard)).toBe(true);
    auth.isLoggedIn.set(true);
    expect(urlOf(run(guestGuard))).toBe('/');
  });

  it('managerGuard lets managers in', async () => {
    auth.user.set({ username: 'chef', is_manager: true });
    expect(await firstValueFrom(run(managerGuard) as Observable<unknown>)).toBe(true);
  });

  it('managerGuard sends sellers back to the product list', async () => {
    auth.user.set({ username: 'vendeur', is_manager: false });
    const result = await firstValueFrom(run(managerGuard) as Observable<unknown>);
    expect(urlOf(result)).toBe('/products');
  });

  it('managerGuard sends users to /login when their profile cannot be loaded', async () => {
    const http = TestBed.inject(HttpTestingController);
    const result = firstValueFrom(run(managerGuard) as Observable<unknown>);
    http
      .expectOne(`${environment.apiUrl}/auth/me/`)
      .flush({}, { status: 500, statusText: 'Error' });
    expect(urlOf(await result)).toBe('/login');
  });
});
