import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../../environments/environment';
import { makeStats } from '../../../../testing/factories';
import { DownloadService } from '../../../core/download';
import { ToastService } from '../../../core/toast';
import { SalesStatsPage } from './sales-stats';

describe('SalesStatsPage', () => {
  const api = environment.apiUrl;
  let http: HttpTestingController;

  const statsRequests = () => http.match((r) => r.url === `${api}/sales/stats/`);

  const setup = async (stats = makeStats()) => {
    TestBed.configureTestingModule({
      imports: [SalesStatsPage],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(SalesStatsPage);
    fixture.detectChanges();
    const [first] = statsRequests();
    first.flush(stats);
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, first };
  };

  const element = (fixture: { nativeElement: unknown }) => fixture.nativeElement as HTMLElement;
  const byId = (fixture: { nativeElement: unknown }, id: string) =>
    element(fixture).querySelector(`[data-testid="${id}"]`)?.textContent?.trim();

  it('loads the last 30 days by default and shows the totals', async () => {
    const { fixture, first } = await setup();
    expect(first.request.params.get('days')).toBe('30');
    expect(byId(fixture, 'revenue')).toMatch(/12[.,]00/);
    expect(byId(fixture, 'sales-count')).toBe('3');
    expect(byId(fixture, 'items-sold')).toBe('8');
    expect(byId(fixture, 'average-basket')).toMatch(/4[.,]00/);
  });

  it('draws one bar per day with the date as label', async () => {
    const { fixture } = await setup();
    expect(fixture.componentInstance.points()).toEqual([
      { label: '11/10', value: 0 },
      { label: '12/10', value: 12 },
    ]);
    expect(element(fixture).querySelectorAll('app-bar-chart rect')).toHaveLength(2);
  });

  it('ranks the best products and the categories with relative bars', async () => {
    const { fixture } = await setup();
    const top = element(fixture).querySelectorAll('[data-testid="top-product"]');
    expect(top).toHaveLength(2);
    expect(top[0].textContent).toContain('Eau minérale');
    expect(top[0].textContent).toContain('6 vendu(s)');
    expect(fixture.componentInstance.share('9.00', 9)).toBe(100);
    expect(fixture.componentInstance.share('3.00', 9)).toBe(33);
    expect(element(fixture).querySelectorAll('[data-testid="category"]')).toHaveLength(1);
  });

  it('reloads when the period changes', async () => {
    const { fixture } = await setup();
    fixture.componentInstance.setDays('90');
    fixture.detectChanges();
    const [request] = statsRequests();
    expect(request.request.params.get('days')).toBe('90');
    request.flush(makeStats({ days: 90, totals: { ...makeStats().totals, revenue: '99.00' } }));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(byId(fixture, 'revenue')).toMatch(/99[.,]00/);
  });

  it('says so when there was no sale', async () => {
    const { fixture } = await setup(
      makeStats({
        totals: { revenue: '0.00', sales_count: 0, items_sold: 0, average_basket: '0.00' },
        top_products: [],
        by_category: [],
      }),
    );
    expect(element(fixture).textContent).toContain('Aucune vente sur cette période');
  });

  it('shows an error when the statistics cannot be loaded', async () => {
    TestBed.configureTestingModule({
      imports: [SalesStatsPage],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(SalesStatsPage);
    fixture.detectChanges();
    statsRequests()[0].flush({ detail: 'Erreur serveur.' }, { status: 500, statusText: 'Error' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(element(fixture).textContent).toContain('Erreur serveur');
  });

  it('exports the sales as CSV and reports a failure', async () => {
    const { fixture } = await setup();
    const save = vi
      .spyOn(TestBed.inject(DownloadService), 'save')
      .mockImplementation(() => undefined);
    fixture.componentInstance.exportCsv();
    http.expectOne(`${api}/sales/export/`).flush(new Blob(['x']));
    expect(save).toHaveBeenCalled();

    fixture.componentInstance.exportCsv();
    http
      .expectOne(`${api}/sales/export/`)
      .flush(new Blob(['x']), { status: 500, statusText: 'Error' });
    expect(TestBed.inject(ToastService).toasts()[0].type).toBe('error');
    expect(fixture.componentInstance.exporting()).toBe(false);
  });
});
