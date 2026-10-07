import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { API_BASE_URL } from '../config/api-base-url';
import { Appointment, AppointmentCreate, AvailabilitySlot } from '../models/appointment.model';
import { BusinessBrand, BusinessProfileUpdate, PublicService, PublicStaff } from '../models/business.model';

export interface ManagedAppointment {
  business_name: string;
  business_slug: string;
  service_id: number;
  service_name: string;
  staff_id: number;
  staff_name: string;
  starts_at: string;
  status: 'scheduled' | 'completed' | 'cancelled' | 'no_show' | 'awaiting_deposit';
  is_past: boolean;
  is_cancelled: boolean;
  changes_locked: boolean;
  deposit_amount: number | null;
  deposit_account: string | null;
  payment_proof: string | null;
  client_confirmed: boolean;
  quoted_price: number | null;
  variable_price: boolean;
  price_accepted: boolean;
}

export interface ClientCard {
  id: number;
  full_name: string;
  phone: string;
  email: string | null;
  notes: string | null;
  internal_notes: string | null;
  visit_count: number;
  no_show_count: number;
  total_spent: number;
  visits: { starts_at: string; service_name: string; staff_name: string; price: number; status: string }[];
}

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

  getClient(id: number): Observable<ClientCard> {
    return this.http.get<ClientCard>(`${this.apiBaseUrl}/clients/${id}`);
  }

  saveClientNotes(id: number, internalNotes: string): Observable<ClientCard> {
    return this.http.patch<ClientCard>(`${this.apiBaseUrl}/clients/${id}`, {
      internal_notes: internalNotes,
    });
  }

  getClients(): Observable<{ id: number; full_name: string; phone: string; email: string | null; notes: string | null }[]> {
    return this.http.get<{ id: number; full_name: string; phone: string; email: string | null; notes: string | null }[]>(
      `${this.apiBaseUrl}/clients`,
    );
  }

  getManagedAppointment(token: string): Observable<ManagedAppointment> {
    return this.http.get<ManagedAppointment>(`${this.apiBaseUrl}/public/appointments/${token}`);
  }

  confirmManagedAppointment(token: string): Observable<ManagedAppointment> {
    return this.http.post<ManagedAppointment>(`${this.apiBaseUrl}/public/appointments/${token}/confirm`, {});
  }

  acceptPrice(token: string): Observable<ManagedAppointment> {
    return this.http.post<ManagedAppointment>(`${this.apiBaseUrl}/public/appointments/${token}/accept-price`, {});
  }

  uploadPaymentProof(token: string, image: string): Observable<ManagedAppointment> {
    return this.http.post<ManagedAppointment>(`${this.apiBaseUrl}/public/appointments/${token}/proof`, { image });
  }

  cancelManagedAppointment(token: string): Observable<ManagedAppointment> {
    return this.http.post<ManagedAppointment>(`${this.apiBaseUrl}/public/appointments/${token}/cancel`, {});
  }

  rescheduleManagedAppointment(
    token: string,
    data: { new_date: string; new_time: string; staff_id: number },
  ): Observable<ManagedAppointment> {
    return this.http.post<ManagedAppointment>(`${this.apiBaseUrl}/public/appointments/${token}/reschedule`, data);
  }

  createAppointment(slug: string, data: AppointmentCreate): Observable<Appointment> {
    return this.http.post<Appointment>(`${this.apiBaseUrl}/businesses/${slug}/appointments`, data);
  }
}
