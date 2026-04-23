import type { FactSnapshot } from '$lib/contracts/facts/factSnapshot';
import type { ChainIntelSnapshot } from '$lib/contracts/facts/chainIntel';
import type {
	IndicatorCatalogFilters as IndicatorCatalogFilterInput,
	IndicatorCatalogResponse as IndicatorCatalogPayload
} from '$lib/contracts/facts/indicatorCatalog';
import type { MarketCapSnapshot } from '$lib/contracts/facts/marketCap';
import type { ReferenceStackSnapshot } from '$lib/contracts/facts/referenceStack';
import type { EngineFactConfluencePayload } from '$lib/server/confluence/engineFactAdapter';
import { fetchEnginePlaneJson } from './shared';

type ServerFetch = typeof fetch;
export type { EngineFactConfluencePayload };

export interface EngineFactPerpContextPayload {
	ok?: boolean;
	owner?: 'engine';
	plane?: 'fact';
	kind?: 'perp_context';
	status?: string;
	generated_at?: string;
	symbol?: string;
	timeframe?: string;
	source?: {
		id?: string;
		state?: string;
		rows?: number;
		summary?: string;
	};
	metrics?: {
		funding_rate?: number;
		oi_change_1h?: number;
		oi_change_24h?: number;
		long_short_ratio?: number;
		taker_buy_ratio_1h?: number;
	};
	regime?: {
		crowding?: string;
		cvd_state?: string;
	};
}

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

export async function fetchFactPerpContextProxy(
	fetchFn: ServerFetch,
	args: { symbol: string; timeframe: string; offline?: boolean },
): Promise<EngineFactPerpContextPayload | null> {
	return fetchEnginePlaneJson<EngineFactPerpContextPayload>(fetchFn, 'facts', {
		path: 'perp-context',
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
