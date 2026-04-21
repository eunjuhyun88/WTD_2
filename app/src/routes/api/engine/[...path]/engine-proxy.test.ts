import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST } from './+server';

describe('/api/engine/[...path]', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('proxies GET to engine and returns upstream body', async () => {
    const upstream = new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(upstream as any);

    const req = new Request('http://localhost/api/engine/healthz', { method: 'GET' });
    const res = await GET({ request: req, params: { path: 'healthz' } } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost:8000/healthz',
      expect.objectContaining({
        method: 'GET',
        headers: expect.any(Headers),
      }),
    );
    const [, init] = vi.mocked(globalThis.fetch).mock.calls[0]!;
    expect(new Headers(init?.headers).get('x-engine-internal-secret')).toBe('test-engine-secret');
  });

  it('rejects non-allowlisted paths', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const req = new Request('http://localhost/api/engine/patterns/states', { method: 'GET' });
    const res = await GET({ request: req, params: { path: 'patterns/states' } } as any);
    expect(res.status).toBe(404);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects capture endpoints so browser callers use named app routes', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const req = new Request('http://localhost/api/engine/captures/cap-123/verdict', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ verdict: 'valid' }),
    });
    const res = await POST({
      request: req,
      params: { path: 'captures/cap-123/verdict' },
      getClientAddress: () => '127.0.0.1',
    } as any);
    expect(res.status).toBe(404);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
