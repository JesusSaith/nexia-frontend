import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { API_BASE_URL } from '../config/api-base-url';
import { BetaInvite, BetaRequestItem, BetaStatus, DemoBusiness, LandingFunnel, PlatformBusiness } from '../models/platform-business.model';

@Injectable({ providedIn: 'root' })
export class SuperAdminService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(API_BASE_URL);

  getBusinesses(): Observable<PlatformBusiness[]> {
    return this.http.get<PlatformBusiness[]>(`${this.apiBaseUrl}/super-admin/businesses`);
  }

  updateBusinessStatus(businessId: number, isActive: boolean): Observable<PlatformBusiness> {
    return this.http.put<PlatformBusiness>(
      `${this.apiBaseUrl}/super-admin/businesses/${businessId}/status`,
      { is_active: isActive },
    );
  }

  getBetaRequests(): Observable<BetaRequestItem[]> {
    return this.http.get<BetaRequestItem[]>(`${this.apiBaseUrl}/super-admin/beta-requests`);
  }

  setBetaStatus(id: number, status: BetaStatus): Observable<BetaRequestItem> {
    return this.http.put<BetaRequestItem>(`${this.apiBaseUrl}/super-admin/beta-requests/${id}/status`, { status });
  }

  /** Aprueba la solicitud, le manda el correo con su enlace de registro y devuelve ese enlace para copiarlo. */
  inviteBeta(id: number): Observable<BetaInvite> {
    return this.http.post<BetaInvite>(`${this.apiBaseUrl}/super-admin/beta-requests/${id}/invite`, {});
  }

  /** Crea (o limpia y vuelve a crear) el negocio de demostración de la landing. */
  createDemoBusiness(): Observable<DemoBusiness> {
    return this.http.post<DemoBusiness>(`${this.apiBaseUrl}/super-admin/demo-business`, {});
  }

  getLandingFunnel(days = 30): Observable<LandingFunnel> {
    return this.http.get<LandingFunnel>(`${this.apiBaseUrl}/super-admin/landing-funnel`, { params: { days } });
  }
}
