import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../environments/environment';
import { DownloadService } from '../core/download';
import { ProductPayload } from '../models/inventory';
import { ProductService } from './product';

describe('ProductService', () => {
  const url = `${environment.apiUrl}/products/`;
  const payload: ProductPayload = {
    sku: 'EAU-1',
    name: 'Eau',
    category: 1,
    price: 1.5,
    low_stock_threshold: 5,
    barcode: '',
    supplier: null,
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

  it('maps the supplier, barcode and has-barcode filters', () => {
    service.list({ supplier: 4, barcode: '4006381333931', hasBarcode: true }).subscribe();
    const { params } = http.expectOne((r) => r.url === url).request;
    expect(params.get('supplier')).toBe('4');
    expect(params.get('barcode')).toBe('4006381333931');
    expect(params.get('has_barcode')).toBe('true');
  });

  it('finds a product by its exact barcode, or null', () => {
    const found = vi.fn();
    service.findByBarcode('4006381333931').subscribe(found);
    const request = http.expectOne((r) => r.url === url);
    expect(request.request.params.get('barcode')).toBe('4006381333931');
    expect(request.request.params.get('is_active')).toBe('true');
    request.flush({ count: 0, next: null, previous: null, results: [] });
    expect(found).toHaveBeenCalledWith(null);
  });

  it('asks the API for a free in-store barcode', () => {
    const received = vi.fn();
    service.nextBarcode().subscribe(received);
    http.expectOne(`${url}next-barcode/`).flush({ barcode: '2000000000015' });
    expect(received).toHaveBeenCalledWith({ barcode: '2000000000015' });
  });

  it('exports the filtered products without the page parameter', () => {
    const save = vi
      .spyOn(TestBed.inject(DownloadService), 'save')
      .mockImplementation(() => undefined);
    service.exportCsv({ search: 'eau', lowStock: true, page: 3 }).subscribe();
    const request = http.expectOne((r) => r.url === `${environment.apiUrl}/products/export/`);
    expect(request.request.responseType).toBe('blob');
    expect(request.request.params.get('search')).toBe('eau');
    expect(request.request.params.get('low_stock')).toBe('true');
    expect(request.request.params.has('page')).toBe(false);
    request.flush(new Blob(['a;b']));
    expect(save).toHaveBeenCalledWith(
      expect.any(Blob),
      expect.stringMatching(/^produits-\d{4}-\d{2}-\d{2}\.csv$/),
    );
  });

  it('sends null fields as empty values in multipart so that the API clears them', () => {
    const image = new File(['x'], 'photo.png', { type: 'image/png' });
    service.update(4, { ...payload, supplier: null }, image).subscribe();
    const body = http.expectOne(`${url}4/`).request.body as FormData;
    expect(body.get('supplier')).toBe('');
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
