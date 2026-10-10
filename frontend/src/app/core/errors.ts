import { HttpErrorResponse } from '@angular/common/http';

const MAX_MESSAGE_LENGTH = 300; // longer strings are HTML error pages, not messages

/** First human-readable message found in a DRF error payload. */
function firstMessage(value: unknown): string | null {
  if (typeof value === 'string') {
    return value.length <= MAX_MESSAGE_LENGTH ? value : null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const message = firstMessage(item);
      if (message) return message;
    }
    return null;
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if ('detail' in record) {
      const message = firstMessage(record['detail']);
      if (message) return message;
    }
    for (const nested of Object.values(record)) {
      const message = firstMessage(nested);
      if (message) return message;
    }
  }
  return null;
}

export function extractError(err: unknown, fallback = 'Une erreur est survenue.'): string {
  if (!(err instanceof HttpErrorResponse)) return fallback;
  if (err.status === 0) return 'Impossible de joindre le serveur.';
  return firstMessage(err.error) ?? fallback;
}

/** Field errors of a DRF validation response: { sku: ['message'], ... } */
export function fieldErrors(err: unknown): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  if (err instanceof HttpErrorResponse && err.error && typeof err.error === 'object') {
    for (const [field, value] of Object.entries(err.error as Record<string, unknown>)) {
      if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
        result[field] = value as string[];
      }
    }
  }
  return result;
}
