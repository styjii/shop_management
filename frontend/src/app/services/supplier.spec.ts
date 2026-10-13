import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../environments/environment';
import { SupplierService } from './supplier';

describe('SupplierService', () => {
  const url = `${environment.apiUrl}/suppliers/`;
  const body = {
    name: 'Boissons SA',
    contact_name: '',
    email: '',
    phone: '',
    address: '',
    notes: '',
    is_active: true,
  };
  let service: SupplierService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(SupplierService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists, creates, updates and deletes suppliers', () => {
    service.list().subscribe();
    expect(http.expectOne(url).request.method).toBe('GET');
    service.create(body).subscribe();
    const created = http.expectOne(url);
    expect(created.request.method).toBe('POST');
    expect(created.request.body).toEqual(body);
    service.update(3, body).subscribe();
    expect(http.expectOne(`${url}3/`).request.method).toBe('PUT');
    service.remove(3).subscribe();
    expect(http.expectOne(`${url}3/`).request.method).toBe('DELETE');
  });
});
