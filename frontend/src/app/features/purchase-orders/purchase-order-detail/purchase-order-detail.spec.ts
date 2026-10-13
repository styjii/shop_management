import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { environment } from '../../../../environments/environment';
import { makeOrder } from '../../../../testing/factories';
import { ToastService } from '../../../core/toast';
import { PurchaseOrder } from '../../../models/inventory';
import { PurchaseOrderDetail } from './purchase-order-detail';

describe('PurchaseOrderDetail', () => {
  const url = `${environment.apiUrl}/purchase-orders/7/`;
  let http: HttpTestingController;
  let navigate: ReturnType<typeof vi.spyOn>;

  const setup = (order: PurchaseOrder = makeOrder()) => {
    TestBed.configureTestingModule({
      imports: [PurchaseOrderDetail],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ id: '7' }) } },
        },
      ],
    });
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(PurchaseOrderDetail);
    fixture.detectChanges();
    http.expectOne(url).flush(order);
    fixture.detectChanges();
    return fixture;
  };

  const text = (fixture: { nativeElement: unknown }) =>
    (fixture.nativeElement as HTMLElement).textContent ?? '';
  const buttons = (fixture: { nativeElement: unknown }) =>
    Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button, a')).map((b) =>
      b.textContent?.trim(),
    );

  it('shows the lines, the total and the status', () => {
    const fixture = setup();
    expect(text(fixture)).toContain('BC-00007');
    expect(text(fixture)).toContain('Eau minérale');
    expect(text(fixture)).toContain('Brouillon');
    expect(text(fixture)).toMatch(/16[.,]00/);
  });

  it('offers every action on a draft', () => {
    const labels = buttons(setup());
    for (const label of [
      'Modifier',
      'Supprimer',
      'Marquer comme envoyé',
      'Annuler',
      'Réceptionner',
    ]) {
      expect(labels, label).toContain(label);
    }
  });

  it('offers only receive and cancel on a sent order', () => {
    const labels = buttons(setup(makeOrder({ status: 'SENT' })));
    expect(labels).toContain('Réceptionner');
    expect(labels).toContain('Annuler');
    expect(labels).not.toContain('Modifier');
    expect(labels).not.toContain('Supprimer');
  });

  it('offers no action on a received or cancelled order', () => {
    for (const status of ['RECEIVED', 'CANCELLED'] as const) {
      TestBed.resetTestingModule();
      const labels = buttons(setup(makeOrder({ status })));
      expect(labels, status).not.toContain('Réceptionner');
      expect(labels, status).not.toContain('Annuler');
      expect(labels, status).not.toContain('Modifier');
    }
  });

  it('asks for confirmation before receiving, then updates the stock through the API', () => {
    const fixture = setup(makeOrder({ status: 'SENT' }));
    fixture.componentInstance.ask('receive');
    fixture.detectChanges();
    expect(text(fixture)).toContain('Réceptionner la marchandise');
    http.expectNone(`${url}receive/`);

    fixture.componentInstance.confirm();
    const request = http.expectOne(`${url}receive/`);
    expect(request.request.method).toBe('POST');
    request.flush(makeOrder({ status: 'RECEIVED', received_at: '2026-10-12T10:00:00Z' }));
    fixture.detectChanges();

    expect(fixture.componentInstance.order()?.status).toBe('RECEIVED');
    expect(fixture.componentInstance.confirming()).toBeNull();
    expect(TestBed.inject(ToastService).toasts()[0].message).toContain('stock a été mis à jour');
  });

  it('sends and cancels', () => {
    const fixture = setup();
    fixture.componentInstance.ask('send');
    fixture.componentInstance.confirm();
    http.expectOne(`${url}send/`).flush(makeOrder({ status: 'SENT' }));
    expect(fixture.componentInstance.order()?.status).toBe('SENT');

    fixture.componentInstance.ask('cancel');
    fixture.componentInstance.confirm();
    http.expectOne(`${url}cancel/`).flush(makeOrder({ status: 'CANCELLED' }));
    expect(fixture.componentInstance.order()?.status).toBe('CANCELLED');
  });

  it('can dismiss the confirmation without calling the API', () => {
    const fixture = setup();
    fixture.componentInstance.ask('delete');
    fixture.componentInstance.dismiss();
    expect(fixture.componentInstance.confirming()).toBeNull();
    http.verify();
  });

  it('deletes a draft and goes back to the list', () => {
    const fixture = setup();
    fixture.componentInstance.ask('delete');
    fixture.componentInstance.confirm();
    const request = http.expectOne(url);
    expect(request.request.method).toBe('DELETE');
    request.flush(null);
    expect(navigate).toHaveBeenCalledWith(['/purchase-orders']);
  });

  it('shows the API refusal and keeps the order unchanged', () => {
    const fixture = setup(makeOrder({ status: 'SENT' }));
    fixture.componentInstance.ask('receive');
    fixture.componentInstance.confirm();
    http
      .expectOne(`${url}receive/`)
      .flush({ detail: 'Ce bon est déjà reçu.' }, { status: 409, statusText: 'Conflict' });
    expect(TestBed.inject(ToastService).toasts()[0].message).toContain('déjà reçu');
    expect(fixture.componentInstance.order()?.status).toBe('SENT');
    expect(fixture.componentInstance.working()).toBe(false);
  });

  it('shows an error for an unknown order', () => {
    TestBed.configureTestingModule({
      imports: [PurchaseOrderDetail],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ id: '7' }) } },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(PurchaseOrderDetail);
    fixture.detectChanges();
    http.expectOne(url).flush({ detail: 'Introuvable.' }, { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();
    expect(text(fixture)).toContain('Introuvable');
  });

  it('prints the order', () => {
    const fixture = setup();
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    fixture.componentInstance.print();
    expect(print).toHaveBeenCalled();
  });
});
