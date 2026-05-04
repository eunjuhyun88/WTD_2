import { describe, it, expect } from 'vitest';

function validateApiKey(key: string): boolean {
  return /^[A-Za-z0-9]{64}$/.test(key);
}
function validateSecret(secret: string): boolean {
  return secret.length >= 30;
}

describe('BinanceKeyForm validation', () => {
  it('rejects 63-char key', () => {
    expect(validateApiKey('A'.repeat(63))).toBe(false);
  });
  it('accepts 64-char alphanumeric key', () => {
    expect(validateApiKey('A'.repeat(64))).toBe(true);
  });
  it('rejects key with special chars', () => {
    expect(validateApiKey('A'.repeat(63) + '!')).toBe(false);
  });
  it('rejects short secret', () => {
    expect(validateSecret('short')).toBe(false);
  });
  it('accepts 30+ char secret', () => {
    expect(validateSecret('A'.repeat(30))).toBe(true);
  });
});
