import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { engineFetch } from '$lib/server/engineTransport';

vi.mock('$lib/server/authGuard', () => ({
  getAuthUserFromCookies: vi.fn(async () => ({ id: 'user-1' })),
}));

vi.mock('$lib/server/engineTransport', () => ({
  engineFetch: vi.fn(async () => new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })),
}));

import { POST } from './+server';

describe('/api/captures', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('binds authenticated user_id onto canonical capture writes', async () => {
    vi.mocked(getAuthUserFromCookies).mockResolvedValueOnce({ id: 'user-1' } as any);

    const req = new Request('http://localhost/api/captures', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        capture_kind: 'pattern_candidate',
        symbol: 'BTCUSDT',
        pattern_slug: 'tradoor-oi-reversal-v1',
      }),
    });

    const res = await POST({
      request: req,
      cookies: {},
    } as any);

    expect(res.status).toBe(200);
    expect(vi.mocked(engineFetch)).toHaveBeenCalledWith(
      '/captures',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          capture_kind: 'pattern_candidate',
          symbol: 'BTCUSDT',
          pattern_slug: 'tradoor-oi-reversal-v1',
          user_id: 'user-1',
        }),
      }),
    );
  });
});
