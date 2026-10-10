import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { environment } from '../../../../environments/environment';
import { makeProduct } from '../../../../testing/factories';
import { ToastService } from '../../../core/toast';
import { ProductForm } from './product-form';

describe('ProductForm', () => {
  const api = environment.apiUrl;
  const categories = [{ id: 1, name: 'Boissons', description: '' }];
  let http: HttpTestingController;
  let navigate: ReturnType<typeof vi.spyOn>;

  const setup = (id?: string) => {
    TestBed.configureTestingModule({
      imports: [ProductForm],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap(id ? { id } : {}) } },
        },
      ],
    });
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(ProductForm);
    fixture.detectChanges();
    http.expectOne(`${api}/categories/`).flush(categories);
    return fixture;
  };

  const fillValid = (fixture: ReturnType<typeof setup>) =>
    fixture.componentInstance.form.setValue({
      sku: 'EAU-1',
      name: 'Eau',
      category: 1,
      price: 1.5,
      quantity: 10,
      low_stock_threshold: 5,
      is_active: true,
    });

  it('refuses to submit an invalid form', () => {
    const fixture = setup();
    fixture.componentInstance.save();
    fixture.detectChanges();
    http.expectNone(`${api}/products/`);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Le SKU est obligatoire');
  });

  it('creates a product and returns to the list', () => {
    const fixture = setup();
    fillValid(fixture);
    fixture.componentInstance.save();

    const request = http.expectOne(`${api}/products/`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      sku: 'EAU-1',
      name: 'Eau',
      category: 1,
      price: 1.5,
      quantity: 10,
      low_stock_threshold: 5,
      is_active: true,
    });
    request.flush(makeProduct());

    expect(navigate).toHaveBeenCalledWith(['/products']);
    expect(TestBed.inject(ToastService).toasts()[0].type).toBe('success');
  });

  it('shows the validation errors returned by the API under the field', async () => {
    const fixture = setup();
    fillValid(fixture);
    fixture.componentInstance.save();

    http
      .expectOne(`${api}/products/`)
      .flush(
        { sku: ['Un objet produit avec ce champ référence existe déjà.'] },
        { status: 400, statusText: 'Bad Request' },
      );
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('existe déjà');
    expect(fixture.componentInstance.saving()).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('loads the product to edit and updates it with PUT', () => {
    const fixture = setup('3');
    http
      .expectOne(`${api}/products/3/`)
      .flush(makeProduct({ id: 3, name: 'Eau gazeuse', price: '2.20' }));

    expect(fixture.componentInstance.form.getRawValue()).toMatchObject({
      name: 'Eau gazeuse',
      price: 2.2,
    });

    fixture.componentInstance.save();
    const request = http.expectOne(`${api}/products/3/`);
    expect(request.request.method).toBe('PUT');
    request.flush(makeProduct({ id: 3 }));
  });

  it('adds a category on the fly and selects it', () => {
    const fixture = setup();
    fixture.componentInstance.newCategory.setValue('Épicerie');
    fixture.componentInstance.addCategory();

    const request = http.expectOne(`${api}/categories/`);
    expect(request.request.body).toEqual({ name: 'Épicerie' });
    request.flush({ id: 2, name: 'Épicerie', description: '' });

    expect(fixture.componentInstance.form.controls.category.value).toBe(2);
    expect(fixture.componentInstance.categories().map((c) => c.name)).toEqual([
      'Boissons',
      'Épicerie',
    ]);
  });
});
