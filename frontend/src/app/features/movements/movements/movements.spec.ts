import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { environment } from '../../../../environments/environment';
import { makeMovement, makeProduct, page } from '../../../../testing/factories';
import { ToastService } from '../../../core/toast';
import { Movements } from './movements';

describe('Movements', () => {
  const api = environment.apiUrl;
  const water = makeProduct({ id: 1, name: 'Eau', quantity: 10 });
  const juice = makeProduct({ id: 2, name: 'Jus', sku: 'JUICE-1', quantity: 4 });
  let http: HttpTestingController;

  const movementList = () => http.match((r) => r.url === `${api}/movements/` && r.method === 'GET');
  const productList = () => http.match((r) => r.url === `${api}/products/` && r.method === 'GET');

  const setup = async (query: Record<string, string> = {}) => {
    TestBed.configureTestingModule({
      imports: [Movements],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap(query) } },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(Movements);
    fixture.detectChanges();

    const [first] = movementList();
    first.flush(page([makeMovement()]));
    productList()[0].flush(page([water, juice]));
    if (query['product']) {
      http.expectOne(`${api}/products/${query['product']}/`).flush(juice);
    }
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, first };
  };

  it('shows the history and the available products', async () => {
    const { fixture, first } = await setup();
    expect(first.request.params.get('page')).toBe('1');
    expect(first.request.params.has('product')).toBe(false);

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Livraison');
    expect(text).toContain('Entrée');
    expect(text).toContain('1 mouvement(s)');
    expect(fixture.componentInstance.candidates()).toHaveLength(2);
    http.verify();
  });

  it('opens on one product when the URL carries ?product=', async () => {
    const { fixture, first } = await setup({ product: '2' });
    expect(first.request.params.get('product')).toBe('2');
    expect(fixture.componentInstance.form.controls.product.value).toBe(2);
    expect(fixture.componentInstance.selected()?.name).toBe('Jus');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Produit : Jus');

    fixture.componentInstance.clearProductFilter();
    fixture.detectChanges();
    const [request] = movementList();
    expect(request.request.params.has('product')).toBe(false);
    request.flush(page([]));
  });

  it('shows the current stock of the selected product', async () => {
    const { fixture } = await setup();
    fixture.componentInstance.form.controls.product.setValue(1);
    fixture.detectChanges();
    expect(fixture.componentInstance.selected()?.name).toBe('Eau');
    const stock = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="current-stock"]',
    );
    expect(stock?.textContent).toContain('10');
  });

  it('filters the history by type and returns to the first page', async () => {
    const { fixture } = await setup();
    fixture.componentInstance.kindFilter.setValue('OUT');
    fixture.detectChanges();
    await fixture.whenStable();
    const [request] = movementList();
    expect(request.request.params.get('kind')).toBe('OUT');
    expect(request.request.params.get('page')).toBe('1');
    request.flush(page([]));
  });

  it('refuses an invalid movement without calling the API', async () => {
    const { fixture } = await setup();
    fixture.componentInstance.submit();
    fixture.detectChanges();
    http.expectNone(`${api}/movements/`);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Choisissez un produit.');
  });

  it('records a movement, then refreshes the stock and the history', async () => {
    const { fixture } = await setup();
    const component = fixture.componentInstance;
    component.form.setValue({ product: 1, kind: 'OUT', quantity: 3, reason: ' Casse ' });
    component.submit();

    const request = http.expectOne(`${api}/movements/`);
    expect(request.request.body).toEqual({ product: 1, kind: 'OUT', quantity: 3, reason: 'Casse' });
    request.flush(makeMovement({ kind: 'OUT', quantity: 3 }));

    http.expectOne(`${api}/products/1/`).flush({ ...water, quantity: 7 });
    expect(component.selected()?.quantity).toBe(7);
    expect(component.form.controls.quantity.value).toBe(1); // form reset for the next entry
    expect(TestBed.inject(ToastService).toasts()[0].type).toBe('success');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(movementList()).toHaveLength(1); // history reloaded
  });

  it('shows the error of a refused movement', async () => {
    const { fixture } = await setup();
    fixture.componentInstance.form.setValue({ product: 1, kind: 'OUT', quantity: 99, reason: '' });
    fixture.componentInstance.submit();

    http
      .expectOne(`${api}/movements/`)
      .flush(
        { quantity: ['Stock insuffisant pour « Eau ».'] },
        { status: 400, statusText: 'Bad Request' },
      );
    await fixture.whenStable();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Stock insuffisant pour « Eau ».',
    );
    expect(fixture.componentInstance.saving()).toBe(false);
  });
});
