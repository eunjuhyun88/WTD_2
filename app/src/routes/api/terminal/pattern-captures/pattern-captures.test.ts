import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/authGuard', () => ({
  getAuthUserFromCookies: vi.fn(),
}));
vi.mock('$lib/server/terminalPersistence', () => ({
  createPatternCapture: vi.fn(),
  listPatternCaptures: vi.fn(async () => []),
}));

import { GET, POST } from './+server';
import { getAuthUserFromCookies } from '$lib/server/authGuard';

describe('/api/terminal/pattern-captures', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requires authentication for GET', async () => {
    (getAuthUserFromCookies as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await GET({ cookies: {}, url: new URL('http://localhost/api/terminal/pattern-captures') } as any);
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid POST payload', async () => {
    (getAuthUserFromCookies as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'user-1' });
    const req = new Request('http://localhost/api/terminal/pattern-captures', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ symbol: '', timeframe: '4h', triggerOrigin: 'manual' }),
    });
    const res = await POST({ cookies: {}, request: req } as any);
    expect(res.status).toBe(400);
  });
});
