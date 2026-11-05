import { HttpClient } from '@angular/common/http';
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
}

@Injectable({ providedIn: 'root' })
export class SchedulesService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(API_BASE_URL);

  getStaffSchedule(staffId: number): Observable<Schedule[]> {
    return this.http.get<Schedule[]>(`${this.apiBaseUrl}/schedules/staff/${staffId}`);
  }

  /** Horarios especiales que aún no terminan (un día o un periodo; de una persona o de todos). */
  listSpecial(): Observable<SpecialHours[]> {
    return this.http.get<SpecialHours[]>(`${this.apiBaseUrl}/schedules/special`);
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
