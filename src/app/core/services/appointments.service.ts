import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { API_BASE_URL } from '../config/api-base-url';
import {
  AdminAppointmentCreate,
  Appointment,
  AppointmentQuery,
  AppointmentStatus,
} from '../models/appointment.model';

export interface TimeBlock {
  id: number;
  staff_id: number;
  staff_name: string;
  starts_at: string;
  ends_at: string;
  note: string | null;
  rule_id?: number | null;
}

@Injectable({ providedIn: 'root' })
export class AppointmentsService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(API_BASE_URL);

  getAppointments(params: AppointmentQuery): Observable<Appointment[]> {
    let httpParams = new HttpParams();
    if (params.start_date) {
      httpParams = httpParams.set('start_date', params.start_date);
    }
    if (params.end_date) {
      httpParams = httpParams.set('end_date', params.end_date);
    }
    if (params.staff_id != null) {
      httpParams = httpParams.set('staff_id', params.staff_id);
    }
    if (params.service_id != null) {
      httpParams = httpParams.set('service_id', params.service_id);
    }
    return this.http.get<Appointment[]>(`${this.apiBaseUrl}/appointments`, { params: httpParams });
  }

  createAdminAppointment(data: AdminAppointmentCreate): Observable<Appointment> {
    return this.http.post<Appointment>(`${this.apiBaseUrl}/appointments`, data);
  }

  getBlocks(params: AppointmentQuery): Observable<TimeBlock[]> {
    let httpParams = new HttpParams();
    if (params.start_date) {
      httpParams = httpParams.set('start_date', params.start_date);
    }
    if (params.end_date) {
      httpParams = httpParams.set('end_date', params.end_date);
    }
    if (params.staff_id != null) {
      httpParams = httpParams.set('staff_id', params.staff_id);
    }
    return this.http.get<TimeBlock[]>(`${this.apiBaseUrl}/blocks`, { params: httpParams });
  }

  createBlock(data: { staff_id: number; starts_at: string; ends_at: string; note?: string | null }): Observable<TimeBlock> {
    return this.http.post<TimeBlock>(`${this.apiBaseUrl}/blocks`, data);
  }

  createStanding(data: { staff_id: number; start_time: string; end_time: string; note?: string | null }): Observable<TimeBlock> {
    return this.http.post<TimeBlock>(`${this.apiBaseUrl}/blocks/standing`, data);
  }

  deleteStanding(ruleId: number): Observable<void> {
    return this.http.delete<void>(`${this.apiBaseUrl}/blocks/standing/${ruleId}`);
  }

  quote(id: number, quotedPrice: number): Observable<Appointment> {
    return this.http.put<Appointment>(`${this.apiBaseUrl}/appointments/${id}/quote`, { quoted_price: quotedPrice });
  }

  updateStatus(id: number, status: AppointmentStatus): Observable<Appointment> {
    return this.http.put<Appointment>(`${this.apiBaseUrl}/appointments/${id}/status`, { status });
  }
}
