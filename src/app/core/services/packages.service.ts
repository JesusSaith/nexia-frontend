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
  /** Sin servicio vale para cualquiera; sin fecha no vence. */
  service_id?: number | null;
  expires_at?: string | null;
}

export interface PackageOffer {
  id: number;
  service_id: number;
  service_name: string | null;
  name: string;
  visits: number;
  price: number;
  valid_days: number | null;
  is_active: boolean;
}

export interface PackageOfferWrite {
  service_id: number;
  name: string;
  visits: number;
  price: number;
  valid_days: number | null;
}

/** Pedido de un paquete: `awaiting` espera el pago o su revisión. */
export interface PackageOrderRow {
  id: number;
  name: string;
  visits: number;
  price: number;
  client_name: string;
  client_phone: string;
  status: 'awaiting' | 'approved' | 'rejected';
  has_proof: boolean;
  created_at: string;
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

  update(id: number, remaining: number): Observable<VisitPackage> {
    return this.http.patch<VisitPackage>(`${this.apiBaseUrl}/packages/${id}`, { remaining });
  }

  remove(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiBaseUrl}/packages/${id}`);
  }

  offers(): Observable<PackageOffer[]> {
    return this.http.get<PackageOffer[]>(`${this.apiBaseUrl}/packages/offers`);
  }

  createOffer(data: PackageOfferWrite): Observable<PackageOffer> {
    return this.http.post<PackageOffer>(`${this.apiBaseUrl}/packages/offers`, data);
  }

  updateOffer(id: number, data: { is_active?: boolean }): Observable<PackageOffer> {
    return this.http.patch<PackageOffer>(`${this.apiBaseUrl}/packages/offers/${id}`, data);
  }

  removeOffer(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiBaseUrl}/packages/offers/${id}`);
  }

  orders(): Observable<PackageOrderRow[]> {
    return this.http.get<PackageOrderRow[]>(`${this.apiBaseUrl}/packages/orders`);
  }

  orderProof(id: number): Observable<{ image: string | null }> {
    return this.http.get<{ image: string | null }>(`${this.apiBaseUrl}/packages/orders/${id}/proof`);
  }

  approveOrder(id: number): Observable<PackageOrderRow> {
    return this.http.post<PackageOrderRow>(`${this.apiBaseUrl}/packages/orders/${id}/approve`, {});
  }

  rejectOrder(id: number): Observable<PackageOrderRow> {
    return this.http.post<PackageOrderRow>(`${this.apiBaseUrl}/packages/orders/${id}/reject`, {});
  }
}
