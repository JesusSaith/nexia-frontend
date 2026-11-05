/** "15:30" -> "3:30 p.m." (las horas se guardan en 24 h; a las personas se les muestran en 12 h). Con `short`, "9:00" queda "9 a.m.". */
export function hora12(value: string | null | undefined, short = false): string {
  if (!value || !/^\d{1,2}:\d{2}/.test(value)) {
    return value ?? '';
  }
  const [hour, minute] = value.split(':').map(Number);
  const mark = hour >= 12 ? 'p.m.' : 'a.m.';
  const base = hour % 12 || 12;
  return short && minute === 0 ? `${base} ${mark}` : `${base}:${String(minute).padStart(2, '0')} ${mark}`;
}

/** "09:00" y "18:00" -> "9:00 a.m.–6:00 p.m.". */
export function horario12(start: string, end: string): string {
  return `${hora12(start)}–${hora12(end)}`;
}
