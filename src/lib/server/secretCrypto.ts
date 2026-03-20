import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { env } from '$env/dynamic/private';

const ENC_PREFIX = 'enc:v1:';

let _cachedKey: Buffer | null | undefined;

function loadEncryptionKey(): Buffer | null {
  if (_cachedKey !== undefined) return _cachedKey;

  const raw = env.SECRETS_ENCRYPTION_KEY?.trim() || '';
  if (!raw) {
    _cachedKey = null;
    return _cachedKey;
  }

  let key: Buffer;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    key = Buffer.from(raw, 'hex');
  } else {
    key = Buffer.from(raw, 'base64');
  }

  if (key.length !== 32) {
    throw new Error('SECRETS_ENCRYPTION_KEY must decode to exactly 32 bytes');
  }

  _cachedKey = key;
  return _cachedKey;
}

function requireEncryptionKey(): Buffer {
  const key = loadEncryptionKey();
  if (!key) {
    throw new Error('SECRETS_ENCRYPTION_KEY is not set');
  }
  return key;
}

export function isSecretsEncryptionConfigured(): boolean {
  try {
    return Boolean(loadEncryptionKey());
  } catch {
    return false;
  }
}

export function encryptSecret(value: string): string {
  const plain = value.trim();
  if (!plain) return plain;

  const key = requireEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${ENC_PREFIX}${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
}

export function decryptSecret(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  // Backward compatibility: allow already-plain secrets (legacy rows).
  if (!trimmed.startsWith(ENC_PREFIX)) {
    return trimmed;
  }

  const payload = trimmed.slice(ENC_PREFIX.length);
  const [ivB64, tagB64, encryptedB64] = payload.split('.');
  if (!ivB64 || !tagB64 || !encryptedB64) {
    throw new Error('Encrypted secret payload is malformed');
  }

  const key = requireEncryptionKey();
  const iv = Buffer.from(ivB64, 'base64url');
  const tag = Buffer.from(tagB64, 'base64url');
  const encrypted = Buffer.from(encryptedB64, 'base64url');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}
