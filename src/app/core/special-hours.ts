import type { SpecialHours } from './services/schedules.service';

/** Mismo criterio que `special_for` del backend: qué horario especial manda cada día cuando se empalman varios. */
export type SpecialLike = Pick<SpecialHours, 'staff_id' | 'date_from' | 'date_to' | 'weekdays'> & { id?: number };

/** Día de la semana con lunes = 0 (igual que el backend), de una fecha "2026-12-24". */
export function weekdayOf(day: string): number {
  return (new Date(`${day}T12:00:00`).getDay() + 6) % 7;
}

function weekdaySet(weekdays: string | null | undefined): Set<number> | null {
  if (!weekdays) {
    return null;
  }
  const days = new Set(weekdays.split(',').map((part) => Number(part.trim())).filter((value) => value >= 0 && value <= 6));
  return days.size && days.size < 7 ? days : null;
}

/** ¿Este horario especial aplica ese día (fecha dentro del periodo y día de la semana permitido)? */
export function appliesOn(row: SpecialLike, day: string): boolean {
  if (day < row.date_from || day > row.date_to) {
    return false;
  }
  const only = weekdaySet(row.weekdays);
  return !only || only.has(weekdayOf(day));
}

function spanDays(row: SpecialLike): number {
  return Math.round((new Date(`${row.date_to}T12:00:00`).getTime() - new Date(`${row.date_from}T12:00:00`).getTime()) / 86_400_000);
}

/** Qué tan específico es (mayor gana): periodo corto, solo ciertos días de la semana, más reciente. */
export function specialRank(row: SpecialLike): [number, number, number] {
  return [-spanDays(row), weekdaySet(row.weekdays) ? 1 : 0, row.id ?? Number.MAX_SAFE_INTEGER];
}

function compare(a: SpecialLike, b: SpecialLike): number {
  const left = specialRank(a);
  const right = specialRank(b);
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return left[index] - right[index];
    }
  }
  return 0;
}

/** El horario especial que manda ese día para esa persona: el de la persona sobre el del equipo, y luego el más específico. */
export function specialFor<T extends SpecialLike>(rows: T[], staffId: number | null, day: string): T | null {
  const today = rows.filter((row) => appliesOn(row, day));
  const mine = today.filter((row) => staffId !== null && row.staff_id === staffId);
  const pool = mine.length ? mine : today.filter((row) => row.staff_id === null);
  return pool.length ? pool.reduce((best, row) => (compare(row, best) > 0 ? row : best)) : null;
}

/** Gana `fresh` (el que se está por guardar) o `old` cuando se empalman. */
export function winnerOf(fresh: SpecialLike, old: SpecialLike): 'new' | 'old' {
  if ((fresh.staff_id !== null) !== (old.staff_id !== null)) {
    return fresh.staff_id !== null ? 'new' : 'old';
  }
  return compare({ ...fresh, id: Number.MAX_SAFE_INTEGER }, old) >= 0 ? 'new' : 'old';
}

/** Mismo alcance, fechas y días: guardarlo reemplaza al anterior (no se duplica). */
export function sameSpecial(a: SpecialLike, b: SpecialLike): boolean {
  return a.staff_id === b.staff_id && a.date_from === b.date_from && a.date_to === b.date_to && (a.weekdays || null) === (b.weekdays || null);
}

/** Horarios ya guardados que se empalman con uno nuevo: comparten algún día y alguien a quien afectan. */
export function overlapsOf<T extends SpecialLike>(rows: T[], fresh: SpecialLike): T[] {
  return rows.filter((row) => {
    if (fresh.staff_id !== null && row.staff_id !== null && fresh.staff_id !== row.staff_id) {
      return false;
    }
    const from = row.date_from > fresh.date_from ? row.date_from : fresh.date_from;
    const to = row.date_to < fresh.date_to ? row.date_to : fresh.date_to;
    if (from > to) {
      return false;
    }
    const cursor = new Date(`${from}T12:00:00`);
    for (let guard = 0; guard < 400; guard += 1) {
      const day = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
      if (day > to) {
        return false;
      }
      if (appliesOn(row, day) && appliesOn(fresh, day)) {
        return true;
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    return false;
  });
}

/** "09:00" -> "9", "09:30" -> "9:30": cabe en la casilla de un día del calendario. */
export function shortClock(clock: string): string {
  const [hour, minute] = clock.split(':').map(Number);
  return minute ? `${hour}:${String(minute).padStart(2, '0')}` : String(hour);
}

export interface AppointmentLike {
  staff_id: number;
  starts_at: string;
  status: string;
}

/** Un horario especial por guardar, con las horas que traería. `fixed`: la última hora fija es también la última cita posible. */
export type DraftHours = SpecialLike & { closed: boolean; start_time: string; end_time: string; fixed?: boolean };

/**
 * Citas ya agendadas (en pie) que el horario especial nuevo dejaría fuera: solo cuenta los días en que el nuevo es el que manda
 * (si otro más específico gana ese día, la cita no cambia) y no el horario idéntico que el nuevo reemplazaría.
 */
export function appointmentsOutside<A extends AppointmentLike>(appointments: A[], fresh: DraftHours, rows: SpecialLike[]): A[] {
  const draft: DraftHours = { ...fresh, id: Number.MAX_SAFE_INTEGER };
  const others = rows.filter((row) => !sameSpecial(row, fresh));
  return appointments.filter((item) => {
    if (item.status !== 'scheduled' && item.status !== 'awaiting_deposit') {
      return false;
    }
    if (fresh.staff_id !== null && item.staff_id !== fresh.staff_id) {
      return false;
    }
    const day = item.starts_at.slice(0, 10);
    if (!appliesOn(draft, day) || specialFor([...others, draft], item.staff_id, day) !== draft) {
      return false;
    }
    if (fresh.closed) {
      return true;
    }
    const clock = item.starts_at.slice(11, 16);
    return clock < fresh.start_time || (fresh.fixed ? clock > fresh.end_time : clock >= fresh.end_time);
  });
}
