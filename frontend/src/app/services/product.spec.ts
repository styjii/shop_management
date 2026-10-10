import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../environments/environment';
import { ProductPayload } from '../models/inventory';
import { ProductService } from './product';

describe('ProductService', () => {
  const url = `${environment.apiUrl}/products/`;
  const payload: ProductPayload = {
    sku: 'EAU-1',
    name: 'Eau',
    category: 1,
    price: 1.5,
    quantity: 10,
    low_stock_threshold: 5,
    is_active: true,
  };
  let service: ProductService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ProductService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('maps the filters to the API query parameters', () => {
    service
      .list({
        search: 'eau',
        category: 2,
        lowStock: true,
        isActive: true,
        ordering: '-price',
        page: 3,
      })
      .subscribe();
    const { params } = http.expectOne((r) => r.url === url).request;
    expect(params.get('search')).toBe('eau');
    expect(params.get('category')).toBe('2');
    expect(params.get('low_stock')).toBe('true');
    expect(params.get('is_active')).toBe('true');
    expect(params.get('ordering')).toBe('-price');
    expect(params.get('page')).toBe('3');
  });

  it('omits empty filters', () => {
    service.list({ search: '', category: null, lowStock: false }).subscribe();
    const { params } = http.expectOne((r) => r.url === url).request;
    expect(params.keys()).toEqual([]);
  });

  it('sends JSON when there is no image', () => {
    service.create(payload).subscribe();
    const request = http.expectOne(url);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(payload);
  });

  it('sends multipart data when an image is attached', () => {
    const image = new File(['x'], 'photo.png', { type: 'image/png' });
    service.update(4, payload, image).subscribe();
    const request = http.expectOne(`${url}4/`);
    expect(request.request.method).toBe('PUT');
    const body = request.request.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect(body.get('sku')).toBe('EAU-1');
    expect(body.get('price')).toBe('1.5');
    expect(body.get('is_active')).toBe('true');
    expect(body.get('image')).toBeInstanceOf(File);
  });

  it('calls get, remove and low-stock endpoints', () => {
    service.get(2).subscribe();
    expect(http.expectOne(`${url}2/`).request.method).toBe('GET');
    service.remove(2).subscribe();
    expect(http.expectOne(`${url}2/`).request.method).toBe('DELETE');
    service.lowStock().subscribe();
    expect(http.expectOne(`${url}low-stock/`).request.method).toBe('GET');
  });
});
