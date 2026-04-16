import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './+server';

vi.mock('$lib/engine/opportunityScanner', () => ({
  runOpportunityScan: vi.fn(),
}));

import { runOpportunityScan } from '$lib/engine/opportunityScanner';

describe('/api/terminal/pattern-seed/match', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (runOpportunityScan as any).mockResolvedValue({
      coins: [
        {
          symbol: 'TRADOOR',
          name: 'Tradoor',
          slug: 'tradoor',
          price: 1.5,
          change1h: 7.1,
          change24h: -6.2,
          change7d: -18.4,
          volume24h: 1000000,
          marketCap: 10000000,
          momentumScore: 18,
          volumeScore: 16,
          socialScore: 8,
          macroScore: 6,
          onchainScore: 10,
          totalScore: 58,
          direction: 'long',
          confidence: 76,
          reasons: ['거래량 폭발'],
          alerts: ['🔥 거래량 스파이크'],
        },
      ],
    });
  });

  it('returns ranked candidates from board and scan', async () => {
    const request = new Request('http://localhost/api/terminal/pattern-seed/match', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        thesis: 'OI 급등 후 급락-반등 + 저점 높이는 패턴',
        assets: [
          {
            symbol: 'PTBUSDT',
            changePct15m: 1.2,
            changePct1h: 3.4,
            changePct4h: -7.1,
            volumeRatio1h: 2.1,
            oiChangePct1h: 5.2,
            fundingRate: -0.004,
          },
        ],
        snapshotNames: ['ptb.png'],
      }),
    });

    const res = await POST({ request } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.seed.snapshotCount).toBe(1);
    expect(body.candidates.length).toBeGreaterThan(0);
    expect(body.candidates[0].symbol).toBe('PTBUSDT');
  });
});
