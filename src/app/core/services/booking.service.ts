import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { API_BASE_URL } from '../config/api-base-url';
import { Appointment, AppointmentCreate, AvailabilitySlot } from '../models/appointment.model';
import { BusinessBrand, BusinessProfileUpdate, PublicService, PublicStaff } from '../models/business.model';

@Injectable({ providedIn: 'root' })
export class BookingService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(API_BASE_URL);

  getPublicBusiness(slug: string): Observable<BusinessBrand> {
    return this.http.get<BusinessBrand>(`${this.apiBaseUrl}/businesses/${slug}`);
  }

  getMyBrand(): Observable<BusinessBrand> {
    return this.http.get<BusinessBrand>(`${this.apiBaseUrl}/businesses/me`);
  }

  updateBusiness(data: BusinessProfileUpdate): Observable<BusinessBrand> {
    return this.http.put<BusinessBrand>(`${this.apiBaseUrl}/businesses/me`, data);
  }

  getPublicServices(slug: string): Observable<PublicService[]> {
    return this.http.get<PublicService[]>(`${this.apiBaseUrl}/businesses/${slug}/services`);
  }

  getPublicStaff(slug: string): Observable<PublicStaff[]> {
    return this.http.get<PublicStaff[]>(`${this.apiBaseUrl}/businesses/${slug}/staff`);
  }

  getAvailability(
    slug: string,
    serviceId: number,
    staffId: number,
    date: string,
  ): Observable<AvailabilitySlot[]> {
    const params = new HttpParams()
      .set('service_id', serviceId)
      .set('staff_id', staffId)
      .set('date', date);
    return this.http.get<AvailabilitySlot[]>(`${this.apiBaseUrl}/businesses/${slug}/availability`, {
      params,
    });
  }

  createAppointment(slug: string, data: AppointmentCreate): Observable<Appointment> {
    return this.http.post<Appointment>(`${this.apiBaseUrl}/businesses/${slug}/appointments`, data);
  }
}
