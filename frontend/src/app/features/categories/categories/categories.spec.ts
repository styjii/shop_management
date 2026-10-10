import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../../environments/environment';
import { ToastService } from '../../../core/toast';
import { Categories } from './categories';

describe('Categories', () => {
  const url = `${environment.apiUrl}/categories/`;
  const drinks = { id: 1, name: 'Boissons', description: 'Eaux et jus' };
  let http: HttpTestingController;

  const setup = async () => {
    TestBed.configureTestingModule({
      imports: [Categories],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(Categories);
    fixture.detectChanges();
    http.expectOne(url).flush([drinks]);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  };

  it('lists the categories', async () => {
    const fixture = await setup();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Boissons');
    expect(text).toContain('1 catégorie(s)');
    http.verify();
  });

  it('refuses an empty name', async () => {
    const fixture = await setup();
    fixture.componentInstance.save();
    fixture.detectChanges();
    http.expectNone(url);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Le nom est obligatoire');
  });

  it('creates a category and reloads the list', async () => {
    const fixture = await setup();
    fixture.componentInstance.form.setValue({ name: 'Épicerie', description: '' });
    fixture.componentInstance.save();

    const request = http.expectOne(url);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ name: 'Épicerie', description: '' });
    request.flush({ id: 2, name: 'Épicerie', description: '' });

    http.expectOne(url).flush([drinks, { id: 2, name: 'Épicerie', description: '' }]);
    expect(fixture.componentInstance.categories()).toHaveLength(2);
    expect(TestBed.inject(ToastService).toasts()[0].message).toContain('ajoutée');
  });

  it('edits a category with PUT', async () => {
    const fixture = await setup();
    fixture.componentInstance.edit(drinks);
    expect(fixture.componentInstance.form.getRawValue()).toEqual({
      name: 'Boissons',
      description: 'Eaux et jus',
    });

    fixture.componentInstance.form.patchValue({ name: 'Boissons fraîches' });
    fixture.componentInstance.save();
    const request = http.expectOne(`${url}1/`);
    expect(request.request.method).toBe('PUT');
    request.flush({ ...drinks, name: 'Boissons fraîches' });
    http.expectOne(url).flush([{ ...drinks, name: 'Boissons fraîches' }]);

    expect(fixture.componentInstance.editing()).toBeNull();
    expect(TestBed.inject(ToastService).toasts()[0].message).toContain('modifiée');
  });

  it('shows the validation error returned by the API under the field', async () => {
    const fixture = await setup();
    fixture.componentInstance.form.setValue({ name: 'Boissons', description: '' });
    fixture.componentInstance.save();
    http
      .expectOne(url)
      .flush(
        { name: ['Une catégorie avec ce nom existe déjà.'] },
        { status: 400, statusText: 'Bad Request' },
      );
    await fixture.whenStable();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('existe déjà');
  });

  it('deletes after confirmation', async () => {
    const fixture = await setup();
    fixture.componentInstance.askDelete(drinks);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Supprimer cette catégorie ?',
    );

    fixture.componentInstance.confirmDelete();
    http.expectOne(`${url}1/`).flush(null, { status: 204, statusText: 'No Content' });
    http.expectOne(url).flush([]);
    expect(TestBed.inject(ToastService).toasts()[0].message).toContain('supprimée');
  });

  it('reports the 409 returned for a category that still has products', async () => {
    const fixture = await setup();
    fixture.componentInstance.askDelete(drinks);
    fixture.componentInstance.confirmDelete();
    http
      .expectOne(`${url}1/`)
      .flush(
        { detail: 'Suppression impossible : cet élément est encore utilisé.' },
        { status: 409, statusText: 'Conflict' },
      );
    const toast = TestBed.inject(ToastService).toasts()[0];
    expect(toast.type).toBe('error');
    expect(toast.message).toContain('Suppression impossible');
    expect(fixture.componentInstance.categories()).toHaveLength(1);
  });
});
