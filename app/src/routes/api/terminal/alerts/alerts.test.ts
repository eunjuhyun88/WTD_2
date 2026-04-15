import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/authGuard', () => ({
  getAuthUserFromCookies: vi.fn(),
}));
vi.mock('$lib/server/terminalPersistence', () => ({
  listTerminalAlerts: vi.fn(async () => []),
  upsertTerminalAlert: vi.fn(),
}));

import { GET, POST } from './+server';
import { getAuthUserFromCookies } from '$lib/server/authGuard';

describe('/api/terminal/alerts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requires authentication for GET', async () => {
    (getAuthUserFromCookies as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await GET({ cookies: {} } as any);
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid POST payload', async () => {
    (getAuthUserFromCookies as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'user-1' });
    const req = new Request('http://localhost/api/terminal/alerts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ symbol: 'BTCUSDT', timeframe: '4h', kind: '', params: {} }),
    });
    const res = await POST({ cookies: {}, request: req } as any);
    expect(res.status).toBe(400);
  });
});
