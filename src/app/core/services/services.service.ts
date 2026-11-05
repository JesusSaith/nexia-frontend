import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { API_BASE_URL } from '../config/api-base-url';
import { Service, ServiceUpdate, ServiceWrite } from '../models/service.model';

@Injectable({ providedIn: 'root' })
export class ServicesService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(API_BASE_URL);

  getCategories(): Observable<{ id: number; name: string }[]> {
    return this.http.get<{ id: number; name: string }[]>(`${this.apiBaseUrl}/services/categories`);
  }

  createCategory(name: string): Observable<{ id: number; name: string }> {
    return this.http.post<{ id: number; name: string }>(`${this.apiBaseUrl}/services/categories`, { name });
  }

  getServices(): Observable<Service[]> {
    return this.http.get<Service[]>(`${this.apiBaseUrl}/services/`);
  }

  createService(data: ServiceWrite): Observable<Service> {
    return this.http.post<Service>(`${this.apiBaseUrl}/services/`, data);
  }

  updateService(id: number, data: ServiceUpdate): Observable<Service> {
    return this.http.put<Service>(`${this.apiBaseUrl}/services/${id}`, data);
  }

  renameCategory(id: number, name: string): Observable<{ id: number; name: string }> {
    return this.http.put<{ id: number; name: string }>(`${this.apiBaseUrl}/services/categories/${id}`, { name });
  }

  /** Borra la categoría; sus servicios quedan sin categoría. */
  deleteCategory(id: number): Observable<void> {
    return this.http.delete(`${this.apiBaseUrl}/services/categories/${id}`, { responseType: 'text' }).pipe(map(() => undefined));
  }

  /** Borra de verdad (solo si no tiene citas; si tiene, el backend responde 409). */
  removeService(id: number): Observable<void> {
    return this.http.delete(`${this.apiBaseUrl}/services/${id}`, { params: { permanent: true }, responseType: 'text' }).pipe(map(() => undefined));
  }

  duplicateService(id: number): Observable<Service> {
    return this.http.post<Service>(`${this.apiBaseUrl}/services/${id}/duplicate`, {});
  }

  /** Orden en la página de reservas. */
  orderServices(ids: number[]): Observable<void> {
    return this.http.put(`${this.apiBaseUrl}/services/order`, { ids }, { responseType: 'text' }).pipe(map(() => undefined));
  }

  /** Sube (o baja) en % el precio de todos o de una categoría. */
  raisePrices(percent: number, category: string | null): Observable<Service[]> {
    return this.http.post<Service[]>(`${this.apiBaseUrl}/services/raise`, { percent, category });
  }

  deleteService(id: number): Observable<void> {
    return this.http
      .delete(`${this.apiBaseUrl}/services/${id}`, { responseType: 'text' })
      .pipe(map(() => undefined));
  }
}
