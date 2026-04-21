import { beforeEach, describe, expect, it, vi } from 'vitest';

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
import { engineFetch } from '$lib/server/engineTransport';

describe('/api/captures/[id]/verdict', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('normalizes legacy user_verdict payloads to canonical verdict payloads', async () => {
    const req = new Request('http://localhost/api/captures/cap-1/verdict', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ user_verdict: 'valid', user_note: 'looks good' }),
    });

    const res = await POST({
      params: { id: 'cap-1' },
      request: req,
      cookies: {},
    } as any);

    expect(res.status).toBe(200);
    expect(engineFetch).toHaveBeenCalledWith(
      '/captures/cap-1/verdict',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ verdict: 'valid', user_note: 'looks good' }),
      }),
    );
  });
});
