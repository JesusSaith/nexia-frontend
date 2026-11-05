import { describe, expect, it } from 'vitest';

import { isMarketingHost } from './role.guard';

describe('isMarketingHost', () => {
  it('el dominio principal y www siempre muestran la página de inicio', () => {
    expect(isMarketingHost('nexiacitas.com')).toBe(true);
    expect(isMarketingHost('www.nexiacitas.com')).toBe(true);
  });

  it('app.*, local y otros dominios conservan la redirección al panel', () => {
    expect(isMarketingHost('app.nexiacitas.com')).toBe(false);
    expect(isMarketingHost('localhost')).toBe(false);
    expect(isMarketingHost('127.0.0.1')).toBe(false);
    expect(isMarketingHost('nexia-frontend.yisuscond.workers.dev')).toBe(false);
  });
});
