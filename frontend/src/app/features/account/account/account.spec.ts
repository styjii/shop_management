import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { environment } from '../../../../environments/environment';
import { makeCurrentUser } from '../../../../testing/factories';
import { AuthService } from '../../../core/auth';
import { ToastService } from '../../../core/toast';
import { Account } from './account';

describe('Account', () => {
  const api = environment.apiUrl;
  let http: HttpTestingController;

  const setup = async (
    capabilities: ('manage_stock' | 'manage_catalog' | 'view_all_sales')[] = [],
  ) => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      imports: [Account],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
    const auth = TestBed.inject(AuthService);
    auth.user.set(makeCurrentUser({ first_name: 'Léa', capabilities }));
    const fixture = TestBed.createComponent(Account);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, auth };
  };

  it('shows the profile and the rights of the user', async () => {
    const { fixture } = await setup(['manage_stock']);
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('[data-testid="username"]')?.textContent).toContain('vendeur');
    expect(fixture.componentInstance.profileForm.getRawValue().first_name).toBe('Léa');

    const rights = Array.from(element.querySelectorAll('[data-testid="rights"] li'));
    const granted = rights.filter((li) => li.classList.contains('badge-success'));
    expect(granted.map((li) => li.textContent?.trim())).toEqual(['Gérer le stock']);
  });

  it('saves the profile and refreshes the displayed user', async () => {
    const { fixture, auth } = await setup();
    fixture.componentInstance.profileForm.setValue({
      email: 'nouvelle@example.com',
      first_name: 'Léa',
      last_name: 'Martin',
    });
    fixture.componentInstance.saveProfile();

    const request = http.expectOne(`${api}/auth/me/`);
    expect(request.request.method).toBe('PATCH');
    request.flush(makeCurrentUser({ email: 'nouvelle@example.com', last_name: 'Martin' }));

    expect(auth.user()?.email).toBe('nouvelle@example.com');
    expect(TestBed.inject(ToastService).toasts()[0].type).toBe('success');
  });

  it('shows the e-mail error returned by the API', async () => {
    const { fixture } = await setup();
    fixture.componentInstance.saveProfile();
    http
      .expectOne(`${api}/auth/me/`)
      .flush(
        { email: ['Cette adresse e-mail est déjà utilisée.'] },
        { status: 400, statusText: 'Bad Request' },
      );
    await fixture.whenStable();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('déjà utilisée');
  });

  it('changes the password then logs out because every session is revoked', async () => {
    const { fixture } = await setup();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture.componentInstance.passwordForm.setValue({
      old_password: 'Ancien-12345',
      new_password: 'Nouveau-12345',
      confirm: 'Nouveau-12345',
    });
    fixture.componentInstance.changePassword();

    http.expectOne(`${api}/auth/change-password/`).flush({ detail: 'Mot de passe modifié.' });
    expect(TestBed.inject(AuthService).isLoggedIn()).toBe(false);
    expect(navigate).toHaveBeenCalledWith(['/login']);
    http.match(`${api}/auth/logout/`); // no refresh token stored: nothing to blacklist
  });

  it('refuses a mismatching confirmation without calling the API', async () => {
    const { fixture } = await setup();
    fixture.componentInstance.passwordForm.setValue({
      old_password: 'Ancien-12345',
      new_password: 'Nouveau-12345',
      confirm: 'Autre-12345',
    });
    fixture.componentInstance.changePassword();
    http.expectNone(`${api}/auth/change-password/`);
  });

  it('shows a wrong current password', async () => {
    const { fixture } = await setup();
    fixture.componentInstance.passwordForm.setValue({
      old_password: 'faux-mot-de-passe',
      new_password: 'Nouveau-12345',
      confirm: 'Nouveau-12345',
    });
    fixture.componentInstance.changePassword();
    http
      .expectOne(`${api}/auth/change-password/`)
      .flush(
        { old_password: ['Le mot de passe actuel est incorrect.'] },
        { status: 400, statusText: 'Bad Request' },
      );
    await fixture.whenStable();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('actuel est incorrect');
    expect(TestBed.inject(AuthService).isLoggedIn()).toBe(false); // never logged in this test
  });
});
