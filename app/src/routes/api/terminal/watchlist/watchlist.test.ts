import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/authGuard', () => ({
  getAuthUserFromCookies: vi.fn(),
}));
vi.mock('$lib/server/terminalPersistence', () => ({
  listTerminalWatchlist: vi.fn(async () => []),
  replaceTerminalWatchlist: vi.fn(async () => []),
}));

import { GET, PUT } from './+server';
import { getAuthUserFromCookies } from '$lib/server/authGuard';

describe('/api/terminal/watchlist', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requires authentication for GET', async () => {
    (getAuthUserFromCookies as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await GET({ cookies: {}, fetch: globalThis.fetch } as any);
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid PUT payload', async () => {
    (getAuthUserFromCookies as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'user-1' });
    const req = new Request('http://localhost/api/terminal/watchlist', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ items: [{ symbol: '', timeframe: '4h', sortOrder: -1 }] }),
    });
    const res = await PUT({ cookies: {}, request: req, fetch: globalThis.fetch } as any);
    expect(res.status).toBe(400);
  });
});
