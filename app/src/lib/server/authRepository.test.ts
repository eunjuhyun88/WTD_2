import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./db', () => ({
  query: vi.fn(),
}));

import { query } from './db';
import { findAuthUserForLogin } from './authRepository';

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
});
