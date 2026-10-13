import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../environments/environment';
import { DownloadService } from '../core/download';
import { PurchaseOrderService } from './purchase-order';

describe('PurchaseOrderService', () => {
  const url = `${environment.apiUrl}/purchase-orders/`;
  const body = {
    supplier: 1,
    expected_date: null,
    notes: '',
    lines: [{ product: 1, quantity: 5, unit_cost: 0.8 }],
  };
  let service: PurchaseOrderService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(PurchaseOrderService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('maps the status and page filters, omitting the empty ones', () => {
    service.list({ status: 'SENT', page: 2 }).subscribe();
    const { params } = http.expectOne((r) => r.url === url).request;
    expect(params.get('status')).toBe('SENT');
    expect(params.get('page')).toBe('2');

    service.list({ status: '' }).subscribe();
    expect(http.expectOne((r) => r.url === url).request.params.keys()).toEqual([]);
  });

  it('creates, reads, updates and deletes', () => {
    service.create(body).subscribe();
    const created = http.expectOne(url);
    expect(created.request.method).toBe('POST');
    expect(created.request.body).toEqual(body);
    service.get(4).subscribe();
    expect(http.expectOne(`${url}4/`).request.method).toBe('GET');
    service.update(4, body).subscribe();
    expect(http.expectOne(`${url}4/`).request.method).toBe('PUT');
    service.remove(4).subscribe();
    expect(http.expectOne(`${url}4/`).request.method).toBe('DELETE');
  });

  it('sends, receives and cancels with POST actions', () => {
    for (const action of ['send', 'receive', 'cancel'] as const) {
      service[action](4).subscribe();
      const request = http.expectOne(`${url}4/${action}/`);
      expect(request.request.method).toBe('POST');
    }
  });

  it('exports the filtered orders without the page parameter', () => {
    const save = vi
      .spyOn(TestBed.inject(DownloadService), 'save')
      .mockImplementation(() => undefined);
    service.exportCsv({ status: 'RECEIVED', page: 3 }).subscribe();
    const request = http.expectOne((r) => r.url === `${url}export/`);
    expect(request.request.params.get('status')).toBe('RECEIVED');
    expect(request.request.params.has('page')).toBe(false);
    request.flush(new Blob(['x']));
    expect(save).toHaveBeenCalledWith(
      expect.any(Blob),
      expect.stringMatching(/^bons-de-commande-\d{4}-\d{2}-\d{2}\.csv$/),
    );
  });
});
