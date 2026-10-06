import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { API_BASE_URL } from '../config/api-base-url';
import { Schedule, ScheduleItem } from '../models/schedule.model';

@Injectable({ providedIn: 'root' })
export class SchedulesService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(API_BASE_URL);

  getStaffSchedule(staffId: number): Observable<Schedule[]> {
    return this.http.get<Schedule[]>(`${this.apiBaseUrl}/schedules/staff/${staffId}`);
  }

  updateStaffSchedule(staffId: number, schedules: ScheduleItem[]): Observable<Schedule[]> {
    return this.http.put<Schedule[]>(`${this.apiBaseUrl}/schedules/staff/${staffId}`, { schedules });
  }
}
