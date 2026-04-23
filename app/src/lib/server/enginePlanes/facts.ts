import type { FactSnapshot } from '$lib/contracts/facts/factSnapshot';
import type {
	IndicatorCatalogFilters as IndicatorCatalogFilterInput,
	IndicatorCatalogResponse as IndicatorCatalogPayload
} from '$lib/contracts/facts/indicatorCatalog';
import type { EngineFactConfluencePayload } from '$lib/server/confluence/engineFactAdapter';
import { fetchEnginePlaneJson } from './shared';

type ServerFetch = typeof fetch;
export type { EngineFactConfluencePayload };

export async function fetchFactContextProxy(
	fetchFn: ServerFetch,
	args: { symbol: string; timeframe: string; offline?: boolean },
): Promise<FactSnapshot | null> {
	return fetchEnginePlaneJson<FactSnapshot>(fetchFn, 'facts', {
		path: 'ctx/fact',
		query: {
			symbol: args.symbol,
			timeframe: args.timeframe,
			offline: args.offline ?? true,
		},
		timeoutMs: 8_000,
	});
}

export async function fetchFactConfluenceProxy(
	fetchFn: ServerFetch,
	args: { symbol: string; timeframe: string; offline?: boolean },
): Promise<EngineFactConfluencePayload | null> {
	return fetchEnginePlaneJson<EngineFactConfluencePayload>(fetchFn, 'facts', {
		path: 'confluence',
		query: {
			symbol: args.symbol,
			timeframe: args.timeframe,
			offline: args.offline ?? true,
		},
		timeoutMs: 8_000,
	});
}

export async function fetchIndicatorCatalogProxy(
	fetchFn: ServerFetch,
	filters: IndicatorCatalogFilterInput = {},
): Promise<IndicatorCatalogPayload | null> {
	const query: Record<string, string | null | undefined> = {
		status: filters.status,
		family: filters.family,
		stage: filters.stage,
		query: filters.query
	};
	return fetchEnginePlaneJson<IndicatorCatalogPayload>(fetchFn, 'facts', {
		path: 'indicator-catalog',
		query,
		timeoutMs: 8_000,
	});
}
