import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../environments/environment';
import { makeStats } from '../../testing/factories';
import { DownloadService } from '../core/download';
import { MovementService } from './movement';
import { SaleService } from './sale';

describe('sales statistics and CSV exports', () => {
  const api = environment.apiUrl;
  let http: HttpTestingController;
  let save: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    save = vi.spyOn(TestBed.inject(DownloadService), 'save').mockImplementation(() => undefined);
  });

  afterEach(() => http.verify());

  it('asks for the statistics of the last N days', () => {
    const received = vi.fn();
    TestBed.inject(SaleService).stats(90).subscribe(received);
    const request = http.expectOne((r) => r.url === `${api}/sales/stats/`);
    expect(request.request.params.get('days')).toBe('90');
    request.flush(makeStats({ days: 90 }));
    expect(received).toHaveBeenCalledWith(expect.objectContaining({ days: 90 }));
  });

  it('exports the sales as CSV', () => {
    TestBed.inject(SaleService).exportCsv().subscribe();
    http.expectOne(`${api}/sales/export/`).flush(new Blob(['x']));
    expect(save).toHaveBeenCalledWith(expect.any(Blob), expect.stringMatching(/^ventes-/));
  });

  it('exports the movements matching the filters, without the page', () => {
    TestBed.inject(MovementService).exportCsv({ product: 2, kind: 'OUT', page: 4 }).subscribe();
    const request = http.expectOne((r) => r.url === `${api}/movements/export/`);
    expect(request.request.params.get('product')).toBe('2');
    expect(request.request.params.get('kind')).toBe('OUT');
    expect(request.request.params.has('page')).toBe(false);
    request.flush(new Blob(['x']));
    expect(save).toHaveBeenCalledWith(expect.any(Blob), expect.stringMatching(/^mouvements-/));
  });
});
