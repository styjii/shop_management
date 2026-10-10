import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../../environments/environment';
import { makeProduct, makeSale, page } from '../../../../testing/factories';
import { ToastService } from '../../../core/toast';
import { SalePos } from './sale-pos';

describe('SalePos', () => {
  const api = environment.apiUrl;
  const water = makeProduct({ id: 1, name: 'Eau', price: '1.50', quantity: 3 });
  const juice = makeProduct({ id: 2, name: 'Jus', price: '2.10', quantity: 5 });
  let http: HttpTestingController;

  const productRequests = () =>
    http.match((r) => r.url === `${api}/products/` && r.method === 'GET');

  const setup = async () => {
    TestBed.configureTestingModule({
      imports: [SalePos],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(SalePos);
    fixture.detectChanges();
    const [first] = productRequests();
    first.flush(page([water, juice]));
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, first };
  };

  it('loads the active products', async () => {
    const { fixture, first } = await setup();
    expect(first.request.params.get('is_active')).toBe('true');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Eau');
    http.verify();
  });

  it('builds the cart and computes the total without rounding errors', async () => {
    const { fixture } = await setup();
    const pos = fixture.componentInstance;
    pos.add(water);
    pos.add(water);
    pos.add(juice);

    expect(pos.cart()).toHaveLength(2);
    expect(pos.total()).toBe(5.1); // 2 × 1,50 + 2,10
    fixture.detectChanges();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-testid="total"]')?.textContent,
    ).toMatch(/5[.,]10/);
  });

  it('never puts more items in the cart than the stock available', async () => {
    const { fixture } = await setup();
    const pos = fixture.componentInstance;
    for (let i = 0; i < 10; i++) pos.add(water);
    expect(pos.quantityInCart(water)).toBe(3);
    expect(pos.canAdd(water)).toBe(false);
  });

  it('decreases and removes lines', async () => {
    const { fixture } = await setup();
    const pos = fixture.componentInstance;
    pos.add(water);
    pos.add(water);
    pos.decrease(pos.cart()[0]);
    expect(pos.quantityInCart(water)).toBe(1);
    pos.decrease(pos.cart()[0]);
    expect(pos.cart()).toHaveLength(0);
  });

  it('sends the sale, empties the cart and refreshes the stock', async () => {
    const { fixture } = await setup();
    const pos = fixture.componentInstance;
    pos.add(water);
    pos.add(water);
    pos.validate();

    const request = http.expectOne(`${api}/sales/`);
    expect(request.request.body).toEqual({ items: [{ product: 1, quantity: 2 }] });
    request.flush(makeSale({ id: 9 }));

    expect(pos.cart()).toHaveLength(0);
    expect(TestBed.inject(ToastService).toasts()[0].message).toContain('Vente n°9');
    productRequests()[0].flush(page([makeProduct({ ...water, quantity: 1 })]));
  });

  it('shows the message of a refused sale', async () => {
    const { fixture } = await setup();
    const pos = fixture.componentInstance;
    pos.add(water);
    pos.validate();

    http
      .expectOne(`${api}/sales/`)
      .flush(
        { items: ['Stock insuffisant pour « Eau ».'] },
        { status: 400, statusText: 'Bad Request' },
      );
    productRequests()[0].flush(page([water]));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(pos.error()).toBe('Stock insuffisant pour « Eau ».');
    expect(pos.cart()).toHaveLength(1); // the cart is kept so the user can adjust it
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Stock insuffisant');
  });

  it('does nothing when the cart is empty', async () => {
    const { fixture } = await setup();
    fixture.componentInstance.validate();
    http.expectNone(`${api}/sales/`);
  });
});
