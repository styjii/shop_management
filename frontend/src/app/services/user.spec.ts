import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../environments/environment';
import { UserService } from './user';

describe('UserService', () => {
  const url = `${environment.apiUrl}/users/`;
  let service: UserService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(UserService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('maps the filters to query parameters and omits the empty ones', () => {
    service.list({ search: 'lea', status: 'pending', role: 'seller', page: 2 }).subscribe();
    const { params } = http.expectOne((r) => r.url === url).request;
    expect(params.get('search')).toBe('lea');
    expect(params.get('status')).toBe('pending');
    expect(params.get('role')).toBe('seller');
    expect(params.get('page')).toBe('2');

    service.list({ search: '', status: '', role: '' }).subscribe();
    expect(http.expectOne((r) => r.url === url).request.params.keys()).toEqual([]);
  });

  it('creates, patches and deletes a user', () => {
    const body = {
      username: 'marc',
      email: 'marc@example.com',
      first_name: '',
      last_name: '',
      password: 'Secret-12345',
      role: 'seller' as const,
      capabilities: [],
      is_active: true,
    };
    service.create(body).subscribe();
    const created = http.expectOne(url);
    expect(created.request.method).toBe('POST');
    expect(created.request.body).toEqual(body);

    service.update(5, { is_active: false }).subscribe();
    const patched = http.expectOne(`${url}5/`);
    expect(patched.request.method).toBe('PATCH');
    expect(patched.request.body).toEqual({ is_active: false });

    service.remove(5).subscribe();
    expect(http.expectOne(`${url}5/`).request.method).toBe('DELETE');
  });

  it('sets a new password for a user', () => {
    service.setPassword(5, 'Nouveau-12345').subscribe();
    const request = http.expectOne(`${url}5/set-password/`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ new_password: 'Nouveau-12345' });
  });
});
