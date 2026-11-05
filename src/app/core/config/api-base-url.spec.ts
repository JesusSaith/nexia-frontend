import { describe, expect, it } from 'vitest';

import { apiBaseUrl } from './api-base-url';

describe('apiBaseUrl', () => {
  it('en local apunta al backend de desarrollo', () => {
    expect(apiBaseUrl('localhost', 'http://localhost:4200')).toBe('http://localhost:8001/api');
    expect(apiBaseUrl('127.0.0.1', 'http://127.0.0.1:4200')).toBe('http://localhost:8001/api');
  });

  it('sin dominio propio usa /api del mismo origen (Vercel lo reenvía)', () => {
    expect(apiBaseUrl('nexia.vercel.app', 'https://nexia.vercel.app')).toBe('https://nexia.vercel.app/api');
  });

  it('con dominio propio, app.* habla con api.*', () => {
    expect(apiBaseUrl('app.ejemplo.com', 'https://app.ejemplo.com')).toBe('https://api.ejemplo.com/api');
  });

  it('la landing en el dominio principal y en www también habla con api.*', () => {
    expect(apiBaseUrl('ejemplo.com', 'https://ejemplo.com')).toBe('https://api.ejemplo.com/api');
    expect(apiBaseUrl('www.ejemplo.com', 'https://www.ejemplo.com')).toBe('https://api.ejemplo.com/api');
  });
});
