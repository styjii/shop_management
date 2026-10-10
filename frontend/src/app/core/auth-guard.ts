import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { AuthService } from './auth';

/** Routes that require a logged-in user. (UX only: the API enforces the real rules.) */
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.isLoggedIn() ? true : inject(Router).createUrlTree(['/login']);
};

/** The login page is useless for someone who is already logged in. */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.isLoggedIn() ? inject(Router).createUrlTree(['/']) : true;
};

/** Routes reserved for managers (product creation and edition). */
export const managerGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.ensureUser().pipe(
    map((user) => (user.is_manager ? true : router.createUrlTree(['/products']))),
    catchError(() => of(router.createUrlTree(['/login']))),
  );
};
