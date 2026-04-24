import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/rateLimit', () => ({
	chartFeedLimiter: { check: vi.fn(() => true) },
}));

vi.mock('$lib/server/requestIp', () => ({
	getRequestIp: vi.fn(() => '127.0.0.1'),
}));

vi.mock('$lib/server/marketCapOverviewBridge', () => ({
	loadPreferredMarketCapOverview: vi.fn(),
}));

import { loadPreferredMarketCapOverview } from '$lib/server/marketCapOverviewBridge';
import { GET } from './+server';

const ENGINE_SELECTION = {
	upstream: 'facts/market-cap',
	state: 'adapter',
	overview: {
	at: Date.now(),
	totalMarketCapUsd: null,
	marketCapChange24hPct: null,
	btcMarketCapUsd: null,
	ethMarketCapUsd: null,
	btcDominance: 61.4,
	ethDominance: null,
	dominanceChange24h: null,
	stablecoinMcapUsd: 210_000_000_000,
	stablecoinMcapChange24hPct: null,
	stablecoinMcapChange7dPct: null,
	sourceSpreadPct: null,
	confidence: 0.4,
	providers: {
		global: { provider: 'engine_fact_market_cap', status: 'partial', updatedAt: Date.now() },
		assets: { provider: 'engine_fact_market_cap', status: 'blocked', updatedAt: Date.now() },
		stablecoins: { provider: 'engine_fact_market_cap', status: 'partial', updatedAt: Date.now() },
	},
	},
};

const FALLBACK_SELECTION = {
	upstream: 'legacy-marketCapPlane',
	state: 'fallback',
	overview: {
		...ENGINE_SELECTION.overview,
		btcDominance: 58.1,
		stablecoinMcapUsd: 205_000_000_000,
		confidence: 0.82,
	},
};

describe('/api/market/macro-overview', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('prefers engine market-cap facts when the adapter yields a macro overview', async () => {
		vi.mocked(loadPreferredMarketCapOverview).mockResolvedValue(ENGINE_SELECTION as any);

		const req = new Request('http://localhost/api/market/macro-overview');
		const res = await GET({
			request: req,
			fetch: globalThis.fetch,
			getClientAddress: () => '127.0.0.1',
		} as any);

		expect(res.status).toBe(200);
		expect(vi.mocked(loadPreferredMarketCapOverview)).toHaveBeenCalledWith(globalThis.fetch, 'macro');
		expect(res.headers.get('x-wtd-upstream')).toBe('facts/market-cap');
		expect(res.headers.get('x-wtd-state')).toBe('adapter');
		const body = await res.json();
		expect(body.ok).toBe(true);
		expect(body.btcDominance).toBe(61.4);
	});

	it('falls back to the legacy app marketCapPlane when engine facts are unavailable', async () => {
		vi.mocked(loadPreferredMarketCapOverview).mockResolvedValue(FALLBACK_SELECTION as any);

		const req = new Request('http://localhost/api/market/macro-overview');
		const res = await GET({
			request: req,
			fetch: globalThis.fetch,
			getClientAddress: () => '127.0.0.1',
		} as any);

		expect(res.status).toBe(200);
		expect(vi.mocked(loadPreferredMarketCapOverview)).toHaveBeenCalledWith(globalThis.fetch, 'macro');
		expect(res.headers.get('x-wtd-upstream')).toBe('legacy-marketCapPlane');
		expect(res.headers.get('x-wtd-state')).toBe('fallback');
		const body = await res.json();
		expect(body.btcDominance).toBe(58.1);
	});
});
