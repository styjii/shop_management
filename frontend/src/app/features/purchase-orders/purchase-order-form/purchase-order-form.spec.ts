import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { environment } from '../../../../environments/environment';
import { makeOrder, makeProduct, makeSupplier } from '../../../../testing/factories';
import { ToastService } from '../../../core/toast';
import { PurchaseOrderForm, suggestedQuantity } from './purchase-order-form';

describe('suggestedQuantity', () => {
  it('brings the stock back to twice the alert threshold', () => {
    expect(suggestedQuantity({ quantity: 2, low_stock_threshold: 5 })).toBe(8);
    expect(suggestedQuantity({ quantity: 0, low_stock_threshold: 5 })).toBe(10);
  });

  it('orders at least one unit', () => {
    expect(suggestedQuantity({ quantity: 12, low_stock_threshold: 5 })).toBe(1);
    expect(suggestedQuantity({ quantity: 0, low_stock_threshold: 0 })).toBe(1);
  });
});

describe('PurchaseOrderForm', () => {
  const api = environment.apiUrl;
  const water = makeProduct({ id: 1, name: 'Eau', sku: 'WATER-1', supplier: 1, quantity: 2 });
  const juice = makeProduct({ id: 2, name: 'Jus', sku: 'JUICE-1', supplier: 1, quantity: 9 });
  const other = makeProduct({ id: 3, name: 'Vin', sku: 'WINE-1', supplier: 2, quantity: 0 });
  let http: HttpTestingController;
  let navigate: ReturnType<typeof vi.spyOn>;

  const setup = (id?: string) => {
    TestBed.configureTestingModule({
      imports: [PurchaseOrderForm],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap(id ? { id } : {}) } },
        },
      ],
    });
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(PurchaseOrderForm);
    fixture.detectChanges();
    http
      .expectOne(`${api}/suppliers/`)
      .flush([makeSupplier(), makeSupplier({ id: 3, name: 'Fermé', is_active: false })]);
    return fixture;
  };

  const text = (fixture: { nativeElement: unknown }) =>
    (fixture.nativeElement as HTMLElement).textContent ?? '';

  it('only offers the active suppliers', () => {
    const fixture = setup();
    expect(fixture.componentInstance.suppliers().map((s) => s.name)).toEqual(['Boissons SA']);
  });

  it('refuses to save without supplier or lines', () => {
    const fixture = setup();
    fixture.componentInstance.save();
    fixture.detectChanges();
    http.expectNone(`${api}/purchase-orders/`);
    expect(text(fixture)).toContain('Choisissez un fournisseur');
    expect(text(fixture)).toContain('Ajoutez au moins un produit');
  });

  it('adds a product once and removes it', () => {
    const fixture = setup();
    fixture.componentInstance.addProduct(water);
    fixture.componentInstance.addProduct(water);
    expect(fixture.componentInstance.lines.length).toBe(1);
    fixture.componentInstance.removeLine(0);
    expect(fixture.componentInstance.lines.length).toBe(0);
  });

  it('computes the total from quantities and prices', () => {
    const fixture = setup();
    fixture.componentInstance.addProduct(water);
    fixture.componentInstance.addProduct(juice);
    const [first, second] = fixture.componentInstance.lines.controls;
    first.patchValue({ quantity: 20, unit_cost: 0.8 });
    second.patchValue({ quantity: 10, unit_cost: 1.5 });
    expect(fixture.componentInstance.total()).toBeCloseTo(31, 5);
    fixture.detectChanges();
    expect(text(fixture)).toMatch(/31[.,]00/);
  });

  it('marks a zero quantity or a negative price as invalid', () => {
    const fixture = setup();
    fixture.componentInstance.addProduct(water);
    const line = fixture.componentInstance.lines.controls[0];
    line.patchValue({ quantity: 0 });
    expect(line.controls.quantity.invalid).toBe(true);
    line.patchValue({ quantity: 1, unit_cost: -1 });
    expect(line.controls.unit_cost.invalid).toBe(true);
  });

  it('adds the low-stock products of the chosen supplier with a suggested quantity', () => {
    const fixture = setup();
    fixture.componentInstance.form.controls.supplier.setValue(1);
    fixture.componentInstance.addLowStock();
    http.expectOne(`${api}/products/low-stock/`).flush([water, other, { ...juice, quantity: 1 }]);

    const lines = fixture.componentInstance.lines.getRawValue();
    expect(lines.map((l) => l.product)).toEqual([1, 2]); // not the other supplier's product
    expect(lines[0].quantity).toBe(8); // 2 × 5 − 2
    expect(lines[0].unit_cost).toBe(0);
    expect(TestBed.inject(ToastService).toasts()[0].message).toContain('2 produit(s)');
  });

  it('says when no low-stock product belongs to the supplier', () => {
    const fixture = setup();
    fixture.componentInstance.form.controls.supplier.setValue(1);
    fixture.componentInstance.addLowStock();
    http.expectOne(`${api}/products/low-stock/`).flush([other]);
    expect(fixture.componentInstance.lines.length).toBe(0);
    expect(TestBed.inject(ToastService).toasts()[0].message).toContain(
      'Aucun produit en stock bas',
    );
  });

  it('does nothing without a supplier', () => {
    const fixture = setup();
    fixture.componentInstance.addLowStock();
    http.expectNone(`${api}/products/low-stock/`);
  });

  it('creates the draft and opens it', () => {
    const fixture = setup();
    fixture.componentInstance.form.patchValue({
      supplier: 1,
      expected_date: '2026-11-01',
      notes: 'Matin',
    });
    fixture.componentInstance.addProduct(water);
    fixture.componentInstance.lines.controls[0].patchValue({ quantity: 20, unit_cost: 0.8 });
    fixture.componentInstance.save();

    const request = http.expectOne(`${api}/purchase-orders/`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      supplier: 1,
      expected_date: '2026-11-01',
      notes: 'Matin',
      lines: [{ product: 1, quantity: 20, unit_cost: 0.8 }],
    });
    request.flush(makeOrder({ id: 12, reference: 'BC-00012' }));
    expect(navigate).toHaveBeenCalledWith(['/purchase-orders', 12]);
    expect(TestBed.inject(ToastService).toasts()[0].message).toContain('BC-00012');
  });

  it('sends no date when none is chosen', () => {
    const fixture = setup();
    fixture.componentInstance.form.patchValue({ supplier: 1 });
    fixture.componentInstance.addProduct(water);
    fixture.componentInstance.save();
    expect(http.expectOne(`${api}/purchase-orders/`).request.body.expected_date).toBeNull();
  });

  it('shows the API error about the lines', () => {
    const fixture = setup();
    fixture.componentInstance.form.patchValue({ supplier: 1 });
    fixture.componentInstance.addProduct(water);
    fixture.componentInstance.save();
    http
      .expectOne(`${api}/purchase-orders/`)
      .flush(
        { lines: ["Le produit « Eau » n'est plus en vente."] },
        { status: 400, statusText: 'Bad Request' },
      );
    fixture.detectChanges();
    expect(text(fixture)).toContain("n'est plus en vente");
    expect(navigate).not.toHaveBeenCalled();
  });

  it('loads a draft to edit it and updates it with PUT', () => {
    const fixture = setup('7');
    http.expectOne(`${api}/purchase-orders/7/`).flush(makeOrder());
    fixture.detectChanges();

    expect(fixture.componentInstance.form.controls.supplier.value).toBe(1);
    expect(fixture.componentInstance.lines.length).toBe(1);
    expect(fixture.componentInstance.total()).toBeCloseTo(16, 5);

    fixture.componentInstance.save();
    const request = http.expectOne(`${api}/purchase-orders/7/`);
    expect(request.request.method).toBe('PUT');
    request.flush(makeOrder());
    expect(navigate).toHaveBeenCalledWith(['/purchase-orders', 7]);
  });

  it('refuses to edit an order that is not a draft', () => {
    const fixture = setup('7');
    http.expectOne(`${api}/purchase-orders/7/`).flush(makeOrder({ status: 'SENT' }));
    fixture.detectChanges();
    expect(text(fixture)).toContain('Seul un bon de commande en brouillon peut être modifié');
    expect(fixture.componentInstance.lines.length).toBe(0);
  });

  it('searches products after a pause and ignores very short searches', () => {
    vi.useFakeTimers();
    try {
      const fixture = setup();
      fixture.componentInstance.productSearch.setValue('e');
      vi.advanceTimersByTime(300);
      http.expectNone((r) => r.url === `${api}/products/`);

      fixture.componentInstance.productSearch.setValue('eau');
      vi.advanceTimersByTime(300);
      const request = http.expectOne((r) => r.url === `${api}/products/`);
      expect(request.request.params.get('search')).toBe('eau');
      request.flush({ count: 1, next: null, previous: null, results: [water] });
      expect(fixture.componentInstance.candidates()).toEqual([water]);

      fixture.componentInstance.addProduct(water);
      expect(fixture.componentInstance.candidates()).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });
});
