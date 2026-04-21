import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/authGuard', () => ({
  getAuthUserFromCookies: vi.fn(),
}));

import { GET } from './+server';
import { getAuthUserFromCookies } from '$lib/server/authGuard';

describe('/api/observability/metrics', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('requires authentication', async () => {
    (getAuthUserFromCookies as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await GET({ cookies: {} } as any);

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
  });

  it('proxies engine metrics through the authenticated app boundary', async () => {
    (getAuthUserFromCookies as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'user-1' });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      counters: { 'http.requests_total': 12 },
      timings_ms: { 'http.request_duration_ms': { count: 12, avg_ms: 20.5, p95_ms: 42 } },
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }) as any);

    const res = await GET({ cookies: {} } as any);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      counters: { 'http.requests_total': 12 },
      timings_ms: { 'http.request_duration_ms': { count: 12, avg_ms: 20.5, p95_ms: 42 } },
    });
    const [, init] = vi.mocked(globalThis.fetch).mock.calls[0]!;
    expect(new Headers(init?.headers).get('x-engine-internal-secret')).toBe('test-engine-secret');
  });
});
