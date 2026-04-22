import { afterEach, describe, expect, it } from 'vitest';
import {
  decryptApiKey,
  encryptApiKey,
  isExchangeEncryptionConfigured,
} from './binanceConnector.js';

const PREV_EXCHANGE_ENCRYPTION_KEY = process.env.EXCHANGE_ENCRYPTION_KEY;

afterEach(() => {
  if (PREV_EXCHANGE_ENCRYPTION_KEY === undefined) {
    delete process.env.EXCHANGE_ENCRYPTION_KEY;
  } else {
    process.env.EXCHANGE_ENCRYPTION_KEY = PREV_EXCHANGE_ENCRYPTION_KEY;
  }
});

describe('binanceConnector exchange secret handling', () => {
  it('stays import-safe when EXCHANGE_ENCRYPTION_KEY is absent', () => {
    delete process.env.EXCHANGE_ENCRYPTION_KEY;

    expect(isExchangeEncryptionConfigured()).toBe(false);
    expect(() => encryptApiKey('secret')).toThrow(/EXCHANGE_ENCRYPTION_KEY is required/i);
  });

  it('round-trips encrypted values when EXCHANGE_ENCRYPTION_KEY is configured', () => {
    process.env.EXCHANGE_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef';

    const encrypted = encryptApiKey('top-secret-value');

    expect(isExchangeEncryptionConfigured()).toBe(true);
    expect(encrypted).not.toContain('top-secret-value');
    expect(decryptApiKey(encrypted)).toBe('top-secret-value');
  });
});
