import { HttpParams, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../environments/environment';
import { DownloadService } from './download';

describe('DownloadService', () => {
  let service: DownloadService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(DownloadService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    vi.restoreAllMocks();
  });

  it('fetches the CSV as a blob and saves it under a dated name', () => {
    const save = vi.spyOn(service, 'save').mockImplementation(() => undefined);
    const done = vi.fn();
    service.csv('sales', 'ventes', new HttpParams().set('date_from', '2026-10-01')).subscribe(done);

    const request = http.expectOne((r) => r.url === `${environment.apiUrl}/sales/export/`);
    expect(request.request.method).toBe('GET');
    expect(request.request.responseType).toBe('blob');
    expect(request.request.params.get('date_from')).toBe('2026-10-01');
    const blob = new Blob(['a;b']);
    request.flush(blob);

    expect(save).toHaveBeenCalledWith(
      blob,
      expect.stringMatching(/^ventes-\d{4}-\d{2}-\d{2}\.csv$/),
    );
    expect(done).toHaveBeenCalled();
  });

  it('does not save anything when the export fails', () => {
    const save = vi.spyOn(service, 'save').mockImplementation(() => undefined);
    const error = vi.fn();
    service.csv('products', 'produits').subscribe({ error });
    http
      .expectOne(`${environment.apiUrl}/products/export/`)
      .flush(new Blob(['x']), { status: 403, statusText: 'Forbidden' });
    expect(error).toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it('hands the blob to the browser through a temporary link', () => {
    URL.createObjectURL = vi.fn(() => 'blob:csv');
    URL.revokeObjectURL = vi.fn();
    let link: HTMLAnchorElement | undefined;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      link = this;
    });

    service.save(new Blob(['a']), 'produits-2026-10-12.csv');

    expect(link?.download).toBe('produits-2026-10-12.csv');
    expect(link?.href).toBe('blob:csv');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:csv');
  });
});
