import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/engineTransport', () => ({
  engineFetch: vi.fn(async () => new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })),
}));

import { POST } from './+server';
import { engineFetch } from '$lib/server/engineTransport';

describe('/api/patterns/[slug]/verdict legacy shim', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects symbol-only verdict writes', async () => {
    const req = new Request('http://localhost/api/patterns/demo/verdict', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ symbol: 'BTCUSDT', verdict: 'valid' }),
    });

    const res = await POST({
      params: { slug: 'demo-pattern' },
      request: req,
    } as any);

    expect(res.status).toBe(400);
    expect(engineFetch).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.error).toContain('capture_id');
  });

  it('forwards capture-based verdict writes to canonical captures route', async () => {
    const req = new Request('http://localhost/api/patterns/demo/verdict', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ capture_id: 'cap-7', verdict: 'missed', user_note: 'late' }),
    });

    const res = await POST({
      params: { slug: 'demo-pattern' },
      request: req,
    } as any);

    expect(res.status).toBe(200);
    expect(engineFetch).toHaveBeenCalledWith(
      '/captures/cap-7/verdict',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ verdict: 'missed', user_note: 'late' }),
      }),
    );
  });
});
