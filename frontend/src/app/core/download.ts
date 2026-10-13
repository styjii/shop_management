import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map, tap } from 'rxjs';
import { environment } from '../../environments/environment';

/**
 * CSV export. The files come from the API with the Authorization header (an ordinary link
 * would be refused: there is no cookie to authenticate it), so they are fetched as a blob
 * and handed to the browser as a download.
 */
@Injectable({ providedIn: 'root' })
export class DownloadService {
  private http = inject(HttpClient);

  /** Download `/api/<resource>/export/` as `<name>-YYYY-MM-DD.csv`. */
  csv(resource: string, name: string, params: HttpParams = new HttpParams()) {
    const filename = `${name}-${new Date().toISOString().slice(0, 10)}.csv`;
    return this.http
      .get(`${environment.apiUrl}/${resource}/export/`, { params, responseType: 'blob' })
      .pipe(
        tap((blob) => this.save(blob, filename)),
        map(() => undefined),
      );
  }

  save(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }
}
