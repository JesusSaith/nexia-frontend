import { describe, expect, it } from 'vitest';

import { cancelWindow, depositPolicyText, depositReasonText } from './deposit-policy';

describe('cancelWindow', () => {
  it('dice días cuando son días completos y horas si no', () => {
    expect(cancelWindow(24)).toBe('1 día');
    expect(cancelWindow(48)).toBe('2 días');
    expect(cancelWindow(12)).toBe('12 horas');
    expect(cancelWindow(1)).toBe('1 hora');
    expect(cancelWindow(null)).toBe('');
  });
});

describe('depositPolicyText', () => {
  it('avisa que se devuelve si cancela con tiempo', () => {
    expect(depositPolicyText('refund', 24)).toBe('Si cancelas con al menos 1 día de anticipación, te devolvemos el anticipo. Si no llegas, no se devuelve.');
  });

  it('sin plazo, se devuelve si cancela antes de que empiece', () => {
    expect(depositPolicyText('refund', null)).toContain('antes de que empiece');
  });

  it('avisa que no se devuelve', () => {
    expect(depositPolicyText('keep', 24)).toBe('Si cancelas, el anticipo no se devuelve.');
  });
});

describe('depositReasonText', () => {
  it('solo explica el anticipo por faltas', () => {
    expect(depositReasonText('repeat_no_show')).toContain('no pudiste asistir');
    expect(depositReasonText(null)).toBe('');
  });
});
