import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { Capability } from '../models/inventory';
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

/** Routes reserved for the manager role (user management): cannot be delegated. */
export const managerGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.ensureUser().pipe(
    map((user) => (user.is_manager ? true : router.createUrlTree(['/products']))),
    catchError(() => of(router.createUrlTree(['/login']))),
  );
};

/** Routes that need one individual right (managers always have it). */
export const capabilityGuard =
  (capability: Capability): CanActivateFn =>
  () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    return auth.ensureUser().pipe(
      map(() => (auth.can(capability) ? true : router.createUrlTree(['/dashboard']))),
      catchError(() => of(router.createUrlTree(['/login']))),
    );
  };
