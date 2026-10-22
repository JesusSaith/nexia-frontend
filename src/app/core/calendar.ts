/**
 * "Agregar a mi calendario": un archivo .ics (lo abren el calendario del iPhone, Outlook y casi todos los de Android)
 * o el enlace de Google Calendar. Lo usan la confirmación de la reserva y la página de la cita.
 * El evento lleva dos avisos: un día antes y dos horas antes, para que funcione como recordatorio de la clienta.
 */
export interface CalendarEvent {
  start: Date;
  end: Date;
  title: string;
  location: string;
  details: string;
  /** Identifica la cita: al volver a agregarla (p. ej. tras cambiarla) el calendario la actualiza en vez de duplicarla. */
  uid: string;
}

/** AAAAMMDDTHHMMSS con la hora local, sin zona: el calendario la toma como la hora de la persona. */
export function calendarStamp(value: Date): string {
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${value.getFullYear()}${pad(value.getMonth() + 1)}${pad(value.getDate())}T${pad(value.getHours())}${pad(value.getMinutes())}00`;
}

export function googleCalendarUrl(event: CalendarEvent): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${calendarStamp(event.start)}/${calendarStamp(event.end)}`,
    details: event.details,
    location: event.location,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Contenido del .ics, con los saltos de línea que pide el formato. */
export function icsContent(event: CalendarEvent, now = new Date()): string {
  const escape = (text: string) => text.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/[,;]/g, (char) => `\\${char}`);
  const alarm = (trigger: string) => ['BEGIN:VALARM', `TRIGGER:${trigger}`, 'ACTION:DISPLAY', `DESCRIPTION:${escape(event.title)}`, 'END:VALARM'];
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Nexia//Reservas//ES',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${event.uid}@nexia`,
    `DTSTAMP:${now.toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
    `DTSTART:${calendarStamp(event.start)}`,
    `DTEND:${calendarStamp(event.end)}`,
    `SUMMARY:${escape(event.title)}`,
    `LOCATION:${escape(event.location)}`,
    `DESCRIPTION:${escape(event.details)}`,
    ...alarm('-P1D'),
    ...alarm('-PT2H'),
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

export function downloadIcs(event: CalendarEvent): void {
  const url = URL.createObjectURL(new Blob([icsContent(event)], { type: 'text/calendar;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'mi-cita.ics';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
