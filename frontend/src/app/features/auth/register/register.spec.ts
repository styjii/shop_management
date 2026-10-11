import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { environment } from '../../../../environments/environment';
import { Register } from './register';

describe('Register', () => {
  const url = `${environment.apiUrl}/auth/register/`;
  const valid = {
    username: 'nouveau',
    email: 'nouveau@example.com',
    first_name: 'Léa',
    last_name: '',
    password: 'Secret-12345',
    confirm: 'Secret-12345',
  };
  let http: HttpTestingController;

  const setup = () => {
    TestBed.configureTestingModule({
      imports: [Register],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(Register);
    fixture.detectChanges();
    return fixture;
  };

  it('does not call the API when the form is invalid', () => {
    const fixture = setup();
    fixture.componentInstance.submit();
    fixture.detectChanges();
    http.expectNone(url);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('adresse e-mail valide');
  });

  it('refuses a short password and a mismatching confirmation', () => {
    const fixture = setup();
    fixture.componentInstance.form.setValue({ ...valid, password: 'court', confirm: 'court' });
    expect(fixture.componentInstance.form.controls.password.invalid).toBe(true);

    fixture.componentInstance.form.setValue({ ...valid, confirm: 'Autre-12345' });
    expect(fixture.componentInstance.form.errors).toEqual({ mismatch: true });
    fixture.componentInstance.submit();
    http.expectNone(url);
  });

  it('sends the registration without the confirmation and shows the confirmation message', async () => {
    const fixture = setup();
    fixture.componentInstance.form.setValue(valid);
    fixture.componentInstance.submit();

    const request = http.expectOne(url);
    expect(request.request.body).toEqual({
      username: 'nouveau',
      email: 'nouveau@example.com',
      first_name: 'Léa',
      last_name: '',
      password: 'Secret-12345',
    });
    request.flush(
      { detail: 'Compte créé. Il sera utilisable dès qu’un gestionnaire l’aura activé.' },
      { status: 201, statusText: 'Created' },
    );
    await fixture.whenStable();

    const done = (fixture.nativeElement as HTMLElement).querySelector('[data-testid="done"]');
    expect(done?.textContent).toContain('gestionnaire');
  });

  it('shows the errors of the API under the fields', async () => {
    const fixture = setup();
    fixture.componentInstance.form.setValue(valid);
    fixture.componentInstance.submit();
    http
      .expectOne(url)
      .flush(
        { username: ["Ce nom d'utilisateur est déjà pris."] },
        { status: 400, statusText: 'Bad Request' },
      );
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('déjà pris');
    expect(fixture.componentInstance.saving()).toBe(false);
  });

  it('shows a general message when registrations are disabled', async () => {
    const fixture = setup();
    fixture.componentInstance.form.setValue(valid);
    fixture.componentInstance.submit();
    http
      .expectOne(url)
      .flush(
        { detail: 'Les inscriptions sont désactivées.' },
        { status: 403, statusText: 'Forbidden' },
      );
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'inscriptions sont désactivées',
    );
  });
});
