import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/marketFeedService', () => ({
	fetchDerivatives: vi.fn(),
	normalizePair: vi.fn((value: string | null) => value ?? 'BTC/USDT'),
	normalizeTimeframe: vi.fn((value: string | null) => value ?? '4h'),
	pairToSlug: vi.fn((value: string) => value.replace('/', '-')),
}));

vi.mock('$lib/server/enginePlanes/facts', () => ({
	fetchFactPerpContextProxy: vi.fn(),
}));

import { fetchDerivatives } from '$lib/server/marketFeedService';
import { fetchFactPerpContextProxy } from '$lib/server/enginePlanes/facts';
import { GET } from './+server';

describe('/api/market/derivatives/[pair]', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('prefers engine perp context while preserving the response shape', async () => {
		vi.mocked(fetchFactPerpContextProxy).mockResolvedValue({
			ok: true,
			generated_at: '2026-04-23T00:00:00Z',
			metrics: {
				funding_rate: -0.0012,
				long_short_ratio: 0.91,
			},
		});

		const req = new Request('http://localhost/api/market/derivatives/BTC%2FUSDT?timeframe=4h');
		const res = await GET({
			fetch: globalThis.fetch,
			params: { pair: 'BTC%2FUSDT' },
			url: new URL(req.url),
		} as any);

		expect(res.status).toBe(200);
		expect(res.headers.get('x-wtd-plane')).toBe('fact');
		expect(res.headers.get('x-wtd-upstream')).toBe('facts/perp-context');
		expect(res.headers.get('x-wtd-state')).toBe('adapter');
		expect(vi.mocked(fetchDerivatives)).not.toHaveBeenCalled();

		const body = await res.json();
		expect(body.ok).toBe(true);
		expect(body.data.pair).toBe('BTC/USDT');
		expect(body.data.timeframe).toBe('4h');
		expect(body.data.funding).toBe(-0.0012);
		expect(body.data.lsRatio).toBe(0.91);
		expect(body.data.oi).toBeNull();
		expect(body.data.liqLong24h).toBeNull();
		expect(body.data.liqShort24h).toBeNull();
		expect(body.data.pairSlug).toBe('BTC-USDT');
	});

	it('falls back to legacy derivatives when engine perp context is unavailable', async () => {
		vi.mocked(fetchFactPerpContextProxy).mockResolvedValue(null);
		vi.mocked(fetchDerivatives).mockResolvedValue({
			pair: 'ETH/USDT',
			timeframe: '4h',
			oi: 3100000000,
			funding: 0.0008,
			predFunding: 0.0007,
			lsRatio: 1.15,
			liqLong24h: 21000000,
			liqShort24h: 9000000,
			updatedAt: 1713830400000,
		});

		const req = new Request('http://localhost/api/market/derivatives/ETH%2FUSDT?timeframe=4h');
		const res = await GET({
			fetch: globalThis.fetch,
			params: { pair: 'ETH%2FUSDT' },
			url: new URL(req.url),
		} as any);

		expect(res.status).toBe(200);
		expect(res.headers.get('x-wtd-upstream')).toBe('legacy-compute');
		expect(res.headers.get('x-wtd-state')).toBe('fallback');
		expect(vi.mocked(fetchDerivatives)).toHaveBeenCalledTimes(1);

		const body = await res.json();
		expect(body.data.oi).toBe(3100000000);
		expect(body.data.funding).toBe(0.0008);
		expect(body.data.liqLong24h).toBe(21000000);
		expect(body.data.liqShort24h).toBe(9000000);
		expect(body.data.pairSlug).toBe('ETH-USDT');
	});
});
