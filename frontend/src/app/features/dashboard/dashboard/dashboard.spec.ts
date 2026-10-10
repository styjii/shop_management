import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { environment } from '../../../../environments/environment';
import { makeProduct, makeSale, page } from '../../../../testing/factories';
import { Dashboard } from './dashboard';

describe('Dashboard', () => {
  const api = environment.apiUrl;

  const setup = () => {
    TestBed.configureTestingModule({
      imports: [Dashboard],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(Dashboard);
    fixture.detectChanges();
    return { http, fixture };
  };

  it('lists low-stock products, counts stock-outs and shows the latest sales', async () => {
    const { http, fixture } = setup();
    http
      .expectOne(`${api}/products/low-stock/`)
      .flush([
        makeProduct({ id: 1, name: 'Jus', quantity: 2, is_low_stock: true }),
        makeProduct({ id: 2, name: 'Riz', quantity: 0, is_low_stock: true }),
      ]);
    http.expectOne((r) => r.url === `${api}/sales/`).flush(page([makeSale({ id: 7 })], 12));
    await fixture.whenStable();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Jus');
    expect(text).toContain('Riz');
    expect(text).toContain('Vente n°7');
    expect(fixture.componentInstance.outOfStock()).toBe(1);
    expect(fixture.componentInstance.salesCount()).toBe(12);
    http.verify();
  });

  it('says so when nothing is low on stock', async () => {
    const { http, fixture } = setup();
    http.expectOne(`${api}/products/low-stock/`).flush([]);
    http.expectOne((r) => r.url === `${api}/sales/`).flush(page([]));
    await fixture.whenStable();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Aucune alerte');
    expect(text).toContain('Aucune vente');
  });
});
