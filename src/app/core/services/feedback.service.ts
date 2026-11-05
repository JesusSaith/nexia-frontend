import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { API_BASE_URL } from '../config/api-base-url';

/** Comentarios de quienes usan la beta; le llegan por correo a quien administra Nexia. */
@Injectable({ providedIn: 'root' })
export class FeedbackService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(API_BASE_URL);

  send(message: string, page: string | null): Observable<void> {
    return this.http.post<void>(`${this.apiBaseUrl}/feedback`, { message, page });
  }
}
