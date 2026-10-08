import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { API_BASE_URL } from '../config/api-base-url';

export interface VisitPackage {
  id: number;
  client_name: string;
  client_phone: string;
  label: string;
  total: number;
  remaining: number;
}

@Injectable({ providedIn: 'root' })
export class PackagesService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(API_BASE_URL);

  list(): Observable<VisitPackage[]> {
    return this.http.get<VisitPackage[]>(`${this.apiBaseUrl}/packages`);
  }

  create(clientName: string, clientPhone: string, visits: number): Observable<VisitPackage> {
    return this.http.post<VisitPackage>(`${this.apiBaseUrl}/packages`, {
      client_name: clientName,
      client_phone: clientPhone,
      visits,
    });
  }
}
