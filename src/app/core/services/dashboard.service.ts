import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { API_BASE_URL } from '../config/api-base-url';
import { DashboardStats, DashboardSummary } from '../models/dashboard.model';

/** Aviso de Inicio: el servidor ya dice de qué tipo es, a qué cita se refiere y si se vio. */
export interface HomeNotice {
  id: number;
  message: string;
  created_at: string;
  kind?: string | null;
  appointment_id?: number | null;
  seen?: boolean;
  /** Lista de espera: a quién avisar y de qué horario se trata. */
  data?: { people?: { name: string; phone: string }[]; day?: string; hour?: string } | null;
}

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(API_BASE_URL);

  getNotices(): Observable<HomeNotice[]> {
    return this.http.get<HomeNotice[]>(`${this.apiBaseUrl}/notices`);
  }

  /** "Marcar como vistos": queda guardado en el negocio, no en el navegador. */
  markNoticesSeen(): Observable<void> {
    return this.http.post<void>(`${this.apiBaseUrl}/notices/seen`, {});
  }

  getSummary(): Observable<DashboardSummary> {
    return this.http.get<DashboardSummary>(`${this.apiBaseUrl}/dashboard/summary`);
  }

  getStats(date?: string): Observable<DashboardStats> {
    const params = date ? new HttpParams().set('date', date) : undefined;
    return this.http.get<DashboardStats>(`${this.apiBaseUrl}/dashboard/stats`, { params });
  }
}
