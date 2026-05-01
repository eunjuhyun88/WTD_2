import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./db', () => ({
  query: vi.fn(),
  withTransaction: vi.fn(),
}));

import { query } from './db';
import { withTransaction } from './db';
import {
  createAuthSession,
  createWalletOnlyUser,
  findAuthUserByWallet,
  findAuthUserForLogin,
  findAuthUserByEmail,
  createEmailOnlyUser,
} from './authRepository';

const row = {
  id: 'user-1',
  email: 'jin@example.com',
  nickname: 'jin',
  tier: 'verified',
  phase: 2,
  wallet_address: '0x1111111111111111111111111111111111111111',
};

describe('authRepository.findAuthUserForLogin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('finds a user by email and wallet when nickname is omitted', async () => {
    vi.mocked(query).mockResolvedValueOnce({ rows: [row], rowCount: 1 } as never);

    const result = await findAuthUserForLogin(
      'jin@example.com',
      '',
      '0x1111111111111111111111111111111111111111',
    );

    expect(result).toEqual(row);
    const [sql, params] = vi.mocked(query).mock.calls[0] ?? [];
    expect(sql).toContain('lower(email) = lower($1)');
    expect(sql).toContain('lower(wallet_address) = lower($2)');
    expect(sql).not.toContain('lower(nickname)');
    expect(params).toEqual(['jin@example.com', '0x1111111111111111111111111111111111111111']);
  });

  it('keeps nickname as an additional login qualifier when provided', async () => {
    vi.mocked(query).mockResolvedValueOnce({ rows: [row], rowCount: 1 } as never);

    await findAuthUserForLogin(
      'jin@example.com',
      '  jin  ',
      '0x1111111111111111111111111111111111111111',
    );

    const [sql, params] = vi.mocked(query).mock.calls[0] ?? [];
    expect(sql).toContain('lower(nickname) = lower($2)');
    expect(sql).toContain('lower(wallet_address) = lower($3)');
    expect(params).toEqual(['jin@example.com', 'jin', '0x1111111111111111111111111111111111111111']);
  });

  it('falls back to app_users + user_wallets when users.wallet_address is absent', async () => {
    vi.mocked(query)
      .mockRejectedValueOnce({ code: '42703' })
      .mockResolvedValueOnce({ rows: [row], rowCount: 1 } as never);

    const result = await findAuthUserForLogin(
      'jin@example.com',
      '',
      '0x1111111111111111111111111111111111111111',
    );

    expect(result).toEqual(row);
    const [fallbackSql, params] = vi.mocked(query).mock.calls[1] ?? [];
    expect(fallbackSql).toContain('FROM app_users u');
    expect(fallbackSql).toContain('JOIN user_wallets w ON w.user_id = u.id');
    expect(fallbackSql).toContain('lower(w.address) = lower($2)');
    expect(params).toEqual(['jin@example.com', '0x1111111111111111111111111111111111111111']);
  });
});

describe('authRepository wallet schema compatibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('finds wallet users from user_wallets when the canonical users table is unavailable', async () => {
    vi.mocked(query)
      .mockRejectedValueOnce({ code: '42P01' })
      .mockResolvedValueOnce({ rows: [row], rowCount: 1 } as never);

    const result = await findAuthUserByWallet('0x1111111111111111111111111111111111111111');

    expect(result).toEqual(row);
    const [fallbackSql, params] = vi.mocked(query).mock.calls[1] ?? [];
    expect(fallbackSql).toContain('FROM user_wallets w');
    expect(fallbackSql).toContain('JOIN app_users u ON u.id = w.user_id');
    expect(params).toEqual(['0x1111111111111111111111111111111111111111']);
  });

  it('creates auth_sessions when sessions is unavailable', async () => {
    vi.mocked(query)
      .mockRejectedValueOnce({ code: '42P01' })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as never)
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);

    await createAuthSession({
      token: 'session-token',
      userId: 'user-1',
      expiresAtIso: '2026-05-01T00:00:00.000Z',
      userAgent: 'Vitest',
      ipAddress: '127.0.0.1',
    });

    const [fallbackSql, params] = vi.mocked(query).mock.calls[1] ?? [];
    expect(fallbackSql).toContain('INSERT INTO auth_sessions');
    expect(fallbackSql).toContain('session_token');
    expect(params).toEqual(['session-token', 'user-1', '2026-05-01T00:00:00.000Z', 'Vitest', '127.0.0.1']);
  });

  it('creates wallet-only users in app_users + user_wallets when users insert is unavailable', async () => {
    const client = {
      query: vi.fn()
        .mockResolvedValueOnce({
          rows: [{
            id: 'user-2',
            email: null,
            nickname: 'Trader_111111',
            tier: 'verified',
            phase: 2,
          }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }),
    };
    vi.mocked(query).mockRejectedValueOnce({ code: '42703' });
    vi.mocked(withTransaction).mockImplementationOnce(async (fn) => fn(client as never));

    const result = await createWalletOnlyUser(
      '0x1111111111111111111111111111111111111111',
      '0xsig',
    );

    expect(result).toEqual({
      id: 'user-2',
      email: null,
      nickname: 'Trader_111111',
      tier: 'verified',
      phase: 2,
      wallet_address: '0x1111111111111111111111111111111111111111',
    });
    expect(client.query.mock.calls[0]?.[0]).toContain('INSERT INTO app_users');
    expect(client.query.mock.calls[1]?.[0]).toContain('INSERT INTO user_wallets');
  });
});

// ── W-0373: email-only Privy user path ───────────────────────────────────────
describe('authRepository email-only user (W-0373)', () => {
  const emailRow = {
    id: 'user-email-1',
    email: 'alice@example.com',
    nickname: 'alice',
    tier: 'registered' as const,
    phase: 1,
    wallet_address: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('findAuthUserByEmail returns user when email matches', async () => {
    vi.mocked(query).mockResolvedValueOnce({ rows: [emailRow], rowCount: 1 } as never);

    const result = await findAuthUserByEmail('alice@example.com');

    expect(result).toEqual(emailRow);
    const [sql, params] = vi.mocked(query).mock.calls[0] ?? [];
    expect(sql).toContain('lower(email) = lower($1)');
    expect(params).toEqual(['alice@example.com']);
  });

  it('findAuthUserByEmail returns null when no match', async () => {
    vi.mocked(query).mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);

    const result = await findAuthUserByEmail('nobody@example.com');

    expect(result).toBeNull();
  });

  it('findAuthUserByEmail returns null for empty email', async () => {
    const result = await findAuthUserByEmail('');
    expect(result).toBeNull();
    expect(vi.mocked(query)).not.toHaveBeenCalled();
  });

  it('createEmailOnlyUser inserts into users and returns row', async () => {
    vi.mocked(query).mockResolvedValueOnce({
      rows: [emailRow],
      rowCount: 1,
    } as never);

    const result = await createEmailOnlyUser('alice@example.com', 'did:privy:abc123');

    expect(result.email).toBe('alice@example.com');
    expect(result.tier).toBe('registered');
    expect(result.phase).toBe(1);
    expect(result.wallet_address).toBeNull();

    const [sql, params] = vi.mocked(query).mock.calls[0] ?? [];
    expect(sql).toContain('INSERT INTO users');
    expect(params?.[0]).toBe('alice@example.com');
  });

  it('createEmailOnlyUser retries on nickname collision', async () => {
    vi.mocked(query)
      .mockRejectedValueOnce({ code: '23505', constraint: 'uq_users_nickname_lower' })
      .mockResolvedValueOnce({ rows: [{ ...emailRow, nickname: 'alice_AB1' }], rowCount: 1 } as never);

    const result = await createEmailOnlyUser('alice@example.com', 'did:privy:abc123');

    expect(result.email).toBe('alice@example.com');
    expect(vi.mocked(query).mock.calls.length).toBe(2);
  });
});
