import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { environment } from '../../../../environments/environment';
import { makeManager, makeProduct, makeSupplier } from '../../../../testing/factories';
import { AuthService } from '../../../core/auth';
import { ToastService } from '../../../core/toast';
import { ProductForm } from './product-form';

describe('ProductForm', () => {
  const api = environment.apiUrl;
  const categories = [{ id: 1, name: 'Boissons', description: '' }];
  let http: HttpTestingController;
  let navigate: ReturnType<typeof vi.spyOn>;

  const setup = (id?: string, manager = false) => {
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
    if (manager) TestBed.inject(AuthService).user.set(makeManager());
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
      barcode: '',
      supplier: null,
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
      barcode: '',
      supplier: null,
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

  it('accepts an empty barcode and valid EAN-13, EAN-8 and UPC-A codes', () => {
    const control = setup().componentInstance.form.controls.barcode;
    for (const code of ['', '4006381333931', '73513537', '036000291452']) {
      control.setValue(code);
      expect(control.valid, code).toBe(true);
    }
  });

  it('refuses a barcode with a wrong check digit or a wrong length', () => {
    const fixture = setup();
    const control = fixture.componentInstance.form.controls.barcode;
    for (const code of ['4006381333932', '123', 'abcdefgh']) {
      control.setValue(code);
      expect(control.errors, code).toEqual({ gtin: true });
    }
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Code-barres invalide');
  });

  it('draws a preview of a valid barcode only', () => {
    const fixture = setup();
    const element = fixture.nativeElement as HTMLElement;
    fixture.componentInstance.form.controls.barcode.setValue('4006381333931');
    fixture.detectChanges();
    expect(element.querySelector('app-barcode svg')).not.toBeNull();
    fixture.componentInstance.form.controls.barcode.setValue('4006381333932');
    fixture.detectChanges();
    expect(element.querySelector('app-barcode svg')).toBeNull();
  });

  it('generates an in-store barcode from the API', () => {
    const fixture = setup();
    fixture.componentInstance.generateBarcode();
    http.expectOne(`${api}/products/next-barcode/`).flush({ barcode: '2000000000015' });
    expect(fixture.componentInstance.form.controls.barcode.value).toBe('2000000000015');
    expect(fixture.componentInstance.form.controls.barcode.valid).toBe(true);
  });

  it('shows an error toast when no barcode can be generated', () => {
    const fixture = setup();
    fixture.componentInstance.generateBarcode();
    http
      .expectOne(`${api}/products/next-barcode/`)
      .flush({ detail: 'Indisponible' }, { status: 500, statusText: 'Error' });
    expect(TestBed.inject(ToastService).toasts()[0].type).toBe('error');
    expect(fixture.componentInstance.generating()).toBe(false);
  });

  it('hides the supplier field without the stock right and keeps the product supplier', () => {
    const fixture = setup('3');
    http.expectNone(`${api}/suppliers/`);
    http
      .expectOne(`${api}/products/3/`)
      .flush(makeProduct({ id: 3, supplier: 5, supplier_name: 'X' }));
    fixture.detectChanges();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('select[aria-label="Fournisseur"]'),
    ).toBeNull();
    expect(fixture.componentInstance.form.controls.supplier.value).toBe(5);
  });

  it('lets a stock manager choose an active supplier', () => {
    const fixture = setup(undefined, true);
    http
      .expectOne(`${api}/suppliers/`)
      .flush([makeSupplier(), makeSupplier({ id: 2, name: 'Inactif', is_active: false })]);
    fixture.detectChanges();
    const options = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll(
        'select[aria-label="Fournisseur"] option',
      ),
    ).map((o) => o.textContent?.trim());
    expect(options).toEqual(['Aucun', 'Boissons SA']);
  });
});
