import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { API_BASE_URL } from '../config/api-base-url';

@Injectable({ providedIn: 'root' })
export class AgendaService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(API_BASE_URL);

  deleteBlock(blockId: number): Observable<void> {
    return this.http.delete<void>(`${this.apiBaseUrl}/agenda/blocks/${blockId}`);
  }
}
