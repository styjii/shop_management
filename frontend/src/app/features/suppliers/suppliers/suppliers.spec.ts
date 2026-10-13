import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../../environments/environment';
import { makeSupplier } from '../../../../testing/factories';
import { ToastService } from '../../../core/toast';
import { Suppliers } from './suppliers';

describe('Suppliers', () => {
  const url = `${environment.apiUrl}/suppliers/`;
  let http: HttpTestingController;

  const setup = async (list = [makeSupplier()]) => {
    TestBed.configureTestingModule({
      imports: [Suppliers],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(Suppliers);
    fixture.detectChanges();
    http.expectOne(url).flush(list);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  };

  const text = (fixture: { nativeElement: unknown }) =>
    (fixture.nativeElement as HTMLElement).textContent ?? '';

  it('lists the suppliers with their status', async () => {
    const fixture = await setup([
      makeSupplier(),
      makeSupplier({ id: 2, name: 'Ancien', is_active: false }),
    ]);
    expect(text(fixture)).toContain('Boissons SA');
    expect(text(fixture)).toContain('2 fournisseur(s)');
    expect(text(fixture)).toContain('Inactif');
    http.verify();
  });

  it('refuses an empty name and an invalid e-mail', async () => {
    const fixture = await setup();
    fixture.componentInstance.form.patchValue({ email: 'pas-un-email' });
    fixture.componentInstance.save();
    fixture.detectChanges();
    http.expectNone(url);
    expect(text(fixture)).toContain('Le nom est obligatoire');
    expect(text(fixture)).toContain('Adresse e-mail invalide');
  });

  it('creates a supplier and reloads the list', async () => {
    const fixture = await setup();
    fixture.componentInstance.form.patchValue({ name: 'Épicerie fine', phone: '0102030405' });
    fixture.componentInstance.save();

    const request = http.expectOne(url);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toMatchObject({
      name: 'Épicerie fine',
      phone: '0102030405',
      is_active: true,
    });
    request.flush(makeSupplier({ id: 2, name: 'Épicerie fine' }));
    http.expectOne(url).flush([makeSupplier(), makeSupplier({ id: 2, name: 'Épicerie fine' })]);

    expect(fixture.componentInstance.suppliers()).toHaveLength(2);
    expect(TestBed.inject(ToastService).toasts()[0].message).toContain('ajouté');
  });

  it('shows the API validation error under the name', async () => {
    const fixture = await setup();
    fixture.componentInstance.form.patchValue({ name: 'Boissons SA' });
    fixture.componentInstance.save();
    http
      .expectOne(url)
      .flush(
        { name: ['Un fournisseur avec ce nom existe déjà.'] },
        { status: 400, statusText: 'Bad' },
      );
    fixture.detectChanges();
    expect(text(fixture)).toContain('existe déjà');
  });

  it('edits a supplier with PUT', async () => {
    const supplier = makeSupplier();
    const fixture = await setup([supplier]);
    fixture.componentInstance.edit(supplier);
    expect(fixture.componentInstance.form.controls.email.value).toBe('contact@boissons.example');
    fixture.componentInstance.form.patchValue({ phone: '0600000000' });
    fixture.componentInstance.save();

    const request = http.expectOne(`${url}1/`);
    expect(request.request.method).toBe('PUT');
    expect(request.request.body.phone).toBe('0600000000');
    request.flush({ ...supplier, phone: '0600000000' });
    http.expectOne(url).flush([supplier]);
    expect(fixture.componentInstance.editing()).toBeNull();
  });

  it('deletes after confirmation', async () => {
    const supplier = makeSupplier();
    const fixture = await setup([supplier]);
    fixture.componentInstance.askDelete(supplier);
    fixture.detectChanges();
    expect(text(fixture)).toContain('Supprimer ce fournisseur');

    fixture.componentInstance.confirmDelete();
    const request = http.expectOne(`${url}1/`);
    expect(request.request.method).toBe('DELETE');
    request.flush(null);
    http.expectOne(url).flush([]);
    expect(TestBed.inject(ToastService).toasts()[0].message).toContain('supprimé');
  });

  it('explains why a supplier with orders cannot be deleted', async () => {
    const supplier = makeSupplier();
    const fixture = await setup([supplier]);
    fixture.componentInstance.askDelete(supplier);
    fixture.componentInstance.confirmDelete();
    http
      .expectOne(`${url}1/`)
      .flush(
        { detail: 'Ce fournisseur est encore utilisé.' },
        { status: 409, statusText: 'Conflict' },
      );
    const toast = TestBed.inject(ToastService).toasts()[0];
    expect(toast.type).toBe('error');
    expect(toast.message).toContain('encore utilisé');
    expect(fixture.componentInstance.toDelete()).toBeNull();
  });
});
