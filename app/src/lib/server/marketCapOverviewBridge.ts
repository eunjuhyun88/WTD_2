import type { MarketCapOverview } from '$lib/contracts/marketCapPlane';
import { fetchFactMarketCapProxy } from '$lib/server/enginePlanes/facts';
import { adaptEngineMarketCapSnapshot, fetchMarketCapOverview } from '$lib/server/marketCapPlane';

export type MarketCapOverviewReadiness = 'macro' | 'global';

export interface PreferredMarketCapOverview {
	overview: MarketCapOverview | null;
	upstream: 'facts/market-cap' | 'legacy-marketCapPlane';
	state: 'adapter' | 'fallback';
}

function isMacroReady(overview: MarketCapOverview | null): overview is MarketCapOverview {
	return (
		overview !== null &&
		(overview.btcDominance !== null ||
			overview.totalMarketCapUsd !== null ||
			overview.stablecoinMcapUsd !== null)
	);
}

function isGlobalReady(overview: MarketCapOverview | null): overview is MarketCapOverview {
	return overview !== null && overview.totalMarketCapUsd !== null && overview.btcDominance !== null;
}

export async function loadPreferredMarketCapOverview(
	fetchFn: typeof fetch,
	readiness: MarketCapOverviewReadiness,
): Promise<PreferredMarketCapOverview> {
	const engineSnapshot = await fetchFactMarketCapProxy(fetchFn, { offline: true });
	const engineOverview = adaptEngineMarketCapSnapshot(engineSnapshot);
	const isReady = readiness === 'global' ? isGlobalReady(engineOverview) : isMacroReady(engineOverview);

	if (isReady) {
		return {
			overview: engineOverview,
			upstream: 'facts/market-cap',
			state: 'adapter',
		};
	}

	return {
		overview: await fetchMarketCapOverview(),
		upstream: 'legacy-marketCapPlane',
		state: 'fallback',
	};
}
