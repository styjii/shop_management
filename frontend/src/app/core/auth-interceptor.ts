import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth';

// Endpoints that must be called without a Bearer token (an expired one would make the
// API answer 401 even though they are public). /auth/me/ and /auth/change-password/ are NOT
// in this list: they need the token.
const PUBLIC_AUTH_URL = /\/auth\/(token|refresh|logout|register|password-reset(\/confirm)?)\/?$/;

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const isApi = req.url.startsWith(environment.apiUrl);
  const isPublic = PUBLIC_AUTH_URL.test(req.url);

  const withToken = (request: HttpRequest<unknown>, token: string) =>
    request.clone({ setHeaders: { Authorization: `Bearer ${token}` } });

  const token = auth.accessToken;
  const request = isApi && !isPublic && token ? withToken(req, token) : req;

  return next(request).pipe(
    catchError((err: unknown) => {
      const expired = err instanceof HttpErrorResponse && err.status === 401;
      if (expired && isApi && !isPublic && auth.isLoggedIn()) {
        return auth.refresh().pipe(
          catchError((refreshError) => {
            auth.logout();
            return throwError(() => refreshError);
          }),
          switchMap((newToken) => next(withToken(req, newToken))),
        );
      }
      return throwError(() => err);
    }),
  );
};
