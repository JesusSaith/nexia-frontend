export interface DragInput {
  /** Inicio actual de la cita: "2026-10-16T10:00:00". */
  startsAt: string;
  /** Cuánto se arrastró, en píxeles. */
  dx: number;
  dy: number;
  slotHeight: number;
  slotMinutes: number;
  /** Ancho de una columna (colaborador en Día, día en Semana). */
  columnWidth: number;
  /** Límites de la cuadrícula, en minutos del día. */
  dayStart: number;
  dayEnd: number;
  /** Duración de la cita en minutos, para que no se salga por abajo. */
  duration: number;
  view: 'day' | 'week';
  staffId: number;
  /** Colaboradores en el orden de las columnas del Día. */
  staffIds: number[];
  /** Fechas "YYYY-MM-DD" de las columnas de la Semana. */
  days: string[];
}

export interface DragTarget {
  startsAt: string;
  staffId: number;
  changed: boolean;
}

/** A dónde cae una cita arrastrada: la hora se ajusta a la cuadrícula y se queda dentro del horario visible. */
export function dragTarget(input: DragInput): DragTarget {
  const date = input.startsAt.slice(0, 10);
  const minutes = Number(input.startsAt.slice(11, 13)) * 60 + Number(input.startsAt.slice(14, 16));
  const stepped = Math.round(input.dy / input.slotHeight) * input.slotMinutes;
  const latest = Math.max(input.dayStart, input.dayEnd - Math.max(input.duration, input.slotMinutes));
  const moved = Math.min(latest, Math.max(input.dayStart, minutes + stepped));
  const columns = input.columnWidth > 0 ? Math.round(input.dx / input.columnWidth) : 0;

  let day = date;
  let staffId = input.staffId;
  if (input.view === 'day') {
    const index = input.staffIds.indexOf(input.staffId);
    if (index >= 0) {
      staffId = input.staffIds[Math.min(input.staffIds.length - 1, Math.max(0, index + columns))];
    }
  } else {
    const index = input.days.indexOf(date);
    if (index >= 0) {
      day = input.days[Math.min(input.days.length - 1, Math.max(0, index + columns))];
    }
  }
  const hh = String(Math.floor(moved / 60)).padStart(2, '0');
  const mm = String(moved % 60).padStart(2, '0');
  const startsAt = `${day}T${hh}:${mm}:00`;
  return { startsAt, staffId, changed: startsAt !== input.startsAt.slice(0, 19) || staffId !== input.staffId };
}
