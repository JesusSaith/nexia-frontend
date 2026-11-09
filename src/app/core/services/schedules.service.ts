import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { API_BASE_URL } from '../config/api-base-url';
import { Schedule, ScheduleItem } from '../models/schedule.model';

export interface SpecialHours {
  id: number;
  staff_id: number | null;
  date_from: string;
  date_to: string;
  start_time: string;
  end_time: string;
  closed: boolean;
  note: string | null;
  /** Horas fijas solo para esas fechas ("06:30, 07:30"); vacío = las de siempre. */
  slot_times?: string | null;
  /** Solo esos días de la semana dentro del periodo ("5,6", lunes = 0); vacío = todos. */
  weekdays?: string | null;
}

@Injectable({ providedIn: 'root' })
export class SchedulesService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(API_BASE_URL);

  getStaffSchedule(staffId: number): Observable<Schedule[]> {
    return this.http.get<Schedule[]>(`${this.apiBaseUrl}/schedules/staff/${staffId}`);
  }

  /**
   * Horarios especiales. Sin opciones: los que aún no terminan. Con `start` y `end`: los que tocan ese rango aunque ya
   * hayan pasado (la Agenda los necesita para dibujar las horas de un día). Con `includePast`: también los de fechas pasadas.
   */
  listSpecial(options: { start?: string; end?: string; includePast?: boolean } = {}): Observable<SpecialHours[]> {
    let params = new HttpParams();
    if (options.start) {
      params = params.set('start', options.start);
    }
    if (options.end) {
      params = params.set('end', options.end);
    }
    if (options.includePast) {
      params = params.set('include_past', 'true');
    }
    return this.http.get<SpecialHours[]>(`${this.apiBaseUrl}/schedules/special`, { params });
  }

  addSpecial(body: Omit<SpecialHours, 'id'>): Observable<SpecialHours> {
    return this.http.post<SpecialHours>(`${this.apiBaseUrl}/schedules/special`, body);
  }

  deleteSpecial(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiBaseUrl}/schedules/special/${id}`);
  }

  updateStaffSchedule(
    staffId: number,
    schedules: ScheduleItem[],
    slotTimes?: string | null,
  ): Observable<Schedule[]> {
    const body = slotTimes === undefined ? { schedules } : { schedules, slot_times: slotTimes };
    return this.http.put<Schedule[]>(`${this.apiBaseUrl}/schedules/staff/${staffId}`, body);
  }
}
