import { HttpErrorResponse } from '@angular/common/http';
import { extractError, fieldErrors } from './errors';

const httpError = (status: number, error: unknown) => new HttpErrorResponse({ status, error });

describe('extractError', () => {
  it('reads the detail of a DRF error', () => {
    expect(extractError(httpError(403, { detail: 'Accès refusé.' }))).toBe('Accès refusé.');
  });

  it('finds the first message of a nested validation error', () => {
    const error = httpError(400, { items: ['Stock insuffisant pour « Eau ».'] });
    expect(extractError(error)).toBe('Stock insuffisant pour « Eau ».');
    expect(extractError(httpError(400, { items: [{ quantity: ['Trop petit.'] }] }))).toBe(
      'Trop petit.',
    );
  });

  it('explains when the server is unreachable', () => {
    expect(extractError(httpError(0, null))).toBe('Impossible de joindre le serveur.');
  });

  it('falls back for unknown errors and HTML pages', () => {
    expect(extractError(new Error('boom'), 'Fallback')).toBe('Fallback');
    expect(extractError(httpError(500, '<html>' + 'x'.repeat(400) + '</html>'), 'Fallback')).toBe(
      'Fallback',
    );
  });
});

describe('fieldErrors', () => {
  it('keeps only fields with a list of messages', () => {
    const error = httpError(400, { sku: ['Déjà utilisé.'], detail: 'x', count: 3 });
    expect(fieldErrors(error)).toEqual({ sku: ['Déjà utilisé.'] });
  });

  it('returns an empty object for other errors', () => {
    expect(fieldErrors(new Error('boom'))).toEqual({});
    expect(fieldErrors(httpError(500, null))).toEqual({});
  });
});
