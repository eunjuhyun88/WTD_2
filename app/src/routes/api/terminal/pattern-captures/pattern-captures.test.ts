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
import { createPatternCapture } from '$lib/server/terminalPersistence';

describe('/api/terminal/pattern-captures', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requires authentication for GET', async () => {
    (getAuthUserFromCookies as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await GET({ cookies: {}, url: new URL('http://localhost/api/terminal/pattern-captures') } as any);
    expect(res.status).toBe(401);
  });

  it('returns 400 when reviewed-range viewport is missing', async () => {
    (getAuthUserFromCookies as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'user-1' });
    const req = new Request('http://localhost/api/terminal/pattern-captures', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ symbol: 'BTCUSDT', timeframe: '4h', triggerOrigin: 'manual', snapshot: {} }),
    });
    const res = await POST({ cookies: {}, request: req } as any);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'Reviewed chart range is required' });
  });

  it('creates a pattern capture for a valid reviewed range', async () => {
    (getAuthUserFromCookies as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'user-1' });
    (createPatternCapture as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'pcap-1',
      symbol: 'BTCUSDT',
      timeframe: '4h',
      contextKind: 'symbol',
      triggerOrigin: 'manual',
      snapshot: {
        viewport: {
          timeFrom: 1713300000,
          timeTo: 1713303600,
          tf: '4h',
          barCount: 2,
          klines: [
            { time: 1713300000, open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 },
            { time: 1713303600, open: 1.5, high: 2.5, low: 1.2, close: 2.1, volume: 20 },
          ],
          indicators: {},
        },
      },
      decision: {},
      sourceFreshness: {},
      createdAt: '2026-04-17T00:00:00+00:00',
      updatedAt: '2026-04-17T00:00:00+00:00',
    });
    const req = new Request('http://localhost/api/terminal/pattern-captures', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        symbol: 'BTCUSDT',
        timeframe: '4h',
        triggerOrigin: 'manual',
        snapshot: {
          viewport: {
            timeFrom: 1713300000,
            timeTo: 1713303600,
            tf: '4h',
            barCount: 2,
            klines: [
              { time: 1713300000, open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 },
              { time: 1713303600, open: 1.5, high: 2.5, low: 1.2, close: 2.1, volume: 20 },
            ],
            indicators: {},
          },
        },
      }),
    });
    const res = await POST({ cookies: {}, request: req } as any);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual(
      expect.objectContaining({
        ok: true,
        records: [expect.objectContaining({ id: 'pcap-1' })],
      }),
    );
  });
});
