import { describe, expect, it } from 'vitest';

import { buildDaySheet, daySheetHtml, daySheetText } from './day-sheet';
import { Appointment } from './models/appointment.model';

function cita(over: Partial<Appointment>): Appointment {
  return {
    id: 1,
    client_name: 'Lupe',
    client_phone: '5512345678',
    client_email: null,
    service_id: 1,
    service_name: 'Corte',
    staff_id: 1,
    staff_name: 'Ana',
    starts_at: '2026-10-16T10:00:00',
    status: 'scheduled',
    ...over,
  };
}

describe('buildDaySheet', () => {
  const items = [
    cita({ id: 1, starts_at: '2026-10-16T12:00:00', client_name: 'Beto' }),
    cita({ id: 2, starts_at: '2026-10-16T10:00:00' }),
    cita({ id: 3, staff_name: 'Bety', starts_at: '2026-10-16T09:00:00', client_name: 'Rosa' }),
    cita({ id: 4, status: 'cancelled' }),
    cita({ id: 5, starts_at: '2026-10-17T10:00:00' }),
  ];

  it('agrupa por colaborador, ordena por hora y deja fuera canceladas y otros días', () => {
    const sheet = buildDaySheet(items, '2026-10-16');
    expect(sheet.total).toBe(3);
    expect(sheet.groups.map((group) => group.staff)).toEqual(['Ana', 'Bety']);
    expect(sheet.groups[0].rows.map((row) => row.time)).toEqual(['10:00', '12:00']);
  });

  it('el texto para WhatsApp trae una línea por cita', () => {
    const text = daySheetText(buildDaySheet(items, '2026-10-16'), 'Barbería Norte');
    expect(text).toContain('Barbería Norte');
    expect(text).toContain('3 citas');
    expect(text).toContain('10:00 · Lupe · Corte');
    expect(text).toContain('*Bety*');
  });

  it('un día sin citas lo dice', () => {
    expect(daySheetText(buildDaySheet(items, '2026-10-20'), 'Salón')).toContain('sin citas');
  });

  it('la hoja impresa escapa el HTML de los nombres', () => {
    const sheet = buildDaySheet([cita({ client_name: '<script>x</script>' })], '2026-10-16');
    const html = daySheetHtml(sheet, 'Salón & Spa');
    expect(html).not.toContain('<script>x');
    expect(html).toContain('Salón &amp; Spa');
  });
});
