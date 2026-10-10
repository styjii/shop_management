import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../environments/environment';
import { CategoryService } from './category';

describe('CategoryService', () => {
  const url = `${environment.apiUrl}/categories/`;
  let service: CategoryService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(CategoryService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists the categories', () => {
    const next = vi.fn();
    service.list().subscribe(next);
    http.expectOne(url).flush([{ id: 1, name: 'Boissons', description: '' }]);
    expect(next).toHaveBeenCalledWith([{ id: 1, name: 'Boissons', description: '' }]);
  });

  it('updates and deletes a category', () => {
    service.update(3, { name: 'Frais', description: 'Produits frais' }).subscribe();
    const update = http.expectOne(`${url}3/`);
    expect(update.request.method).toBe('PUT');
    expect(update.request.body).toEqual({ name: 'Frais', description: 'Produits frais' });
    service.remove(3).subscribe();
    expect(http.expectOne(`${url}3/`).request.method).toBe('DELETE');
  });

  it('creates a category from its name', () => {
    service.create({ name: 'Épicerie' }).subscribe();
    const request = http.expectOne(url);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ name: 'Épicerie' });
  });
});
