/** Días festivos de México que se sugieren como cierre (oficiales y los que casi todos los negocios cierran). */
export interface Holiday {
  date: string;
  label: string;
}

export function mexicanHolidays(year: number): Holiday[] {
  const easter = easterSunday(year);
  const list: Holiday[] = [
    { date: iso(year, 1, 1), label: 'Año Nuevo' },
    { date: nthMonday(year, 2, 1), label: 'Día de la Constitución' },
    { date: nthMonday(year, 3, 3), label: 'Natalicio de Benito Juárez' },
    { date: shift(easter, -3), label: 'Jueves Santo' },
    { date: shift(easter, -2), label: 'Viernes Santo' },
    { date: iso(year, 5, 1), label: 'Día del Trabajo' },
    { date: iso(year, 9, 16), label: 'Día de la Independencia' },
    { date: iso(year, 11, 2), label: 'Día de Muertos' },
    { date: nthMonday(year, 11, 3), label: 'Día de la Revolución' },
    { date: iso(year, 12, 12), label: 'Día de la Virgen de Guadalupe' },
    { date: iso(year, 12, 25), label: 'Navidad' },
  ];
  // Cambio de gobierno federal: 1 de octubre cada 6 años (2030, 2036…).
  if ((year - 2024) % 6 === 0) {
    list.push({ date: iso(year, 10, 1), label: 'Transmisión del Poder Ejecutivo' });
  }
  return list.sort((left, right) => left.date.localeCompare(right.date));
}

/** Los que vienen en los próximos 12 meses a partir de hoy. */
export function upcomingHolidays(today: string): Holiday[] {
  const year = Number(today.slice(0, 4));
  const limit = `${year + 1}${today.slice(4)}`;
  return [...mexicanHolidays(year), ...mexicanHolidays(year + 1)].filter((item) => item.date >= today && item.date < limit);
}

function iso(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function nthMonday(year: number, month: number, nth: number): string {
  const first = new Date(year, month - 1, 1).getDay();
  const offset = (8 - first) % 7;
  return iso(year, month, 1 + offset + (nth - 1) * 7);
}

function shift(date: Date, days: number): string {
  const moved = new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
  return iso(moved.getFullYear(), moved.getMonth() + 1, moved.getDate());
}

/** Domingo de Pascua (algoritmo de Gauss/Meeus). */
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}
