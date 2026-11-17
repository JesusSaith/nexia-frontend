/** Horas que alguien escribe a mano ("9:30, 12:30, 4pm y 6 pm") convertidas a "09:30", "12:30", "16:00", "18:00". */
export interface ParsedClocks {
  clocks: string[];
  /** Lo que no se entendió, tal como se escribió. */
  invalid: string[];
}

const TOKEN = /^(\d{1,2})(?::?(\d{2}))?(am|pm)?$/;

/**
 * Sin "am" ni "pm": de 1 a 6 se toma como tarde (un negocio no abre a la 1 de la madrugada), de 9 a 11 como mañana,
 * el 12 como mediodía y de 13 a 23 como hora de 24 h. El 7 y el 8 pueden ser de mañana o de noche, así que se pide
 * escribir "am" o "pm" en vez de adivinar. "0" o "00:30" son de madrugada.
 */
export function parseClocks(text: string): ParsedClocks {
  const normal = text
    .toLowerCase()
    .replace(/\s*([ap])\s*\.?\s*m\.?/g, '$1m')
    .replace(/\bh(?:rs?|oras?)?\b\.?/g, ' ');
  const found = new Set<string>();
  const invalid: string[] = [];
  for (const raw of normal.split(/[\s,;]+|\by\b/).map((part) => part.trim()).filter(Boolean)) {
    const match = TOKEN.exec(raw);
    if (!match) {
      invalid.push(raw);
      continue;
    }
    let hour = Number(match[1]);
    const minute = match[2] ? Number(match[2]) : 0;
    const mark = match[3];
    if (minute > 59 || hour > 23 || (mark && (hour < 1 || hour > 12))) {
      invalid.push(raw);
      continue;
    }
    if (!mark && (hour === 7 || hour === 8) && !match[2]?.length && raw.length <= 2) {
      invalid.push(`${raw} (escribe ${raw}am o ${raw}pm)`);
      continue;
    }
    if (mark === 'pm' && hour < 12) {
      hour += 12;
    } else if (mark === 'am' && hour === 12) {
      hour = 0;
    } else if (!mark && hour >= 1 && hour <= 6) {
      hour += 12;
    }
    found.add(`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);
  }
  return { clocks: [...found].sort(), invalid };
}

/** Horas cada `step` minutos de `from` a `to` ("07:00" a "21:00" cada 30). */
export function clockGrid(from: string, to: string, step = 30): string[] {
  const toMinutes = (clock: string) => Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3, 5));
  const out: string[] = [];
  for (let minutes = toMinutes(from); minutes <= toMinutes(to); minutes += step) {
    out.push(`${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`);
  }
  return out;
}

/** "09:30", "12:30" y "19:00" -> "9:30 a.m., 12:30 p.m. y 7:00 p.m." */
export function clocksSentence(clocks: string[], format: (clock: string) => string): string {
  const list = clocks.map(format);
  return list.length < 2 ? (list[0] ?? '') : `${list.slice(0, -1).join(', ')} y ${list[list.length - 1]}`;
}

/**
 * Horas fijas que no se podrán ofrecer en un turno: caen antes de abrir, después de cerrar (la hora de cierre sí cuenta,
 * igual que en el servidor) o dentro del descanso.
 */
export function clocksOutsideShift(clocks: string[], start: string, end: string, breakStart?: string | null, breakEnd?: string | null): string[] {
  return clocks.filter((clock) => {
    if (clock < start.slice(0, 5) || clock > end.slice(0, 5)) {
      return true;
    }
    return Boolean(breakStart && breakEnd && clock >= breakStart.slice(0, 5) && clock < breakEnd.slice(0, 5));
  });
}
