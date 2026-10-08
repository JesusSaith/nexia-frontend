import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { API_BASE_URL } from '../config/api-base-url';
import { Appointment, AppointmentCreate, AvailabilitySlot } from '../models/appointment.model';
import { BusinessBrand, BusinessProfileUpdate, PublicService, PublicStaff } from '../models/business.model';

export interface ManagedAppointment {
  business_name: string;
  business_slug: string;
  logo_url?: string | null;
  primary_color?: string | null;
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
  cancel_policy?: string | null;
  payment_url?: string | null;
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
    extra: number[] = [],
    resource: string | null = null,
  ): Observable<AvailabilitySlot[]> {
    let params = new HttpParams()
      .set('service_id', serviceId)
      .set('staff_id', staffId)
      .set('date', date);
    if (extra.length) {
      params = params.set('extra', extra.join(','));
    }
    if (resource) {
      params = params.set('resource', resource);
    }
    return this.http.get<AvailabilitySlot[]>(`${this.apiBaseUrl}/businesses/${slug}/availability`, {
      params,
    });
  }

  joinWaitlist(
    slug: string,
    body: { service_id: number; staff_id: number; day: string; client_name: string; client_phone: string },
  ): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(`${this.apiBaseUrl}/businesses/${slug}/waitlist`, body);
  }

  getClient(id: number): Observable<ClientCard> {
    return this.http.get<ClientCard>(`${this.apiBaseUrl}/clients/${id}`);
  }

  saveClientNotes(id: number, internalNotes: string): Observable<ClientCard> {
    return this.http.patch<ClientCard>(`${this.apiBaseUrl}/clients/${id}`, {
      internal_notes: internalNotes,
    });
  }

  getClients(): Observable<{ id: number; full_name: string; phone: string; email: string | null; notes: string | null; visit_count: number; total_spent: number; cancel_count: number }[]> {
    return this.http.get<{ id: number; full_name: string; phone: string; email: string | null; notes: string | null; visit_count: number; total_spent: number; cancel_count: number }[]>(
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

  packageLeft(slug: string, phone: string): Observable<{ label: string; total: number; remaining: number } | null> {
    return this.http.get<{ label: string; total: number; remaining: number } | null>(
      `${this.apiBaseUrl}/businesses/${slug}/package`,
      { params: new HttpParams().set('phone', phone) },
    );
  }

  markPaid(token: string): Observable<ManagedAppointment> {
    return this.http.post<ManagedAppointment>(`${this.apiBaseUrl}/public/appointments/${token}/paid`, {});
  }

  createAppointment(slug: string, data: AppointmentCreate): Observable<Appointment> {
    return this.http.post<Appointment>(`${this.apiBaseUrl}/businesses/${slug}/appointments`, data);
  }
}
