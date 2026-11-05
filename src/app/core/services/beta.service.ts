import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { API_BASE_URL } from '../config/api-base-url';

export interface BetaRequestBody {
  name: string;
  email: string;
  phone: string;
  business_name: string;
  kind: string;
  message: string | null;
  /** Cuántas personas atienden en el negocio (opcional). */
  people: number | null;
  /** Fuente del enlace (?fuente=instagram), si la trae. */
  source: string | null;
  /** Campo trampa para robots: siempre va vacío cuando lo llena una persona. */
  website: string;
}

/** Solicitudes de acceso a la beta desde la landing (público, sin sesión). */
@Injectable({ providedIn: 'root' })
export class BetaService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(API_BASE_URL);

  request(body: BetaRequestBody): Observable<void> {
    return this.http.post<void>(`${this.apiBaseUrl}/beta`, body);
  }
}
