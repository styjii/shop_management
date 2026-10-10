import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { environment } from '../environments/environment';
import { App } from './app';

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

    http.expectOne(`${environment.apiUrl}/auth/me/`).flush({ username: 'chef', is_manager: true });
    await fixture.whenStable();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Shop Management');
    expect(text).toContain('chef');
    expect(text).toContain('Gestionnaire');
    expect(text).toContain('Déconnexion');
    http.verify();
  });
});
