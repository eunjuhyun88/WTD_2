import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/enginePlanes/facts', () => ({
	fetchFactMarketCapProxy: vi.fn(),
}));

vi.mock('$lib/server/marketCapPlane', () => ({
	adaptEngineMarketCapSnapshot: vi.fn(),
	fetchMarketCapOverview: vi.fn(),
}));

import { fetchFactMarketCapProxy } from '$lib/server/enginePlanes/facts';
import {
	adaptEngineMarketCapSnapshot,
	fetchMarketCapOverview,
} from '$lib/server/marketCapPlane';
import { loadPreferredMarketCapOverview } from './marketCapOverviewBridge';

const ENGINE_OVERVIEW = {
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
};

const GLOBAL_ENGINE_OVERVIEW = {
	...ENGINE_OVERVIEW,
	totalMarketCapUsd: 2_500_000_000_000,
};

const FALLBACK_OVERVIEW = {
	...GLOBAL_ENGINE_OVERVIEW,
	btcDominance: 58.1,
	confidence: 0.82,
};

describe('loadPreferredMarketCapOverview', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('uses engine facts for macro readiness when any macro signal is present', async () => {
		vi.mocked(fetchFactMarketCapProxy).mockResolvedValue({ ok: true } as any);
		vi.mocked(adaptEngineMarketCapSnapshot).mockReturnValue(ENGINE_OVERVIEW as any);

		const result = await loadPreferredMarketCapOverview(globalThis.fetch, 'macro');

		expect(fetchMarketCapOverview).not.toHaveBeenCalled();
		expect(result.upstream).toBe('facts/market-cap');
		expect(result.state).toBe('adapter');
		expect(result.overview?.btcDominance).toBe(61.4);
	});

	it('falls back for global readiness when total market cap is missing', async () => {
		vi.mocked(fetchFactMarketCapProxy).mockResolvedValue({ ok: true } as any);
		vi.mocked(adaptEngineMarketCapSnapshot).mockReturnValue(ENGINE_OVERVIEW as any);
		vi.mocked(fetchMarketCapOverview).mockResolvedValue(FALLBACK_OVERVIEW as any);

		const result = await loadPreferredMarketCapOverview(globalThis.fetch, 'global');

		expect(fetchMarketCapOverview).toHaveBeenCalledTimes(1);
		expect(result.upstream).toBe('legacy-marketCapPlane');
		expect(result.state).toBe('fallback');
		expect(result.overview?.btcDominance).toBe(58.1);
	});

	it('uses engine facts for global readiness when total market cap and BTC dominance are present', async () => {
		vi.mocked(fetchFactMarketCapProxy).mockResolvedValue({ ok: true } as any);
		vi.mocked(adaptEngineMarketCapSnapshot).mockReturnValue(GLOBAL_ENGINE_OVERVIEW as any);

		const result = await loadPreferredMarketCapOverview(globalThis.fetch, 'global');

		expect(fetchMarketCapOverview).not.toHaveBeenCalled();
		expect(result.upstream).toBe('facts/market-cap');
		expect(result.state).toBe('adapter');
		expect(result.overview?.totalMarketCapUsd).toBe(2_500_000_000_000);
	});
});
