import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { API_BASE_URL } from '../config/api-base-url';
import { Service, ServiceUpdate, ServiceWrite } from '../models/service.model';

@Injectable({ providedIn: 'root' })
export class ServicesService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(API_BASE_URL);

  getServices(): Observable<Service[]> {
    return this.http.get<Service[]>(`${this.apiBaseUrl}/services/`);
  }

  createService(data: ServiceWrite): Observable<Service> {
    return this.http.post<Service>(`${this.apiBaseUrl}/services/`, data);
  }

  updateService(id: number, data: ServiceUpdate): Observable<Service> {
    return this.http.put<Service>(`${this.apiBaseUrl}/services/${id}`, data);
  }

  deleteService(id: number): Observable<void> {
    return this.http
      .delete(`${this.apiBaseUrl}/services/${id}`, { responseType: 'text' })
      .pipe(map(() => undefined));
  }
}
