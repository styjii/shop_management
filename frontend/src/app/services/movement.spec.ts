import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../environments/environment';
import { MovementService } from './movement';

describe('MovementService', () => {
  const url = `${environment.apiUrl}/movements/`;
  let service: MovementService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(MovementService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('maps the filters to query parameters and omits the empty ones', () => {
    service.list({ product: 4, kind: 'OUT', page: 2 }).subscribe();
    const { params } = http.expectOne((r) => r.url === url).request;
    expect(params.get('product')).toBe('4');
    expect(params.get('kind')).toBe('OUT');
    expect(params.get('page')).toBe('2');

    service.list({ product: null, kind: '' }).subscribe();
    expect(http.expectOne((r) => r.url === url).request.params.keys()).toEqual([]);
  });

  it('posts a movement', () => {
    const body = { product: 1, kind: 'IN' as const, quantity: 5, reason: 'Livraison' };
    service.create(body).subscribe();
    const request = http.expectOne(url);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(body);
  });
});
