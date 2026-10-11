import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { environment } from '../../../../environments/environment';
import { makeManager, makeProduct, makeSale, page } from '../../../../testing/factories';
import { AuthService } from '../../../core/auth';
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

  it('offers a restocking link to managers only', async () => {
    const { http, fixture } = setup();
    TestBed.inject(AuthService).user.set(makeManager());
    http
      .expectOne(`${api}/products/low-stock/`)
      .flush([makeProduct({ quantity: 1, is_low_stock: true })]);
    http.expectOne((r) => r.url === `${api}/sales/`).flush(page([]));
    await fixture.whenStable();
    fixture.detectChanges();
    const link = (fixture.nativeElement as HTMLElement).querySelector('a[href*="/movements"]');
    expect(link?.textContent).toContain('Réapprovisionner');
    expect(link?.getAttribute('href')).toContain('product=1');
  });

  it('tells managers how many registrations are waiting for approval', async () => {
    const { http, fixture } = setup();
    TestBed.inject(AuthService).user.set(makeManager());
    http.expectOne(`${api}/products/low-stock/`).flush([]);
    http.expectOne((r) => r.url === `${api}/sales/`).flush(page([]));
    fixture.detectChanges();
    await fixture.whenStable();

    const request = http.expectOne((r) => r.url === `${api}/users/`);
    expect(request.request.params.get('status')).toBe('pending');
    request.flush(page([], 3));
    await fixture.whenStable();
    fixture.detectChanges();

    const banner = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="pending-accounts"]',
    );
    expect(banner?.textContent).toContain('3 compte(s) en attente');
  });

  it('does not ask sellers for pending accounts', async () => {
    const { http, fixture } = setup();
    http.expectOne(`${api}/products/low-stock/`).flush([]);
    http.expectOne((r) => r.url === `${api}/sales/`).flush(page([]));
    fixture.detectChanges();
    await fixture.whenStable();
    http.expectNone((r) => r.url === `${api}/users/`);
  });
});
