import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { API_BASE_URL } from '../config/api-base-url';

export interface BusinessHour {
  id?: number;
  day_of_week: number;
  open_time: string;
  close_time: string;
  is_closed: boolean;
}

export interface BusinessSettings {
  id: number;
  name: string;
  slug: string;
  logo_url: string | null;
  phone: string;
  email: string;
  address: string | null;
  instagram: string | null;
  facebook: string | null;
  cancel_hours: number | null;
  deposit_amount: number | null;
  deposit_percent: number | null;
  deposit_account: string | null;
  deposit_hold_hours: number | null;
  buffer_minutes: number;
  staff_label: string;
  min_notice_hours: number;
  max_days_ahead: number;
  cancel_policy: string | null;
  resources: string | null;
  payment_url: string | null;
  hours: BusinessHour[];
}

export interface ProfileUpdate {
  phone: string;
  address: string | null;
  instagram: string | null;
  facebook: string | null;
  cancel_hours: number | null;
  deposit_amount: number | null;
  deposit_percent: number | null;
  deposit_account: string | null;
  deposit_hold_hours: number | null;
  buffer_minutes?: number | null;
  staff_label?: string | null;
  min_notice_hours?: number | null;
  max_days_ahead?: number | null;
  cancel_policy?: string | null;
  resources?: string | null;
  payment_url?: string | null;
}

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(API_BASE_URL);

  getSettings(): Observable<BusinessSettings> {
    return this.http.get<BusinessSettings>(`${this.apiBaseUrl}/settings/business`);
  }

  updateProfile(data: ProfileUpdate): Observable<BusinessSettings> {
    return this.http.patch<BusinessSettings>(`${this.apiBaseUrl}/settings/business`, data);
  }

  updateHours(hours: BusinessHour[]): Observable<BusinessHour[]> {
    return this.http.put<BusinessHour[]>(`${this.apiBaseUrl}/settings/hours`, hours);
  }

  uploadLogo(file: File): Observable<BusinessSettings> {
    const body = new FormData();
    body.append('file', file);
    return this.http.post<BusinessSettings>(`${this.apiBaseUrl}/settings/logo`, body);
  }
}
