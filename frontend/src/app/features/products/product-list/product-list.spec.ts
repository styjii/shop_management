import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  TestRequest,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { environment } from '../../../../environments/environment';
import { makeProduct, page } from '../../../../testing/factories';
import { AuthService } from '../../../core/auth';
import { ToastService } from '../../../core/toast';
import { ProductList } from './product-list';

describe('ProductList', () => {
  const api = environment.apiUrl;
  let http: HttpTestingController;

  const productRequests = () =>
    http.match((r) => r.url === `${api}/products/` && r.method === 'GET');

  const setup = async (manager = false) => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      imports: [ProductList],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    TestBed.inject(AuthService).user.set({ username: 'u', is_manager: manager });
    http = TestBed.inject(HttpTestingController);

    const fixture = TestBed.createComponent(ProductList);
    fixture.detectChanges();
    http.expectOne(`${api}/categories/`).flush([{ id: 1, name: 'Boissons', description: '' }]);
    const [first] = productRequests();
    first.flush(
      page(
        [
          makeProduct(),
          makeProduct({ id: 2, sku: 'JUICE-1', name: 'Jus', quantity: 0, is_low_stock: true }),
        ],
        2,
      ),
    );
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, first };
  };

  afterEach(() => vi.useRealTimers());

  it('loads the first page sorted by name and shows the products', async () => {
    const { fixture, first } = await setup();
    expect(first.request.params.get('ordering')).toBe('name');
    expect(first.request.params.get('page')).toBe('1');

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Eau minérale');
    expect(text).toContain('Jus');
    expect(text).toContain('Rupture');
    expect(text).toContain('2 produit(s)');
    http.verify();
  });

  it('hides edition buttons from sellers', async () => {
    const { fixture } = await setup(false);
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('Nouveau produit');
    expect(text).not.toContain('Modifier');
  });

  it('shows edition buttons to managers', async () => {
    const { fixture } = await setup(true);
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Nouveau produit');
    expect(text).toContain('Modifier');
    expect(text).toContain('Supprimer');
    expect(text).toContain('Stock');
  });

  it('searches after a short pause and goes back to the first page', async () => {
    const { fixture } = await setup();
    vi.useFakeTimers();
    fixture.componentInstance.filters.controls.search.setValue('eau');
    vi.advanceTimersByTime(300);
    fixture.detectChanges();
    await Promise.resolve();
    fixture.detectChanges();

    const requests: TestRequest[] = productRequests();
    expect(requests).toHaveLength(1);
    expect(requests[0].request.params.get('search')).toBe('eau');
    expect(requests[0].request.params.get('page')).toBe('1');
    requests[0].flush(page([makeProduct()], 1));
  });

  it('deletes a product after confirmation and reloads the list', async () => {
    const { fixture } = await setup(true);
    const toast = TestBed.inject(ToastService);

    fixture.componentInstance.askDelete(makeProduct());
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Supprimer ce produit ?');

    fixture.componentInstance.confirmDelete();
    http.expectOne(`${api}/products/1/`).flush(null, { status: 204, statusText: 'No Content' });
    fixture.detectChanges();
    await fixture.whenStable();

    expect(toast.toasts()[0].message).toContain('supprimé');
    expect(productRequests()).toHaveLength(1); // reload
  });

  it('reports the 409 returned for a product that is still used', async () => {
    const { fixture } = await setup(true);
    const toast = TestBed.inject(ToastService);

    fixture.componentInstance.askDelete(makeProduct());
    fixture.componentInstance.confirmDelete();
    http
      .expectOne(`${api}/products/1/`)
      .flush(
        { detail: 'Suppression impossible : cet élément est encore utilisé.' },
        { status: 409, statusText: 'Conflict' },
      );

    expect(toast.toasts()[0]).toMatchObject({ type: 'error' });
    expect(toast.toasts()[0].message).toContain('Suppression impossible');
  });

  it('paginates', async () => {
    const { fixture } = await setup();
    fixture.componentInstance.count.set(45);
    expect(fixture.componentInstance.pageCount()).toBe(3);

    fixture.componentInstance.goTo(2);
    fixture.detectChanges();
    await fixture.whenStable();
    const [request] = productRequests();
    expect(request.request.params.get('page')).toBe('2');
    request.flush(page([makeProduct()], 45));
  });
});
