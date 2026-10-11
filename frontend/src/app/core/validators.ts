import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/** Minimum length of a new password (same as the backend AUTH_PASSWORD_VALIDATORS). */
export const PASSWORD_MIN_LENGTH = 10;

/** Group validator: two fields must hold the same value (password and its confirmation). */
export function fieldsMatch(first: string, second: string): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const a = group.get(first)?.value;
    const b = group.get(second)?.value;
    return a === b ? null : { mismatch: true };
  };
}
