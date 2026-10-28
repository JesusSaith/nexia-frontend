import { describe, expect, it } from 'vitest';

import { phoneLabel, telLink } from './phone-label';

describe('phoneLabel', () => {
  it('separa 10 dígitos en grupos', () => expect(phoneLabel('2712054908')).toBe('271 205 4908'));
  it('respeta lo que ya trae formato raro', () => expect(phoneLabel('+52 271 205 4908')).toBe('+52 271 205 4908'));
  it('vacío', () => expect(phoneLabel(null)).toBe(''));
});

describe('telLink', () => {
  it('agrega +52 a 10 dígitos', () => expect(telLink('271 205 4908')).toBe('tel:+522712054908'));
  it('sin número, nada', () => expect(telLink('')).toBeNull());
});
