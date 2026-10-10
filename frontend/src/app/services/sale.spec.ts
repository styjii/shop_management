import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../environments/environment';
import { SaleService } from './sale';

describe('SaleService', () => {
  const url = `${environment.apiUrl}/sales/`;
  let service: SaleService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(SaleService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('posts the sale lines only (the server computes prices and total)', () => {
    service.create([{ product: 1, quantity: 2 }]).subscribe();
    const request = http.expectOne(url);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ items: [{ product: 1, quantity: 2 }] });
  });

  it('lists a page of sales', () => {
    service.list(2).subscribe();
    const request = http.expectOne((r) => r.url === url);
    expect(request.request.params.get('page')).toBe('2');
  });
});
