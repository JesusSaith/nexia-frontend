import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { API_BASE_URL } from '../config/api-base-url';
import {
  AdminAppointmentCreate,
  AdminAppointmentUpdate,
  FreeTimes,
  VisitPart,
  AppointmentCorrection,
  PastHour,
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

/** Datos opcionales al completar una cita (lo cobrado, cómo, propina y nota privada). */
export interface StatusCharge {
  final_price?: number | null;
  payment_method?: string | null;
  tip?: number | null;
  /** Cobro dividido: cuánto de la cita se pagó con tarjeta; el resto va en `payment_method` (efectivo o transferencia). */
  card_amount?: number | null;
  tip_on_card?: boolean;
  visit_note?: string | null;
}

@Injectable({ providedIn: 'root' })
export class AppointmentsService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(API_BASE_URL);

  /** Una cita por número (la agenda la usa para saltar al día de ?cita=ID). */
  getAppointment(id: number): Observable<Appointment> {
    return this.http.get<Appointment>(`${this.apiBaseUrl}/appointments/${id}`);
  }

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
    if (params.client_phone) {
      httpParams = httpParams.set('client_phone', params.client_phone);
    }
    return this.http.get<Appointment[]>(`${this.apiBaseUrl}/appointments`, { params: httpParams });
  }

  correctAppointment(id: number, data: AppointmentCorrection): Observable<Appointment> {
    return this.http.put<Appointment>(`${this.apiBaseUrl}/appointments/${id}/correct`, data);
  }

  changeService(id: number, serviceId: number, quotedPrice: number | null): Observable<Appointment> {
    return this.http.put<Appointment>(`${this.apiBaseUrl}/appointments/${id}/service`, { service_id: serviceId, quoted_price: quotedPrice });
  }

  getPastHours(staffId: number, serviceId: number, date: string): Observable<PastHour[]> {
    const params = new HttpParams().set('staff_id', staffId).set('service_id', serviceId).set('date', date);
    return this.http.get<PastHour[]>(`${this.apiBaseUrl}/appointments/past-hours`, { params });
  }

  createAdminAppointment(data: AdminAppointmentCreate): Observable<Appointment> {
    return this.http.post<Appointment>(`${this.apiBaseUrl}/appointments`, data);
  }

  /** Editar una cita pendiente con los mismos datos del formulario de "Nueva cita". */
  updateAdminAppointment(id: number, data: AdminAppointmentUpdate): Observable<Appointment> {
    return this.http.put<Appointment>(`${this.apiBaseUrl}/appointments/${id}`, data);
  }

  /** Horas libres (cada 15 min) para agendar o editar: sin las reglas de la página pública; con `ignoreId` no cuenta esa cita. */
  freeTimes(staffId: number, serviceId: number, date: string, ignoreId: number | null = null, minutes: number | null = null): Observable<FreeTimes> {
    return this.http.get<FreeTimes>(`${this.apiBaseUrl}/appointments/free-times`, {
      params: { staff_id: staffId, service_id: serviceId, date, ...(ignoreId !== null ? { ignore_id: ignoreId } : {}), ...(minutes !== null ? { minutes } : {}) },
    });
  }

  /** Las otras partes de la misma visita (cuando se agendó en dos horarios). */
  visitGroup(id: number): Observable<VisitPart[]> {
    return this.http.get<VisitPart[]>(`${this.apiBaseUrl}/appointments/${id}/group`);
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

  /** No mandó anticipo pero sí va a ir: queda confirmada sin anticipo. */
  waiveDeposit(id: number): Observable<Appointment> {
    return this.http.post<Appointment>(`${this.apiBaseUrl}/appointments/${id}/waive-deposit`, {});
  }

  waiters(day: string, serviceId: number, staffId: number): Observable<{ client_name: string; client_phone: string }[]> {
    return this.http.get<{ client_name: string; client_phone: string }[]>(`${this.apiBaseUrl}/appointments/waiters`, {
      params: { day, service_id: serviceId, staff_id: staffId },
    });
  }

  /** Horas libres (cada 15 min) para mover una cita: su duración real y sin contar su propio lugar. */
  moveTimes(id: number, date: string, staffId: number): Observable<string[]> {
    return this.http.get<string[]>(`${this.apiBaseUrl}/appointments/${id}/move-times`, { params: { date, staff_id: staffId } });
  }

  /** Cambia día, hora o persona de una cita conservando su duración. */
  move(id: number, startsAt: string, staffId: number): Observable<Appointment> {
    return this.http.put<Appointment>(`${this.apiBaseUrl}/appointments/${id}/time`, { starts_at: startsAt, staff_id: staffId });
  }

  updateStatus(
    id: number,
    status: AppointmentStatus,
    charge?: StatusCharge,
  ): Observable<Appointment> {
    return this.http.put<Appointment>(`${this.apiBaseUrl}/appointments/${id}/status`, { status, ...charge });
  }

  /** Nota privada de la última visita completada de la misma clienta. */
  lastNote(id: number): Observable<{ note: string | null; date: string | null }> {
    return this.http.get<{ note: string | null; date: string | null }>(`${this.apiBaseUrl}/appointments/${id}/last-note`);
  }

  /** Acepta una reserva que llegó por aprobar. */
  approve(id: number): Observable<Appointment> {
    return this.http.post<Appointment>(`${this.apiBaseUrl}/appointments/${id}/approve`, {});
  }

  clearProof(id: number): Observable<Appointment> {
    return this.http.post<Appointment>(`${this.apiBaseUrl}/appointments/${id}/another-proof`, {});
  }
}
