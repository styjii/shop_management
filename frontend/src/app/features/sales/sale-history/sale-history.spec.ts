import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { environment } from '../../../../environments/environment';
import { makeSale, page } from '../../../../testing/factories';
import { AuthService } from '../../../core/auth';
import { SaleHistory } from './sale-history';

describe('SaleHistory', () => {
  const api = environment.apiUrl;
  let http: HttpTestingController;

  const salesRequests = () => http.match((r) => r.url === `${api}/sales/`);

  const setup = async (manager: boolean, count = 1) => {
    TestBed.configureTestingModule({
      imports: [SaleHistory],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    TestBed.inject(AuthService).user.set({ username: 'u', is_manager: manager });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(SaleHistory);
    fixture.detectChanges();
    salesRequests()[0].flush(page([makeSale({ id: 7 })], count));
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  };

  const text = (fixture: { nativeElement: unknown }) =>
    (fixture.nativeElement as HTMLElement).textContent ?? '';

  it('lists the sales with their total and item count', async () => {
    const fixture = await setup(true);
    expect(text(fixture)).toContain('n°7');
    expect(text(fixture)).toContain('vendeur');
    expect(fixture.componentInstance.itemCount(fixture.componentInstance.sales()[0])).toBe(3);
    http.verify();
  });

  it('tells sellers they only see their own sales and hides the seller column', async () => {
    const fixture = await setup(false);
    expect(text(fixture)).toContain('uniquement les vôtres');
    expect(text(fixture)).not.toContain('Vendeur');
  });

  it('expands and collapses the detail of a sale', async () => {
    const fixture = await setup(true);
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('[data-testid="sale-detail"]')).toBeNull();

    fixture.componentInstance.toggle(7);
    fixture.detectChanges();
    const detail = element.querySelector('[data-testid="sale-detail"]');
    expect(detail?.textContent).toContain('Eau minérale');
    expect(detail?.textContent).toContain('3 ×');

    fixture.componentInstance.toggle(7);
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="sale-detail"]')).toBeNull();
  });

  it('paginates', async () => {
    const fixture = await setup(true, 45);
    expect(fixture.componentInstance.pageCount()).toBe(3);
    fixture.componentInstance.goTo(2);
    fixture.detectChanges();
    await fixture.whenStable();
    const [request] = salesRequests();
    expect(request.request.params.get('page')).toBe('2');
    request.flush(page([], 45));
  });
});
