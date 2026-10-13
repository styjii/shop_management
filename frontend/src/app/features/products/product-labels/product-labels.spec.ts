import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { environment } from '../../../../environments/environment';
import { makeProduct, page } from '../../../../testing/factories';
import { ProductLabels } from './product-labels';

describe('ProductLabels', () => {
  const api = environment.apiUrl;
  const water = makeProduct({ id: 1, name: 'Eau', barcode: '4006381333931' });
  const juice = makeProduct({ id: 2, name: 'Jus', barcode: '5901234123457' });
  let http: HttpTestingController;

  const requests = () => http.match((r) => r.url === `${api}/products/`);

  const setup = async (count = 2) => {
    TestBed.configureTestingModule({
      imports: [ProductLabels],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(ProductLabels);
    fixture.detectChanges();
    const [first] = requests();
    first.flush(page([water, juice], count));
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, first };
  };

  afterEach(() => vi.useRealTimers());

  it('asks only for active products that have a barcode, sorted by name', async () => {
    const { first } = await setup();
    expect(first.request.params.get('has_barcode')).toBe('true');
    expect(first.request.params.get('is_active')).toBe('true');
    expect(first.request.params.get('ordering')).toBe('name');
  });

  it('draws one label per product with its barcode, name and price', async () => {
    const { fixture } = await setup();
    const labels = (fixture.nativeElement as HTMLElement).querySelectorAll('figure');
    expect(labels).toHaveLength(2);
    expect(labels[0].textContent).toContain('Eau');
    expect(labels[0].textContent).toContain('4006381333931');
    expect(labels[0].querySelector('svg')).not.toBeNull();
    expect(labels[0].textContent).toMatch(/1[.,]50/);
  });

  it('searches after a pause and goes back to the first page', async () => {
    const { fixture } = await setup(45);
    fixture.componentInstance.goTo(2);
    fixture.detectChanges();
    requests()[0].flush(page([juice], 45));
    await fixture.whenStable();
    expect(fixture.componentInstance.page()).toBe(2);

    vi.useFakeTimers();
    fixture.componentInstance.search.setValue('eau');
    vi.advanceTimersByTime(300);
    fixture.detectChanges();
    const [request] = requests();
    expect(request.request.params.get('search')).toBe('eau');
    expect(request.request.params.get('page')).toBe('1');
    request.flush(page([water], 1));
  });

  it('keeps the search when changing page', async () => {
    const { fixture } = await setup(45);
    vi.useFakeTimers();
    fixture.componentInstance.search.setValue('eau');
    vi.advanceTimersByTime(300);
    fixture.detectChanges();
    requests()[0].flush(page([water], 45));

    fixture.componentInstance.goTo(2);
    fixture.detectChanges();
    const [request] = requests();
    expect(request.request.params.get('search')).toBe('eau');
    expect(request.request.params.get('page')).toBe('2');
    request.flush(page([water], 45));
  });

  it('ignores page numbers out of range', async () => {
    const { fixture } = await setup();
    fixture.componentInstance.goTo(0);
    fixture.componentInstance.goTo(9);
    expect(fixture.componentInstance.page()).toBe(1);
  });

  it('explains how to get labels when no product has a barcode', async () => {
    TestBed.configureTestingModule({
      imports: [ProductLabels],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(ProductLabels);
    fixture.detectChanges();
    requests()[0].flush(page([], 0));
    await fixture.whenStable();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Aucun produit avec un code-barres',
    );
  });

  it('prints the sheet', async () => {
    const { fixture } = await setup();
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    fixture.componentInstance.print();
    expect(print).toHaveBeenCalled();
  });
});
