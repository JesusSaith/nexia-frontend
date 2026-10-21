import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { API_BASE_URL } from '../config/api-base-url';
import { Closure } from '../models/business.model';

/** Un paso de "qué te falta" (ver app/core/readiness.py en el backend). */
export interface ReadinessStep {
  key: string;
  label: string;
  done: boolean;
  path: string;
  /** Sección de Configuración que abre el aviso (/admin/settings?sec=…). */
  section?: string | null;
  /** arranque: sin esto no se puede reservar · perfil: da confianza · aviso: algo está mal configurado. */
  group: 'arranque' | 'perfil' | 'aviso';
}

export interface Readiness {
  can_book: boolean;
  steps: ReadinessStep[];
}

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
  description?: string | null;
  business_kind?: string | null;
  primary_color?: string | null;
  canvas_color?: string | null;
  accent_color?: string | null;
  button_shape?: string | null;
  button_fill?: string | null;
  font_style?: string | null;
  header_style?: string | null;
  logo_url: string | null;
  phone: string;
  email: string;
  address: string | null;
  latitude?: number | null;
  longitude?: number | null;
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
  google_review_url?: string | null;
  privacy_notice?: string | null;
  loyalty_every?: number | null;
  loyalty_percent?: number | null;
  /** JSON: [{"code":"BIENVENIDA","percent":10,"first_visit":true}] */
  coupons?: string | null;
  /** Zona IANA; "hoy" y "ahora" de la agenda se calculan con ella. */
  timezone: string;
  /** Tipos de aviso que le llegan por correo a la dueña. */
  email_alerts: string[];
  bookings_paused: boolean;
  closures: Closure[];
  payment_methods: string[];
  approve_bookings: boolean;
  uses_commissions?: boolean;
  auto_reminders: boolean;
  reminder_hours: number;
  auto_return: boolean;
  /** El servidor tiene conectada la API de WhatsApp; sin ella lo automático no sale. */
  whatsapp_ready: boolean;
  /** Hay CLABE válida: Banxico confirma los anticipos solo. */
  spei_check: boolean;
  promo_text: string | null;
  promo_until: string | null;
  gallery: string[];
  message_templates: Record<string, string>;
  hours: BusinessHour[];
}

export interface ProfileUpdate {
  name?: string;
  description?: string | null;
  business_kind?: string | null;
  logo_url?: string | null;
  primary_color?: string | null;
  canvas_color?: string | null;
  accent_color?: string | null;
  button_shape?: string | null;
  button_fill?: string | null;
  font_style?: string | null;
  header_style?: string | null;
  phone: string;
  address: string | null;
  latitude?: number | null;
  longitude?: number | null;
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
  google_review_url?: string | null;
  privacy_notice?: string | null;
  loyalty_every?: number | null;
  loyalty_percent?: number | null;
  coupons?: string | null;
  timezone?: string | null;
  email_alerts?: string[];
  bookings_paused?: boolean;
  closures?: Closure[];
  payment_methods?: string[];
  approve_bookings?: boolean;
  uses_commissions?: boolean;
  auto_reminders?: boolean;
  reminder_hours?: number;
  auto_return?: boolean;
  promo_text?: string | null;
  promo_until?: string | null;
  gallery?: string[];
  message_templates?: Record<string, string>;
}

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(API_BASE_URL);

  getSettings(): Observable<BusinessSettings> {
    return this.http.get<BusinessSettings>(`${this.apiBaseUrl}/settings/business`);
  }

  /** Datos de ejemplo: servicios del giro, equipo, clientas y citas, para demos o para arrancar. */
  demoStatus(): Observable<{ loaded: boolean }> {
    return this.http.get<{ loaded: boolean }>(`${this.apiBaseUrl}/settings/demo`);
  }

  loadDemo(): Observable<Record<string, number>> {
    return this.http.post<Record<string, number>>(`${this.apiBaseUrl}/settings/demo`, {});
  }

  clearDemo(): Observable<void> {
    return this.http.delete<void>(`${this.apiBaseUrl}/settings/demo`);
  }

  getReadiness(): Observable<Readiness> {
    return this.http.get<Readiness>(`${this.apiBaseUrl}/settings/readiness`);
  }

  /** Marca "Comparte tu enlace" como hecho, en el negocio y no en este navegador. */
  markShared(): Observable<void> {
    return this.http.post<void>(`${this.apiBaseUrl}/settings/readiness/shared`, {});
  }

  updateProfile(data: Partial<ProfileUpdate>): Observable<BusinessSettings> {
    return this.http.patch<BusinessSettings>(`${this.apiBaseUrl}/settings/business`, data);
  }

  /** Cambia el enlace (/salon-ana); el anterior sigue funcionando. */
  changeSlug(slug: string): Observable<BusinessSettings> {
    return this.http.put<BusinessSettings>(`${this.apiBaseUrl}/settings/slug`, { slug });
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
