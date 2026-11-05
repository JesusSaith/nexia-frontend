import { calendarStamp, googleCalendarUrl, icsContent } from './calendar';

const event = {
  start: new Date(2026, 9, 22, 18, 0),
  end: new Date(2026, 9, 22, 18, 45),
  title: 'Corte · Salón, Prueba',
  location: 'Calle 1, Centro',
  details: 'Con mayra\nVer o cambiar: https://x.mx/manage/abc',
  uid: 'abc123',
};

describe('calendario', () => {
  it('usa la hora local sin zona', () => {
    expect(calendarStamp(event.start)).toBe('20261022T180000');
  });

  it('el .ics trae la cita, el lugar y dos avisos (un día y dos horas antes)', () => {
    const ics = icsContent(event, new Date('2026-10-20T12:00:00Z'));
    expect(ics).toContain('UID:abc123@nexia');
    expect(ics).toContain('DTSTART:20261022T180000');
    expect(ics).toContain('DTEND:20261022T184500');
    expect(ics).toContain('SUMMARY:Corte · Salón\\, Prueba');
    expect(ics).toContain('LOCATION:Calle 1\\, Centro');
    expect(ics).toContain('TRIGGER:-P1D');
    expect(ics).toContain('TRIGGER:-PT2H');
    expect(ics.split('\r\n')[0]).toBe('BEGIN:VCALENDAR');
  });

  it('el enlace de Google Calendar lleva fecha, título y lugar', () => {
    const url = googleCalendarUrl(event);
    expect(url).toContain('calendar.google.com/calendar/render');
    expect(url).toContain('dates=20261022T180000%2F20261022T184500');
    expect(url).toContain('location=Calle+1%2C+Centro');
  });
});
