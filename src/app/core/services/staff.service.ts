import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { API_BASE_URL } from '../config/api-base-url';
import {
  Staff,
  StaffAccountCreate,
  StaffProfileUpdate,
  StaffUpdate,
  StaffWrite,
} from '../models/staff.model';

@Injectable({ providedIn: 'root' })
export class StaffService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(API_BASE_URL);

  getStaff(): Observable<Staff[]> {
    return this.http.get<Staff[]>(`${this.apiBaseUrl}/staff/`);
  }

  createStaff(data: StaffWrite): Observable<Staff> {
    return this.http.post<Staff>(`${this.apiBaseUrl}/staff/`, data);
  }

  updateStaff(id: number, data: StaffUpdate): Observable<Staff> {
    return this.http.put<Staff>(`${this.apiBaseUrl}/staff/${id}`, data);
  }

  deleteStaff(id: number): Observable<void> {
    return this.http
      .delete(`${this.apiBaseUrl}/staff/${id}`, { responseType: 'text' })
      .pipe(map(() => undefined));
  }

  createAccount(staffId: number, data: StaffAccountCreate): Observable<Staff> {
    return this.http.post<Staff>(`${this.apiBaseUrl}/staff/${staffId}/account`, data);
  }

  updateStaffServices(staffId: number, serviceIds: number[]): Observable<Staff> {
    return this.http.put<Staff>(`${this.apiBaseUrl}/staff/${staffId}/services`, {
      service_ids: serviceIds,
    });
  }

  getStaffProfile(): Observable<Staff> {
    return this.http.get<Staff>(`${this.apiBaseUrl}/staff/me/profile`);
  }

  updateStaffProfile(data: StaffProfileUpdate): Observable<Staff> {
    return this.http.put<Staff>(`${this.apiBaseUrl}/staff/me/profile`, data);
  }
}
