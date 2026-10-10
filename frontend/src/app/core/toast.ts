import { Injectable, signal } from '@angular/core';

export type ToastType = 'success' | 'error' | 'info';

export interface Toast {
  id: number;
  type: ToastType;
  message: string;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<Toast[]>([]);
  private nextId = 1;

  show(message: string, type: ToastType = 'info', duration = 4000) {
    const id = this.nextId++;
    this.toasts.update((list) => [...list, { id, type, message }]);
    if (duration > 0) {
      setTimeout(() => this.dismiss(id), duration);
    }
  }

  success(message: string) {
    this.show(message, 'success');
  }

  error(message: string) {
    this.show(message, 'error', 6000);
  }

  dismiss(id: number) {
    this.toasts.update((list) => list.filter((toast) => toast.id !== id));
  }
}
