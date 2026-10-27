import { Appointment } from './models/appointment.model';

/** En qué va una cita ahora mismo, para decirlo con palabras en la agenda, la ficha e Inicio. */
export type ProgressKey = 'approval' | 'deposit' | 'upcoming' | 'live' | 'ended' | 'done' | 'cancelled' | 'no_show';

export interface Progress {
  key: ProgressKey;
  label: string;
  icon: string;
  /** Clase de `.badge` que le toca. */
  badge: 'badge-ok' | 'badge-warn' | 'badge-info' | 'badge-neutral' | 'badge-bad';
}

const DEFAULT_MINUTES = 60;

function parse(value: string): number {
  return new Date(value.includes('T') ? value : value.replace(' ', 'T')).getTime();
}

/**
 * Estado de la cita según su hora: por venir, en curso, terminó sin cobrar o finalizada.
 * Usa `ends_at` (incluye extras); si falta, cuenta `fallbackMinutes` o una hora.
 */
export function appointmentProgress(
  item: Pick<Appointment, 'status' | 'starts_at' | 'ends_at' | 'needs_approval'>,
  now: number = Date.now(),
  fallbackMinutes: number = DEFAULT_MINUTES,
): Progress {
  if (item.status === 'cancelled') {
    return { key: 'cancelled', label: 'Cancelada', icon: 'event_busy', badge: 'badge-bad' };
  }
  if (item.status === 'no_show') {
    return { key: 'no_show', label: 'No llegó', icon: 'person_off', badge: 'badge-bad' };
  }
  if (item.status === 'completed') {
    return { key: 'done', label: 'Finalizada', icon: 'task_alt', badge: 'badge-ok' };
  }
  if (item.needs_approval) {
    return { key: 'approval', label: 'Por aprobar', icon: 'hourglass_top', badge: 'badge-warn' };
  }
  if (item.status === 'awaiting_deposit') {
    return { key: 'deposit', label: 'Falta el anticipo', icon: 'savings', badge: 'badge-warn' };
  }
  const start = parse(item.starts_at);
  const end = item.ends_at ? parse(item.ends_at) : start + fallbackMinutes * 60_000;
  if (now >= end) {
    return { key: 'ended', label: 'Terminó · falta cobrar', icon: 'pending_actions', badge: 'badge-warn' };
  }
  if (now >= start) {
    return { key: 'live', label: 'En curso', icon: 'play_circle', badge: 'badge-info' };
  }
  return { key: 'upcoming', label: 'Por venir', icon: 'schedule', badge: 'badge-neutral' };
}

/**
 * Si la persona ya está comprometida con la cita: confirmó su asistencia, o ya pagó el anticipo.
 * Con anticipo recibido no tiene sentido decir "Sin confirmar".
 */
export function attendanceState(item: Pick<Appointment, 'status' | 'client_confirmed' | 'deposit_amount'>): 'confirmed' | 'deposit' | 'pending' {
  if (item.client_confirmed) {
    return 'confirmed';
  }
  return item.status === 'scheduled' && !!item.deposit_amount ? 'deposit' : 'pending';
}
