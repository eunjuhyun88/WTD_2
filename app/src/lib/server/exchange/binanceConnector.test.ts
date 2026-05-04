import crypto from 'node:crypto';
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

  it('produces 4-part ciphertext with unique salt per call', () => {
    process.env.EXCHANGE_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef';

    const a = encryptApiKey('my-api-key');
    const b = encryptApiKey('my-api-key');

    expect(a.split(':').length).toBe(4);
    expect(b.split(':').length).toBe(4);
    // different salt → different ciphertext even for same plaintext
    expect(a).not.toBe(b);
  });

  it('decrypts legacy 3-part ciphertext (backward compatibility)', () => {
    process.env.EXCHANGE_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef';

    // Construct a legacy 3-part ciphertext using the old hardcoded-salt approach.
    const key = crypto.scryptSync('0123456789abcdef0123456789abcdef', 'cogochi-salt', 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    let enc = cipher.update('legacy-secret', 'utf8', 'hex');
    enc += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    const legacyCiphertext = `${iv.toString('hex')}:${authTag}:${enc}`;

    expect(legacyCiphertext.split(':').length).toBe(3);
    expect(decryptApiKey(legacyCiphertext)).toBe('legacy-secret');
  });

  it('throws on invalid ciphertext format', () => {
    process.env.EXCHANGE_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef';
    expect(() => decryptApiKey('only:two')).toThrow(/Invalid ciphertext format/i);
    expect(() => decryptApiKey('one:two:three:four:five')).toThrow(/Invalid ciphertext format/i);
  });
});
