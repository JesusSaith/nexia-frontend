import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { API_BASE_URL } from '../config/api-base-url';
import { Appointment, AppointmentCreate, AvailabilitySlot } from '../models/appointment.model';
import { BusinessBrand, BusinessProfileUpdate, PublicService, PublicStaff } from '../models/business.model';

export interface ManagedAppointment {
  client_name?: string;
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
  needs_approval?: boolean;
}

export interface PrivacyNotice {
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  privacy_notice: string | null;
}

export interface ClientCard {
  id: number;
  full_name: string;
  phone: string;
  email: string | null;
  notes: string | null;
  birthday?: string | null;
  internal_notes: string | null;
  visit_count: number;
  no_show_count: number;
  total_spent: number;
  visits: {
    starts_at: string;
    service_id?: number | null;
    service_name: string;
    staff_id?: number | null;
    staff_name: string;
    price: number;
    status: string;
  }[];
}

export interface ClientRow {
  id: number;
  full_name: string;
  phone: string;
  email: string | null;
  notes: string | null;
  birthday?: string | null;
  visit_count: number;
  total_spent: number;
  cancel_count: number;
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
    staffId: number | null,
    date: string,
    extra: number[] = [],
    resource: string | null = null,
  ): Observable<AvailabilitySlot[]> {
    const params = availabilityParams(serviceId, staffId, extra, resource).set('date', date);
    return this.http.get<AvailabilitySlot[]>(`${this.apiBaseUrl}/businesses/${slug}/availability`, {
      params,
    });
  }

  /** Días (YYYY-MM-DD) del mes con al menos un horario libre. Sin staffId busca con cualquiera. */
  getAvailableDays(
    slug: string,
    serviceId: number,
    staffId: number | null,
    month: string,
    extra: number[] = [],
    resource: string | null = null,
  ): Observable<string[]> {
    const params = availabilityParams(serviceId, staffId, extra, resource).set('month', month);
    return this.http.get<string[]>(`${this.apiBaseUrl}/businesses/${slug}/availability/days`, { params });
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

  /** Guarda (o borra con null) el cumpleaños AAAA-MM-DD sin tocar las notas internas. */
  saveClientBirthday(id: number, birthday: string | null): Observable<ClientCard> {
    return this.http.patch<ClientCard>(`${this.apiBaseUrl}/clients/${id}`, { birthday });
  }

  getClients(): Observable<ClientRow[]> {
    return this.http.get<ClientRow[]>(`${this.apiBaseUrl}/clients`);
  }

  /** Descuento por clienta frecuente que tendría la próxima visita con ese teléfono. */
  getLoyalty(
    slug: string,
    phone: string,
    coupon: string | null = null,
  ): Observable<{ percent: number | null; visits: number; coupon_percent?: number | null }> {
    let params = new HttpParams().set('phone', phone);
    if (coupon) {
      params = params.set('coupon', coupon);
    }
    return this.http.get<{ percent: number | null; visits: number; coupon_percent?: number | null }>(
      `${this.apiBaseUrl}/businesses/${slug}/loyalty`,
      { params },
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

  /**
   * Enlace para compartir la página de reservas. Pasa por el backend para que WhatsApp e Instagram
   * muestren logo y nombre en la vista previa; luego redirige a /:slug/book.
   */
  shareUrl(slug: string): string {
    const url = `${this.apiBaseUrl.replace(/\/api\/?$/, '')}/s/${slug}`;
    // En local la app puede correr en cualquier puerto: se lo decimos al backend para que regrese aquí.
    const local = typeof location !== 'undefined' && ['localhost', '127.0.0.1'].includes(location.hostname);
    return local ? `${url}?app=${encodeURIComponent(location.origin)}` : url;
  }

  getPrivacy(slug: string): Observable<PrivacyNotice> {
    return this.http.get<PrivacyNotice>(`${this.apiBaseUrl}/businesses/${slug}/privacy`);
  }

  /** Enlace público de una foto de referencia; se puede abrir desde WhatsApp. */
  referencePhotoUrl(token: string, index: number): string {
    return `${this.apiBaseUrl}/public/appointments/${token}/photos/${index}`;
  }

  createAppointment(slug: string, data: AppointmentCreate): Observable<Appointment> {
    return this.http.post<Appointment>(`${this.apiBaseUrl}/businesses/${slug}/appointments`, data);
  }
}

function availabilityParams(
  serviceId: number,
  staffId: number | null,
  extra: number[],
  resource: string | null,
): HttpParams {
  let params = new HttpParams().set('service_id', serviceId);
  if (staffId !== null) {
    params = params.set('staff_id', staffId);
  }
  if (extra.length) {
    params = params.set('extra', extra.join(','));
  }
  if (resource) {
    params = params.set('resource', resource);
  }
  return params;
}
