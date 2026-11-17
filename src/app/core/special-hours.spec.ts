import { describe, expect, it } from 'vitest';
import { appointmentsOutside, overlapsOf, sameSpecial, shortClock, specialFor, weekdayOf, winnerOf } from './special-hours';

const season = { id: 1, staff_id: null, date_from: '2026-12-01', date_to: '2026-12-31', weekdays: null };
const week = { id: 2, staff_id: null, date_from: '2026-12-10', date_to: '2026-12-12', weekdays: null };
const own = { id: 3, staff_id: 7, date_from: '2026-12-01', date_to: '2026-12-31', weekdays: null };

describe('specialFor', () => {
  it('sin horario especial devuelve null', () => {
    expect(specialFor([season], 7, '2026-11-30')).toBeNull();
  });

  it('el periodo más corto gana sobre la temporada', () => {
    expect(specialFor([season, week], 7, '2026-12-11')?.id).toBe(2);
    expect(specialFor([season, week], 7, '2026-12-20')?.id).toBe(1);
  });

  it('el horario propio gana sobre el del equipo aunque sea más largo', () => {
    expect(specialFor([season, week, own], 7, '2026-12-11')?.id).toBe(3);
    expect(specialFor([season, week, own], 8, '2026-12-11')?.id).toBe(2);
  });

  it('respeta los días de la semana', () => {
    const weekends = { ...season, id: 4, weekdays: '5,6' };
    expect(weekdayOf('2026-12-05')).toBe(5);
    expect(specialFor([weekends], null, '2026-12-05')?.id).toBe(4);
    expect(specialFor([weekends], null, '2026-12-07')).toBeNull();
  });
});

describe('empalmes', () => {
  it('avisa los que comparten días', () => {
    expect(overlapsOf([season], week).map((row) => row.id)).toEqual([1]);
    expect(overlapsOf([season], { staff_id: null, date_from: '2027-01-02', date_to: '2027-01-03', weekdays: null })).toEqual([]);
  });

  it('un horario de otra persona no estorba', () => {
    expect(overlapsOf([own], { staff_id: 8, date_from: '2026-12-02', date_to: '2026-12-03', weekdays: null })).toEqual([]);
  });

  it('periodos que no comparten día de la semana no se empalman', () => {
    const sundays = { ...season, id: 5, weekdays: '6' };
    expect(overlapsOf([sundays], { staff_id: null, date_from: '2026-12-07', date_to: '2026-12-11', weekdays: null })).toEqual([]);
  });

  it('quién gana', () => {
    expect(winnerOf(week, season)).toBe('new');
    expect(winnerOf(season, week)).toBe('old');
    expect(winnerOf({ ...season, staff_id: 7 }, week)).toBe('new');
  });

  it('mismo horario se reemplaza', () => {
    expect(sameSpecial(season, { ...season, id: 9 })).toBe(true);
    expect(sameSpecial(season, week)).toBe(false);
  });
});

describe('shortClock', () => {
  it('acorta la hora', () => {
    expect(shortClock('09:00')).toBe('9');
    expect(shortClock('18:30')).toBe('18:30');
  });
});

describe('appointmentsOutside', () => {
  const at = (day: string, clock: string, staff = 7, status = 'scheduled') => ({ staff_id: staff, starts_at: `${day}T${clock}:00`, status });
  const hours = { staff_id: 7, date_from: '2026-12-01', date_to: '2026-12-31', weekdays: null, closed: false, start_time: '10:00', end_time: '18:00' };

  it('cuenta las citas fuera de las nuevas horas', () => {
    const rows = [at('2026-12-05', '09:00'), at('2026-12-05', '12:00'), at('2026-12-05', '18:00'), at('2026-11-30', '09:00')];
    expect(appointmentsOutside(rows, hours, []).map((r) => r.starts_at.slice(11, 16))).toEqual(['09:00', '18:00']);
  });

  it('cerrado deja fuera todas las de esas fechas, menos canceladas y de otra persona', () => {
    const rows = [at('2026-12-05', '12:00'), at('2026-12-06', '12:00', 7, 'cancelled'), at('2026-12-07', '12:00', 8)];
    expect(appointmentsOutside(rows, { ...hours, closed: true }, [])).toHaveLength(1);
  });

  it('con horas fijas la última hora sí cabe', () => {
    const rows = [at('2026-12-05', '19:00'), at('2026-12-05', '19:30')];
    expect(appointmentsOutside(rows, { ...hours, start_time: '09:30', end_time: '19:00', fixed: true }, []).map((r) => r.starts_at.slice(11, 16))).toEqual(['19:30']);
  });

  it('si otro horario más específico manda ese día, no cuenta', () => {
    const day = { id: 3, staff_id: 7, date_from: '2026-12-05', date_to: '2026-12-05', weekdays: null };
    expect(appointmentsOutside([at('2026-12-05', '09:00')], hours, [day])).toHaveLength(0);
  });

  it('el horario idéntico al que reemplaza no estorba', () => {
    const same = { id: 4, staff_id: 7, date_from: '2026-12-01', date_to: '2026-12-31', weekdays: null };
    expect(appointmentsOutside([at('2026-12-05', '09:00')], hours, [same])).toHaveLength(1);
  });
});
