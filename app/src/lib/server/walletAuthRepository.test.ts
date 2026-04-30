import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./db', () => ({
  query: vi.fn(),
  withTransaction: vi.fn(),
}));

import { query, withTransaction } from './db';
import { linkWalletToUser } from './walletAuthRepository';

describe('walletAuthRepository.linkWalletToUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('stores wallet links in app_users + user_wallets when users wallet columns are absent', async () => {
    const client = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }),
    };
    vi.mocked(query)
      .mockRejectedValueOnce({ code: '42703' })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);
    vi.mocked(withTransaction).mockImplementationOnce(async (fn) => fn(client as never));

    await linkWalletToUser({
      userId: 'user-1',
      address: '0x1111111111111111111111111111111111111111',
      signature: '0xsig',
      provider: 'metamask',
      chain: 'BASE',
    });

    expect(client.query.mock.calls[0]?.[0]).toContain('UPDATE app_users');
    expect(client.query.mock.calls[1]?.[0]).toContain('INSERT INTO user_wallets');
    expect(client.query.mock.calls[1]?.[1]).toEqual([
      'user-1',
      '0x1111111111111111111111111111111111111111',
      'BASE',
      'metamask',
      '0xsig',
    ]);
    expect(vi.mocked(query).mock.calls[1]?.[0]).toContain('INSERT INTO wallet_connections');
  });
});
