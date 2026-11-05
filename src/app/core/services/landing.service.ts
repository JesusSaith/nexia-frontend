import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { API_BASE_URL } from '../config/api-base-url';

export interface LandingStats {
  appointments: number;
  businesses: number;
  spots_total: number;
  spots_left: number;
}

export type LandingStep = 'visit' | 'form' | 'start' | 'sent' | 'whatsapp' | 'tab' | 'giro' | 'quiz';

const VISITOR_KEY = 'nexia-landing-visitor';
const SOURCE_KEY = 'nexia-landing-source';

/** Medición de la landing: cada paso se anota una vez por visita. Nunca avisa ni estorba si falla. */
@Injectable({ providedIn: 'root' })
export class LandingService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(API_BASE_URL);
  private readonly done = new Set<string>();

  /** Fuente del enlace (?fuente=instagram o utm_source); se recuerda en la pestaña para el formulario. */
  source(): string | null {
    try {
      const params = new URLSearchParams(location.search);
      const found = (params.get('fuente') ?? params.get('utm_source') ?? '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40);
      if (found) {
        sessionStorage.setItem(SOURCE_KEY, found);
      }
      return sessionStorage.getItem(SOURCE_KEY);
    } catch {
      return null;
    }
  }

  /** Citas y negocios reales (sin la demo); la landing los muestra solo cuando ya son una cifra que da confianza. */
  stats(): Observable<LandingStats> {
    return this.http.get<LandingStats>(`${this.apiBaseUrl}/landing/stats`);
  }

  /** Anota un paso; `detail` dice cuál pestaña, giro o pregunta del quiz (se cuenta una vez por visita). */
  track(step: LandingStep, detail?: string): void {
    const key = `${step}:${detail ?? ''}`;
    if (this.done.has(key)) {
      return;
    }
    this.done.add(key);
    const clean = detail?.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40);
    this.http.post(`${this.apiBaseUrl}/landing/events`, { visitor: this.visitorId(), step, detail: clean || undefined, source: this.source() }).subscribe({ error: () => undefined });
  }

  private visitorId(): string {
    try {
      let id = sessionStorage.getItem(VISITOR_KEY);
      if (!id) {
        id = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('');
        sessionStorage.setItem(VISITOR_KEY, id);
      }
      return id;
    } catch {
      return Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('');
    }
  }
}
