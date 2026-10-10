import { TestBed } from '@angular/core/testing';
import { ToastService } from './toast';

describe('ToastService', () => {
  afterEach(() => vi.useRealTimers());

  it('shows then automatically dismisses a toast', () => {
    vi.useFakeTimers();
    const toasts = TestBed.inject(ToastService);
    toasts.success('Enregistré');
    expect(toasts.toasts()).toHaveLength(1);
    expect(toasts.toasts()[0]).toMatchObject({ type: 'success', message: 'Enregistré' });
    vi.advanceTimersByTime(4000);
    expect(toasts.toasts()).toHaveLength(0);
  });

  it('can dismiss a toast manually', () => {
    const toasts = TestBed.inject(ToastService);
    toasts.show('Info', 'info', 0);
    toasts.dismiss(toasts.toasts()[0].id);
    expect(toasts.toasts()).toHaveLength(0);
  });
});
