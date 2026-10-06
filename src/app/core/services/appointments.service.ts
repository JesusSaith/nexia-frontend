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

  updateStatus(id: number, status: AppointmentStatus): Observable<Appointment> {
    return this.http.put<Appointment>(`${this.apiBaseUrl}/appointments/${id}/status`, { status });
  }
}
