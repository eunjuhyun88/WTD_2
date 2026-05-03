import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/authGuard', () => ({
  getAuthUserFromCookies: vi.fn(),
}));
vi.mock('$lib/server/engineTransport', () => ({
  engineFetch: vi.fn(),
}));
vi.mock('$lib/server/terminalPersistence', () => ({
  createPatternCapture: vi.fn(async (_userId: string, body: Record<string, unknown>) => ({
    id: 'cap-1',
    symbol: body.symbol ?? 'BTCUSDT',
    timeframe: body.timeframe ?? '4h',
    contextKind: body.contextKind ?? 'symbol',
    triggerOrigin: body.triggerOrigin ?? 'manual',
    patternSlug: body.patternSlug,
    reason: body.reason,
    note: body.note,
    snapshot: body.snapshot ?? {},
    decision: body.decision ?? {},
    evidenceHash: body.evidenceHash,
    sourceFreshness: body.sourceFreshness ?? {},
    verdictJson: body.verdictJson ?? null,
    createdAt: '2026-04-17T00:00:00+00:00',
    updatedAt: '2026-04-17T00:00:00+00:00',
  })),
  listPatternCaptures: vi.fn(async () => []),
}));

import { POST } from './+server';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { engineFetch } from '$lib/server/engineTransport';
import { createPatternCapture } from '$lib/server/terminalPersistence';

describe('/api/terminal/pattern-captures', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects Save Setup payloads without reviewed-range viewport evidence', async () => {
    (getAuthUserFromCookies as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'user-1' });

    const req = new Request('http://localhost/api/terminal/pattern-captures', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        symbol: 'BTCUSDT',
        timeframe: '4h',
        contextKind: 'symbol',
        triggerOrigin: 'manual',
        snapshot: {},
        decision: {},
        sourceFreshness: { source: 'terminal_save_setup' },
      }),
    });

    const res = await POST({ cookies: {}, request: req } as any);

    expect(res.status).toBe(400);
  });

  it('accepts Save Setup payloads with reviewed-range viewport evidence', async () => {
    (getAuthUserFromCookies as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'user-1' });

    const req = new Request('http://localhost/api/terminal/pattern-captures', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        symbol: 'BTCUSDT',
        timeframe: '4h',
        contextKind: 'symbol',
        triggerOrigin: 'manual',
        snapshot: {
          viewport: {
            timeFrom: 1713312000,
            timeTo: 1713326400,
            tf: '4h',
            barCount: 4,
            klines: [{ time: 1713312000, open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 }],
            indicators: {},
          },
        },
        decision: {},
        sourceFreshness: { source: 'terminal_save_setup' },
      }),
    });

    const res = await POST({ cookies: {}, request: req } as any);

    expect(res.status).toBe(200);
    expect(createPatternCapture).toHaveBeenCalledTimes(1);
    expect(engineFetch).not.toHaveBeenCalled();
  });

  it('W-0392 Ph3: accepts and persists verdictJson when provided', async () => {
    (getAuthUserFromCookies as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'user-1' });

    const verdictJson = { direction: 'bullish', entry: 42500, stop: 41500, target: 44000, p_win: 0.62 };

    const req = new Request('http://localhost/api/terminal/pattern-captures', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        symbol: 'BTCUSDT',
        timeframe: '4h',
        contextKind: 'symbol',
        triggerOrigin: 'range_mode_save',
        snapshot: {
          viewport: {
            timeFrom: 1713312000,
            timeTo: 1713326400,
            tf: '4h',
            barCount: 4,
            klines: [{ time: 1713312000, open: 42000, high: 43000, low: 41000, close: 42500, volume: 1000 }],
            indicators: {},
          },
        },
        decision: {},
        sourceFreshness: {},
        verdictJson,
      }),
    });

    const res = await POST({ cookies: {}, request: req } as any);

    expect(res.status).toBe(200);
    const call = (createPatternCapture as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[1]).toMatchObject({ verdictJson });
  });
});
