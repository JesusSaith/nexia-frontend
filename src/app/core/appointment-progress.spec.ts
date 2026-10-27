import { describe, expect, it } from 'vitest';
import { appointmentProgress, attendanceState } from './appointment-progress';

const base = { starts_at: '2026-10-26T10:00:00', ends_at: '2026-10-26T11:30:00', status: 'scheduled' as const, needs_approval: false };
const at = (time: string) => new Date(`2026-10-26T${time}:00`).getTime();

describe('appointmentProgress', () => {
  it('por venir antes de la hora', () => {
    expect(appointmentProgress(base, at('09:00')).key).toBe('upcoming');
  });

  it('en curso entre el inicio y el final', () => {
    expect(appointmentProgress(base, at('10:00')).key).toBe('live');
    expect(appointmentProgress(base, at('11:29')).label).toBe('En curso');
  });

  it('terminó y falta cobrar al llegar al final', () => {
    const state = appointmentProgress(base, at('11:30'));
    expect(state.key).toBe('ended');
    expect(state.label).toBe('Terminó · falta cobrar');
  });

  it('sin ends_at usa la duración de respaldo', () => {
    const item = { ...base, ends_at: null };
    expect(appointmentProgress(item, at('10:50'), 45).key).toBe('ended');
    expect(appointmentProgress(item, at('10:30'), 45).key).toBe('live');
  });

  it('los estados que no dependen de la hora mandan', () => {
    expect(appointmentProgress({ ...base, status: 'completed' }, at('09:00')).label).toBe('Finalizada');
    expect(appointmentProgress({ ...base, status: 'cancelled' }, at('10:30')).key).toBe('cancelled');
    expect(appointmentProgress({ ...base, status: 'no_show' }, at('10:30')).key).toBe('no_show');
    expect(appointmentProgress({ ...base, status: 'awaiting_deposit' }, at('10:30')).key).toBe('deposit');
    expect(appointmentProgress({ ...base, needs_approval: true }, at('10:30')).key).toBe('approval');
  });
});

describe('attendanceState', () => {
  it('confirmó cuando la persona dijo que va', () => {
    expect(attendanceState({ status: 'scheduled', client_confirmed: true, deposit_amount: null })).toBe('confirmed');
  });

  it('anticipo recibido cuenta como comprometida aunque no haya confirmado', () => {
    expect(attendanceState({ status: 'scheduled', client_confirmed: false, deposit_amount: 100 })).toBe('deposit');
  });

  it('sin confirmar y sin anticipo sigue pendiente', () => {
    expect(attendanceState({ status: 'scheduled', client_confirmed: false, deposit_amount: null })).toBe('pending');
    expect(attendanceState({ status: 'awaiting_deposit', client_confirmed: false, deposit_amount: 100 })).toBe('pending');
  });
});
