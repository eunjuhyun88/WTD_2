import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import * as secretCrypto from '$lib/server/secretCrypto';

vi.mock('$lib/server/authGuard', () => ({
  getAuthUserFromCookies: vi.fn(async () => ({ id: 'user-test-1' })),
}));

vi.mock('$lib/server/db', () => ({
  query: vi.fn(async () => ({ rows: [{ id: 'key-uuid-1', created_at: new Date().toISOString() }], rowCount: 1 })),
}));

vi.mock('$lib/server/secretCrypto', () => ({
  isSecretsEncryptionConfigured: vi.fn(() => true),
  encryptSecret: vi.fn((v: string) => `enc:v1:mock.${v}`),
}));

import { GET, POST, DELETE } from './+server';

describe('/api/keys', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAuthUserFromCookies).mockResolvedValue({ id: 'user-test-1' } as any);
    vi.mocked(secretCrypto.isSecretsEncryptionConfigured).mockReturnValue(true);
    vi.mocked(secretCrypto.encryptSecret).mockImplementation((v) => `enc:v1:mock.${v}`);
  });

  // AC1: trade 권한 키 reject + 에러 메시지
  it('AC1: rejects keys with trade permission and returns descriptive error', async () => {
    const req = new Request('http://localhost/api/keys', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        exchange: 'binance',
        api_key: 'TESTKEY123',
        secret: 'supersecret',
        permissions: ['read', 'trade'],
      }),
    });

    const res = await POST({ cookies: {}, request: req, url: new URL('http://localhost/api/keys') } as any);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/READ-ONLY/);
    expect(body.rejected_permissions).toContain('trade');
  });

  it('AC1: rejects keys with withdraw permission', async () => {
    const req = new Request('http://localhost/api/keys', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        exchange: 'bybit',
        api_key: 'TESTKEY456',
        secret: 'supersecret2',
        permissions: ['read', 'withdraw'],
      }),
    });

    const res = await POST({ cookies: {}, request: req, url: new URL('http://localhost/api/keys') } as any);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/READ-ONLY/);
    expect(body.rejected_permissions).toContain('withdraw');
  });

  it('AC1: accepts read-only keys (no trade/withdraw permissions)', async () => {
    const { query } = await import('$lib/server/db');
    vi.mocked(query).mockResolvedValueOnce({ rows: [{ id: 'key-uuid-ok', created_at: new Date().toISOString() }], rowCount: 1 } as any);

    const req = new Request('http://localhost/api/keys', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        exchange: 'binance',
        api_key: 'READONLYKEY123',
        secret: 'readsecret',
        permissions: ['read'],
      }),
    });

    const res = await POST({ cookies: {}, request: req, url: new URL('http://localhost/api/keys') } as any);

    expect(res.status).toBe(201);
  });

  // AC2: secret 평문 응답 미포함
  it('AC2: POST response does not contain secret key in JSON', async () => {
    const { query } = await import('$lib/server/db');
    vi.mocked(query).mockResolvedValueOnce({ rows: [{ id: 'key-uuid-2', created_at: new Date().toISOString() }], rowCount: 1 } as any);

    const req = new Request('http://localhost/api/keys', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        exchange: 'binance',
        api_key: 'TESTREADKEY',
        secret: 'my-plaintext-secret',
        permissions: [],
      }),
    });

    const res = await POST({ cookies: {}, request: req, url: new URL('http://localhost/api/keys') } as any);
    const body = await res.json();

    // AC2: response JSON must not have a 'secret' key
    expect(Object.keys(body)).not.toContain('secret');
    // And must not contain the plaintext secret value
    expect(JSON.stringify(body)).not.toContain('my-plaintext-secret');
  });

  it('AC2: GET response does not contain secret key in JSON', async () => {
    const { query } = await import('$lib/server/db');
    vi.mocked(query).mockResolvedValueOnce({
      rows: [
        {
          id: 'key-uuid-3',
          exchange: 'binance',
          api_key: 'ABCDEFGHIJ1234',
          permissions: [],
          is_read_only: true,
          created_at: new Date().toISOString(),
          last_verified_at: null,
        },
      ],
      rowCount: 1,
    } as any);

    const res = await GET({ cookies: {}, url: new URL('http://localhost/api/keys') } as any);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.keys).toHaveLength(1);
    // AC2: no 'secret' field in any key object
    for (const k of body.keys) {
      expect(Object.keys(k)).not.toContain('secret');
      expect(Object.keys(k)).not.toContain('secret_encrypted');
    }
    // api_key must be masked
    expect(body.keys[0].api_key).toBe('**********1234');
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getAuthUserFromCookies).mockResolvedValueOnce(null);

    const res = await GET({ cookies: {}, url: new URL('http://localhost/api/keys') } as any);
    expect(res.status).toBe(401);
  });
});
