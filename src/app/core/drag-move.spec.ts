import { describe, expect, it } from 'vitest';

import { DragInput, dragTarget } from './drag-move';

const base: DragInput = {
  startsAt: '2026-10-16T10:00:00',
  dx: 0,
  dy: 0,
  slotHeight: 28,
  slotMinutes: 30,
  columnWidth: 200,
  dayStart: 9 * 60,
  dayEnd: 18 * 60,
  duration: 60,
  view: 'day',
  staffId: 2,
  staffIds: [1, 2, 3],
  days: ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18'],
};

describe('dragTarget', () => {
  it('sin arrastrar no cambia nada', () => {
    expect(dragTarget(base).changed).toBe(false);
  });

  it('ajusta la hora a la cuadrícula de 30 minutos', () => {
    expect(dragTarget({ ...base, dy: 30 }).startsAt).toBe('2026-10-16T10:30:00');
    expect(dragTarget({ ...base, dy: -56 }).startsAt).toBe('2026-10-16T09:00:00');
    expect(dragTarget({ ...base, dy: 10 }).changed).toBe(false);
  });

  it('no sale del horario ni deja la cita pasada del cierre', () => {
    expect(dragTarget({ ...base, dy: -900 }).startsAt).toBe('2026-10-16T09:00:00');
    expect(dragTarget({ ...base, dy: 900 }).startsAt).toBe('2026-10-16T17:00:00');
  });

  it('en Día, mover a los lados cambia de colaborador y se queda en los extremos', () => {
    expect(dragTarget({ ...base, dx: 210 }).staffId).toBe(3);
    expect(dragTarget({ ...base, dx: -210 }).staffId).toBe(1);
    expect(dragTarget({ ...base, dx: 900 }).staffId).toBe(3);
  });

  it('en Semana, mover a los lados cambia de día y el colaborador no cambia', () => {
    const target = dragTarget({ ...base, view: 'week', dx: -410 });
    expect(target.startsAt).toBe('2026-10-14T10:00:00');
    expect(target.staffId).toBe(2);
  });
});
