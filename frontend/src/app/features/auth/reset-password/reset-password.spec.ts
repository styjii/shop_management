import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { environment } from '../../../../environments/environment';
import { ResetPassword } from './reset-password';

describe('ResetPassword', () => {
  const url = `${environment.apiUrl}/auth/password-reset/confirm/`;
  let http: HttpTestingController;

  const setup = (query: Record<string, string>) => {
    TestBed.configureTestingModule({
      imports: [ResetPassword],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap(query) } },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(ResetPassword);
    fixture.detectChanges();
    return fixture;
  };

  it('asks for a new link when uid or token is missing', () => {
    const fixture = setup({ uid: 'abc' });
    expect(fixture.componentInstance.linkIsComplete).toBe(false);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Lien incomplet');
  });

  it('sends the uid and token of the link with the new password', async () => {
    const fixture = setup({ uid: 'abc', token: 'tok-123' });
    fixture.componentInstance.form.setValue({
      password: 'Nouveau-12345',
      confirm: 'Nouveau-12345',
    });
    fixture.componentInstance.submit();

    const request = http.expectOne(url);
    expect(request.request.body).toEqual({
      uid: 'abc',
      token: 'tok-123',
      new_password: 'Nouveau-12345',
    });
    request.flush({ detail: 'Mot de passe réinitialisé. Vous pouvez vous connecter.' });
    await fixture.whenStable();

    const done = (fixture.nativeElement as HTMLElement).querySelector('[data-testid="done"]');
    expect(done?.textContent).toContain('réinitialisé');
  });

  it('does not submit when the confirmation differs', () => {
    const fixture = setup({ uid: 'abc', token: 'tok-123' });
    fixture.componentInstance.form.setValue({ password: 'Nouveau-12345', confirm: 'Autre-12345' });
    fixture.componentInstance.submit();
    http.expectNone(url);
  });

  it('proposes a new link when the old one has expired', async () => {
    const fixture = setup({ uid: 'abc', token: 'old' });
    fixture.componentInstance.form.setValue({
      password: 'Nouveau-12345',
      confirm: 'Nouveau-12345',
    });
    fixture.componentInstance.submit();
    http
      .expectOne(url)
      .flush(
        { detail: 'Ce lien est invalide ou a expiré.' },
        { status: 400, statusText: 'Bad Request' },
      );
    await fixture.whenStable();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('invalide ou a expiré');
    expect(text).toContain('Demander un nouveau lien');
  });

  it('shows the password rules reported by the API', async () => {
    const fixture = setup({ uid: 'abc', token: 'tok' });
    fixture.componentInstance.form.setValue({ password: 'Password1234', confirm: 'Password1234' });
    fixture.componentInstance.submit();
    http
      .expectOne(url)
      .flush(
        { new_password: ['Ce mot de passe est trop courant.'] },
        { status: 400, statusText: 'Bad Request' },
      );
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('trop courant');
  });
});
