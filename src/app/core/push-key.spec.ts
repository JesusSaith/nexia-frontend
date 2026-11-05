import { describe, expect, it } from 'vitest';

import { keyToBytes } from './push-key';

describe('keyToBytes', () => {
  it('convierte base64 url-safe sin relleno', () => {
    // "hola" en base64 es "aG9sYQ==" → sin relleno "aG9sYQ"
    expect(Array.from(keyToBytes('aG9sYQ'))).toEqual([104, 111, 108, 97]);
  });

  it('entiende los caracteres - y _', () => {
    // 0xfb 0xff 0xbf → "-_-_" en url-safe ("+/+/" en base64 normal)
    expect(Array.from(keyToBytes('-_-_'))).toEqual([0xfb, 0xff, 0xbf]);
  });
});
