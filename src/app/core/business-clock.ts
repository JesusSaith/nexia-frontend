import { Injectable, inject } from '@angular/core';

import { AuthService } from './services/auth.service';

/**
 * La hora de pared de un negocio como una fecha "local" del navegador.
 *
 * Las citas se guardan como hora local del negocio, sin zona, y la Agenda las lee como hora del navegador. Para que
 * "hoy" y "ahora" coincidan con ellas, se toma la hora que marca el reloj en la zona del negocio y se arma una fecha
 * con esos mismos números. Sin zona, o si no es válida, se usa la hora del navegador.
 */
export function wallClock(timeZone: string | null | undefined, at: Date = new Date()): Date {
  if (!timeZone) {
    return at;
  }
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(at);
    const value = (type: string): number => Number(parts.find((part) => part.type === type)?.value ?? 0);
    return new Date(value('year'), value('month') - 1, value('day'), value('hour'), value('minute'), value('second'));
  } catch {
    return at;
  }
}

@Injectable({ providedIn: 'root' })
export class BusinessClock {
  private readonly auth = inject(AuthService);

  /** Ahora, en la zona del negocio. */
  now(): Date {
    return wallClock(this.auth.currentUser()?.timezone);
  }

  /** Hoy a las 00:00, en la zona del negocio. */
  today(): Date {
    const now = this.now();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  nowMs(): number {
    return this.now().getTime();
  }
}
