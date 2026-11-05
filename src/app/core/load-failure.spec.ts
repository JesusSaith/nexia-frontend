import { HttpErrorResponse } from '@angular/common/http';
import { describe, expect, it } from 'vitest';

import { loadFailure, missing } from './load-failure';

describe('loadFailure', () => {
  it('sin internet', () => {
    expect(loadFailure(new HttpErrorResponse({ status: 0 })).kind).toBe('network');
  });
  it('negocio que no existe', () => {
    expect(loadFailure(new HttpErrorResponse({ status: 404 }))).toEqual(missing());
  });
  it('falla del servidor o error raro', () => {
    expect(loadFailure(new HttpErrorResponse({ status: 500 })).kind).toBe('other');
    expect(loadFailure(new Error('x')).kind).toBe('other');
  });
});
