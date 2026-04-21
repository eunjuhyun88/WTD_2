import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { engineFetch } from '$lib/server/engineTransport';

vi.mock('$lib/server/authGuard', () => ({
  getAuthUserFromCookies: vi.fn(async () => ({ id: 'user-1' })),
}));

vi.mock('$lib/server/engineTransport', () => ({
  engineFetch: vi.fn(async () => new Response(JSON.stringify({ ok: true, annotations: [] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })),
}));

import { GET } from './+server';

describe('/api/captures/chart-annotations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('injects authenticated user_id into chart annotation reads', async () => {
    vi.mocked(getAuthUserFromCookies).mockResolvedValueOnce({ id: 'user-1' } as any);

    const res = await GET({
      url: new URL('http://localhost/api/captures/chart-annotations?symbol=BTCUSDT&timeframe=1h&limit=25'),
      cookies: {},
    } as any);

    expect(res.status).toBe(200);
    expect(vi.mocked(engineFetch)).toHaveBeenCalledWith(
      '/captures/chart-annotations?user_id=user-1&symbol=BTCUSDT&timeframe=1h&limit=25',
      expect.objectContaining({
        method: 'GET',
      }),
    );
  });
});
