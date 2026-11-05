import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { API_BASE_URL } from '../config/api-base-url';
import { PlatformBusiness } from '../models/platform-business.model';

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
}
