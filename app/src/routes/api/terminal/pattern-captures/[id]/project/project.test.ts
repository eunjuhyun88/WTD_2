import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/authGuard', () => ({
  getAuthUserFromCookies: vi.fn(),
}));
vi.mock('$lib/server/terminalPersistence', () => ({
  listPatternCaptures: vi.fn(),
}));
vi.mock('$lib/server/engineClient', async () => {
  const actual = await vi.importActual<typeof import('$lib/server/engineClient')>('$lib/server/engineClient');
  return {
    EngineError: actual.EngineError,
    engine: {
      createChallenge: vi.fn(),
      scanChallenge: vi.fn(),
    },
  };
});

import { POST } from './+server';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { engine } from '$lib/server/engineClient';
import { listPatternCaptures } from '$lib/server/terminalPersistence';

const capture = {
  id: 'pcap-1',
  symbol: 'BTCUSDT',
  timeframe: '4h',
  contextKind: 'symbol',
  triggerOrigin: 'manual',
  reason: 'ACCUMULATION',
  note: 'OI held while price based',
  snapshot: {
    viewport: {
      timeFrom: 1713312000,
      timeTo: 1713326400,
      tf: '4h',
      barCount: 2,
      klines: [
        { time: 1713312000, open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 },
        { time: 1713326400, open: 1.5, high: 2.2, low: 1.2, close: 2, volume: 12 },
      ],
      indicators: {},
    },
  },
  decision: {},
  sourceFreshness: { source: 'terminal_save_setup' },
  createdAt: '2026-04-17T00:00:00.000Z',
  updatedAt: '2026-04-17T00:00:00.000Z',
};

describe('/api/terminal/pattern-captures/[id]/project', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getAuthUserFromCookies as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'user-1' });
    (listPatternCaptures as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([capture]);
    (engine.createChallenge as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ slug: 'btc-accumulation' });
    (engine.scanChallenge as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      matches: [
        { symbol: 'ETHUSDT', timestamp: '2026-04-17T00:00:00.000Z', similarity: 0.91, p_win: 0.62, price: 3200 },
      ],
    });
  });

  it('projects a reviewed capture into an engine challenge and scan', async () => {
    const req = new Request('http://localhost/api/terminal/pattern-captures/pcap-1/project', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ scan: true, limit: 1 }),
    });

    const res = await POST({ cookies: {}, params: { id: 'pcap-1' }, request: req } as any);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(engine.createChallenge).toHaveBeenCalledWith(
      [{ symbol: 'BTCUSDT', timestamp: '2024-04-17T04:00:00.000Z', label: 'ACCUMULATION · OI held while price based' }],
      'user-1',
    );
    expect(engine.scanChallenge).toHaveBeenCalledWith('btc-accumulation');
    expect(body.challengeSlug).toBe('btc-accumulation');
    expect(body.matches).toHaveLength(1);
    expect(body.matches[0].pWin).toBe(0.62);
  });

  it('rejects captures without viewport evidence', async () => {
    (listPatternCaptures as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([{ ...capture, snapshot: {} }]);
    const req = new Request('http://localhost/api/terminal/pattern-captures/pcap-1/project', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    const res = await POST({ cookies: {}, params: { id: 'pcap-1' }, request: req } as any);

    expect(res.status).toBe(400);
    expect(engine.createChallenge).not.toHaveBeenCalled();
  });
});
