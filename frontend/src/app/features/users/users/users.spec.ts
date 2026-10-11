import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../../environments/environment';
import { makeAppUser, makeManager, page } from '../../../../testing/factories';
import { AuthService } from '../../../core/auth';
import { ToastService } from '../../../core/toast';
import { Users } from './users';

describe('Users', () => {
  const api = environment.apiUrl;
  const seller = makeAppUser();
  const pending = makeAppUser({
    id: 3,
    username: 'attente',
    first_name: '',
    last_name: '',
    email: 'attente@example.com',
    role: null,
    is_active: false,
    status: 'pending',
    last_login: null,
  });
  const root = makeAppUser({ id: 1, username: 'root', role: 'manager', is_protected: true });
  let http: HttpTestingController;

  const userRequests = () => http.match((r) => r.url === `${api}/users/` && r.method === 'GET');
  const text = (fixture: { nativeElement: unknown }) =>
    (fixture.nativeElement as HTMLElement).textContent ?? '';

  const setup = async () => {
    TestBed.configureTestingModule({
      imports: [Users],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    TestBed.inject(AuthService).user.set(makeManager());
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(Users);
    fixture.detectChanges();
    const [first] = userRequests();
    first.flush(page([root, seller, pending], 3));
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, first };
  };

  afterEach(() => vi.useRealTimers());

  it('lists the users with their role, status and individual rights', async () => {
    const { fixture } = await setup();
    const content = text(fixture);
    expect(content).toContain('Léa Martin');
    expect(content).toContain('attente');
    expect(content).toContain('En attente');
    expect(content).toContain('Protégé');
    expect(content).toContain('3 utilisateur(s)');
  });

  it('offers no action on a protected account and an Approve button on a pending one', async () => {
    const { fixture } = await setup();
    const rows = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr'));
    expect(rows[0].textContent).toContain('Géré depuis /admin/');
    expect(rows[0].textContent).not.toContain('Modifier');
    expect(rows[2].textContent).toContain('Approuver');
    expect(rows[2].textContent).toContain('Refuser');
  });

  it('filters by status after a short pause and goes back to the first page', async () => {
    const { fixture } = await setup();
    vi.useFakeTimers();
    fixture.componentInstance.filters.controls.status.setValue('pending');
    vi.advanceTimersByTime(300);
    fixture.detectChanges();
    await Promise.resolve();
    fixture.detectChanges();

    const [request] = userRequests();
    expect(request.request.params.get('status')).toBe('pending');
    expect(request.request.params.get('page')).toBe('1');
    request.flush(page([pending], 1));
  });

  it('creates a seller with individual rights', async () => {
    const { fixture } = await setup();
    const users = fixture.componentInstance;
    users.openCreate();
    fixture.detectChanges();
    expect(text(fixture)).toContain('Nouvel utilisateur');

    users.form.patchValue({
      username: 'marc',
      email: 'marc@example.com',
      password: 'Secret-12345',
      role: 'seller',
    });
    users.form.controls.capabilities.patchValue({ manage_stock: true, view_all_sales: true });
    users.save();

    const request = http.expectOne(`${api}/users/`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toMatchObject({
      username: 'marc',
      password: 'Secret-12345',
      role: 'seller',
      capabilities: ['manage_stock', 'view_all_sales'],
      is_active: true,
    });
    request.flush(makeAppUser({ id: 9, username: 'marc' }), { status: 201, statusText: 'Created' });

    expect(users.editing()).toBeNull();
    expect(TestBed.inject(ToastService).toasts()[0].message).toContain('créé');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(userRequests()).toHaveLength(1); // list reloaded
  });

  it('requires a username and a long enough password to create a user', async () => {
    const { fixture } = await setup();
    fixture.componentInstance.openCreate();
    fixture.componentInstance.form.patchValue({ email: 'marc@example.com', password: 'court' });
    fixture.componentInstance.save();
    http.expectNone(`${api}/users/`);
    expect(fixture.componentInstance.form.controls.username.invalid).toBe(true);
    expect(fixture.componentInstance.form.controls.password.invalid).toBe(true);
  });

  it('sends no individual rights for a manager', async () => {
    const { fixture } = await setup();
    const users = fixture.componentInstance;
    users.openCreate();
    users.form.patchValue({
      username: 'boss',
      email: 'boss@example.com',
      password: 'Secret-12345',
      role: 'manager',
    });
    users.form.controls.capabilities.patchValue({ manage_stock: true });
    users.save();
    expect(http.expectOne(`${api}/users/`).request.body.capabilities).toEqual([]);
  });

  it('approves a pending registration with a role and activates it', async () => {
    const { fixture } = await setup();
    const users = fixture.componentInstance;
    users.openEdit(pending);
    fixture.detectChanges();
    expect(text(fixture)).toContain('Approuver « attente »');
    expect(users.form.controls.is_active.value).toBe(true);
    expect(users.form.controls.role.value).toBe('seller');

    users.save();
    const request = http.expectOne(`${api}/users/3/`);
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toMatchObject({ role: 'seller', is_active: true });
    expect(request.request.body.username).toBeUndefined(); // fixed once created
    request.flush({ ...pending, role: 'seller', is_active: true, status: 'active' });
  });

  it('shows the errors of the API in the editor', async () => {
    const { fixture } = await setup();
    const users = fixture.componentInstance;
    users.openEdit(seller);
    users.save();
    http
      .expectOne(`${api}/users/2/`)
      .flush(
        { email: ['Cette adresse e-mail est déjà utilisée.'] },
        { status: 400, statusText: 'Bad Request' },
      );
    await fixture.whenStable();
    fixture.detectChanges();
    expect(text(fixture)).toContain('déjà utilisée');
    expect(users.editing()).not.toBeNull(); // stays open

    users.save();
    http
      .expectOne(`${api}/users/2/`)
      .flush(
        { non_field_errors: ['Il doit rester au moins un gestionnaire actif.'] },
        { status: 400, statusText: 'Bad Request' },
      );
    expect(users.generalError()).toBe('Il doit rester au moins un gestionnaire actif.');
  });

  it('deactivates and reactivates an account', async () => {
    const { fixture } = await setup();
    fixture.componentInstance.toggleActive(seller);
    const deactivate = http.expectOne(`${api}/users/2/`);
    expect(deactivate.request.body).toEqual({ is_active: false });
    deactivate.flush({ ...seller, is_active: false, status: 'inactive' });
    expect(TestBed.inject(ToastService).toasts()[0].message).toContain('désactivé');
  });

  it('opens the editor instead of reactivating an account that has no role', async () => {
    const { fixture } = await setup();
    fixture.componentInstance.toggleActive(pending);
    http.expectNone(`${api}/users/3/`);
    expect(fixture.componentInstance.editing()).toBe(pending);
  });

  it('reports a refused change with a toast', async () => {
    const { fixture } = await setup();
    fixture.componentInstance.toggleActive(seller);
    http
      .expectOne(`${api}/users/2/`)
      .flush(
        { non_field_errors: ['Il doit rester au moins un gestionnaire actif.'] },
        { status: 400, statusText: 'Bad Request' },
      );
    expect(TestBed.inject(ToastService).toasts()[0].type).toBe('error');
  });

  it('sets a new password', async () => {
    const { fixture } = await setup();
    const users = fixture.componentInstance;
    users.openPassword(seller);
    users.newPassword.setValue('court');
    users.savePassword();
    http.expectNone(`${api}/users/2/set-password/`);

    users.newPassword.setValue('Nouveau-12345');
    users.savePassword();
    const request = http.expectOne(`${api}/users/2/set-password/`);
    expect(request.request.body).toEqual({ new_password: 'Nouveau-12345' });
    request.flush({ detail: 'Mot de passe modifié.' });
    expect(users.passwordTarget()).toBeNull();
  });

  it('shows the password rules reported by the API', async () => {
    const { fixture } = await setup();
    const users = fixture.componentInstance;
    users.openPassword(seller);
    users.newPassword.setValue('Password1234');
    users.savePassword();
    http
      .expectOne(`${api}/users/2/set-password/`)
      .flush(
        { new_password: ['Ce mot de passe est trop courant.'] },
        { status: 400, statusText: 'Bad Request' },
      );
    expect(users.passwordErrors()).toEqual(['Ce mot de passe est trop courant.']);
  });

  it('refuses a pending account then reports an account that cannot be deleted', async () => {
    const { fixture } = await setup();
    const users = fixture.componentInstance;

    users.askDelete(pending);
    fixture.detectChanges();
    expect(text(fixture)).toContain('Refuser cette demande ?');
    users.confirmDelete();
    http.expectOne(`${api}/users/3/`).flush(null, { status: 204, statusText: 'No Content' });
    expect(TestBed.inject(ToastService).toasts()[0].message).toContain('supprimé');

    users.askDelete(seller);
    users.confirmDelete();
    http.expectOne(`${api}/users/2/`).flush(
      {
        detail:
          'Suppression impossible : ce compte a des ventes ou des mouvements de stock. Désactivez-le plutôt.',
      },
      { status: 409, statusText: 'Conflict' },
    );
    const toasts = TestBed.inject(ToastService).toasts();
    expect(toasts[toasts.length - 1]).toMatchObject({ type: 'error' });
    expect(toasts[toasts.length - 1].message).toContain('Désactivez-le');
  });
});
