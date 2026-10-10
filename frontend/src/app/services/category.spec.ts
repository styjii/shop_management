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

  it('creates a category from its name', () => {
    service.create('Épicerie').subscribe();
    const request = http.expectOne(url);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ name: 'Épicerie' });
  });
});
