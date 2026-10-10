import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { environment } from '../../../../environments/environment';
import { Login } from './login';

describe('Login', () => {
  const api = environment.apiUrl;
  let http: HttpTestingController;
  let navigate: ReturnType<typeof vi.spyOn>;

  const setup = () => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      imports: [Login],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(Login);
    fixture.detectChanges();
    return fixture;
  };

  it('does not call the API when the form is empty', () => {
    const fixture = setup();
    fixture.componentInstance.submit();
    fixture.detectChanges();
    http.expectNone(`${api}/auth/token/`);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      "L'identifiant est obligatoire.",
    );
  });

  it('logs in, loads the user and goes to the home page', () => {
    const fixture = setup();
    fixture.componentInstance.form.setValue({ username: 'admin', password: 'secret' });
    fixture.componentInstance.submit();

    http.expectOne(`${api}/auth/token/`).flush({ access: 'a', refresh: 'r' });
    http.expectOne(`${api}/auth/me/`).flush({ username: 'admin', is_manager: true });

    expect(navigate).toHaveBeenCalledWith(['/']);
    http.verify();
  });

  it('shows the error returned by the API', async () => {
    const fixture = setup();
    fixture.componentInstance.form.setValue({ username: 'admin', password: 'wrong' });
    fixture.componentInstance.submit();

    http
      .expectOne(`${api}/auth/token/`)
      .flush(
        { detail: 'Identifiant ou mot de passe incorrect.' },
        { status: 401, statusText: 'Unauthorized' },
      );
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Identifiant ou mot de passe incorrect.',
    );
    expect(fixture.componentInstance.loading()).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });
});
