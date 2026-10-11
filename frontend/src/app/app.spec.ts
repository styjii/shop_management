import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { environment } from '../environments/environment';
import { App } from './app';
import { makeCurrentUser, makeManager } from '../testing/factories';

describe('App', () => {
  const setup = () => {
    TestBed.configureTestingModule({
      imports: [App],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    return TestBed.inject(HttpTestingController);
  };

  beforeEach(() => sessionStorage.clear());

  it('shows no navigation bar when logged out', async () => {
    setup();
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('header')).toBeNull();
    expect(element.querySelector('router-outlet')).not.toBeNull();
  });

  it('shows the navigation bar with the user name and role when logged in', async () => {
    sessionStorage.setItem('access', 'token');
    const http = setup();
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    http.expectOne(`${environment.apiUrl}/auth/me/`).flush(makeManager());
    await fixture.whenStable();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Shop Management');
    expect(text).toContain('chef');
    expect(text).toContain('Gestionnaire');
    expect(text).toContain('Déconnexion');
    http.verify();
  });

  it('shows the manager links only to managers', async () => {
    sessionStorage.setItem('access', 'token');
    const http = setup();
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    http.expectOne(`${environment.apiUrl}/auth/me/`).flush(makeCurrentUser());
    await fixture.whenStable();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Historique');
    expect(text).not.toContain('Mouvements');
    expect(text).not.toContain('Catégories');
  });

  it('shows each management link according to the individual rights', async () => {
    sessionStorage.setItem('access', 'token');
    const http = setup();
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    http
      .expectOne(`${environment.apiUrl}/auth/me/`)
      .flush(makeCurrentUser({ capabilities: ['manage_stock'] }));
    await fixture.whenStable();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Mouvements');
    expect(text).not.toContain('Catégories');
    expect(text).not.toContain('Utilisateurs');
  });

  it('shows the user management link to managers', async () => {
    sessionStorage.setItem('access', 'token');
    const http = setup();
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    http.expectOne(`${environment.apiUrl}/auth/me/`).flush(makeManager());
    await fixture.whenStable();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Utilisateurs');
    expect(text).toContain('Catégories');
    expect(text).toContain('Mouvements');
  });
});
