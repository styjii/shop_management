import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { environment } from '../../../../environments/environment';
import { makeOrder, page } from '../../../../testing/factories';
import { DownloadService } from '../../../core/download';
import { ToastService } from '../../../core/toast';
import { PurchaseOrderList } from './purchase-order-list';

describe('PurchaseOrderList', () => {
  const api = environment.apiUrl;
  let http: HttpTestingController;

  const requests = () =>
    http.match((r) => r.url === `${api}/purchase-orders/` && r.method === 'GET');

  const setup = async (count = 1) => {
    TestBed.configureTestingModule({
      imports: [PurchaseOrderList],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(PurchaseOrderList);
    fixture.detectChanges();
    const [first] = requests();
    first.flush(
      page([makeOrder(), makeOrder({ id: 8, reference: 'BC-00008', status: 'RECEIVED' })], count),
    );
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, first };
  };

  const text = (fixture: { nativeElement: unknown }) =>
    (fixture.nativeElement as HTMLElement).textContent ?? '';

  it('lists the orders with a status badge and the total', async () => {
    const { fixture, first } = await setup();
    expect(first.request.params.keys()).toEqual(['page']);
    expect(text(fixture)).toContain('BC-00007');
    expect(text(fixture)).toContain('Brouillon');
    expect(text(fixture)).toContain('Reçu');
    expect(text(fixture)).toMatch(/16[.,]00/);
    http.verify();
  });

  it('filters by status and goes back to the first page', async () => {
    const { fixture } = await setup(45);
    fixture.componentInstance.goTo(2);
    fixture.detectChanges();
    requests()[0].flush(page([makeOrder()], 45));
    expect(fixture.componentInstance.page()).toBe(2);

    fixture.componentInstance.setStatus('SENT');
    fixture.detectChanges();
    const [request] = requests();
    expect(request.request.params.get('status')).toBe('SENT');
    expect(request.request.params.get('page')).toBe('1');
    request.flush(page([], 0));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(text(fixture)).toContain('Aucun bon de commande');
  });

  it('shows an error when the list cannot be loaded', async () => {
    TestBed.configureTestingModule({
      imports: [PurchaseOrderList],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(PurchaseOrderList);
    fixture.detectChanges();
    requests()[0].flush(
      { detail: 'Droits insuffisants.' },
      { status: 403, statusText: 'Forbidden' },
    );
    await fixture.whenStable();
    fixture.detectChanges();
    expect(text(fixture)).toContain('Droits insuffisants');
  });

  it('exports the orders of the selected status', async () => {
    const { fixture } = await setup();
    const save = vi
      .spyOn(TestBed.inject(DownloadService), 'save')
      .mockImplementation(() => undefined);
    fixture.componentInstance.setStatus('SENT');
    fixture.detectChanges();
    requests()[0].flush(page([], 0));

    fixture.componentInstance.exportCsv();
    expect(fixture.componentInstance.exporting()).toBe(true);
    const request = http.expectOne((r) => r.url === `${api}/purchase-orders/export/`);
    expect(request.request.params.get('status')).toBe('SENT');
    request.flush(new Blob(['x']));
    expect(save).toHaveBeenCalled();
    expect(fixture.componentInstance.exporting()).toBe(false);
  });

  it('tells the user when the export fails', async () => {
    const { fixture } = await setup();
    fixture.componentInstance.exportCsv();
    http
      .expectOne((r) => r.url === `${api}/purchase-orders/export/`)
      .flush(new Blob(['x']), { status: 500, statusText: 'Error' });
    expect(TestBed.inject(ToastService).toasts()[0].type).toBe('error');
    expect(fixture.componentInstance.exporting()).toBe(false);
  });
});
