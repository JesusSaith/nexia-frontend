import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { API_BASE_URL } from '../config/api-base-url';
import { DashboardStats } from '../models/dashboard.model';

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(API_BASE_URL);

  getStats(date?: string): Observable<DashboardStats> {
    const params = date ? new HttpParams().set('date', date) : undefined;
    return this.http.get<DashboardStats>(`${this.apiBaseUrl}/dashboard/stats`, { params });
  }
}
