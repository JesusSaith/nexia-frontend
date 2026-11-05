import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { API_BASE_URL } from '../config/api-base-url';

export interface SearchClient {
  id: number;
  full_name: string;
  phone: string;
}

export interface SearchAppointment {
  id: number;
  starts_at: string;
  client_name: string;
  client_phone: string;
  service_name: string;
  staff_name: string;
  status: 'scheduled' | 'completed' | 'cancelled' | 'no_show' | 'awaiting_deposit';
}

export interface SearchResult {
  clients: SearchClient[];
  appointments: SearchAppointment[];
}

/** Búsqueda global del panel (GET /api/search): clientes y citas por nombre o teléfono. */
@Injectable({ providedIn: 'root' })
export class SearchService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(API_BASE_URL);

  search(text: string): Observable<SearchResult> {
    return this.http.get<SearchResult>(`${this.apiBaseUrl}/search`, { params: { q: text } });
  }
}
