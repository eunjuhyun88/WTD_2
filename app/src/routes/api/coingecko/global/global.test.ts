import { beforeEach, describe, expect, it, vi } from 'vitest';

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
	totalMarketCapUsd: 2_500_000_000_000,
	marketCapChange24hPct: 1.5,
	btcMarketCapUsd: null,
	ethMarketCapUsd: null,
	btcDominance: 60.2,
	ethDominance: null,
	dominanceChange24h: null,
	stablecoinMcapUsd: 205_000_000_000,
	stablecoinMcapChange24hPct: null,
	stablecoinMcapChange7dPct: null,
	sourceSpreadPct: null,
	confidence: 0.55,
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
		totalMarketCapUsd: 2_300_000_000_000,
		btcDominance: 57.9,
		confidence: 0.81,
	},
};

describe('/api/coingecko/global', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('prefers engine market-cap facts when total market cap and BTC dominance are present', async () => {
		vi.mocked(loadPreferredMarketCapOverview).mockResolvedValue(ENGINE_SELECTION as any);

		const res = await GET({ fetch: globalThis.fetch } as any);

		expect(res.status).toBe(200);
		expect(vi.mocked(loadPreferredMarketCapOverview)).toHaveBeenCalledWith(globalThis.fetch, 'global');
		expect(res.headers.get('x-wtd-upstream')).toBe('facts/market-cap');
		expect(res.headers.get('x-wtd-state')).toBe('adapter');
		const body = await res.json();
		expect(body.totalMarketCap).toBe(2_500_000_000_000);
		expect(body.btcDominance).toBe(60.2);
	});

	it('falls back to the legacy marketCapPlane when engine facts are incomplete', async () => {
		vi.mocked(loadPreferredMarketCapOverview).mockResolvedValue(FALLBACK_SELECTION as any);

		const res = await GET({ fetch: globalThis.fetch } as any);

		expect(res.status).toBe(200);
		expect(vi.mocked(loadPreferredMarketCapOverview)).toHaveBeenCalledWith(globalThis.fetch, 'global');
		expect(res.headers.get('x-wtd-upstream')).toBe('legacy-marketCapPlane');
		expect(res.headers.get('x-wtd-state')).toBe('fallback');
		const body = await res.json();
		expect(body.totalMarketCap).toBe(2_300_000_000_000);
		expect(body.btcDominance).toBe(57.9);
	});
});
