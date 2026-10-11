import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { environment } from '../../../../environments/environment';
import { ForgotPassword } from './forgot-password';

describe('ForgotPassword', () => {
  const url = `${environment.apiUrl}/auth/password-reset/`;
  let http: HttpTestingController;

  const setup = () => {
    TestBed.configureTestingModule({
      imports: [ForgotPassword],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(ForgotPassword);
    fixture.detectChanges();
    return fixture;
  };

  it('refuses an invalid address', () => {
    const fixture = setup();
    fixture.componentInstance.form.setValue({ email: 'pas-un-email' });
    fixture.componentInstance.submit();
    http.expectNone(url);
  });

  it('sends the request and shows the neutral answer of the API', async () => {
    const fixture = setup();
    fixture.componentInstance.form.setValue({ email: 'lea@example.com' });
    fixture.componentInstance.submit();

    const request = http.expectOne(url);
    expect(request.request.body).toEqual({ email: 'lea@example.com' });
    request.flush({
      detail: "Si un compte correspond à cette adresse, un e-mail vient d'être envoyé.",
    });
    await fixture.whenStable();

    const sent = (fixture.nativeElement as HTMLElement).querySelector('[data-testid="sent"]');
    expect(sent?.textContent).toContain('un e-mail vient');
  });

  it('shows the error when the limit is reached', async () => {
    const fixture = setup();
    fixture.componentInstance.form.setValue({ email: 'lea@example.com' });
    fixture.componentInstance.submit();
    http
      .expectOne(url)
      .flush(
        { detail: 'La requête a été limitée.' },
        { status: 429, statusText: 'Too Many Requests' },
      );
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('limitée');
    expect(fixture.componentInstance.sending()).toBe(false);
  });
});
