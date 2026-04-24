import { fetchPerpContextProxy, type PerpContextPayload } from '$lib/server/enginePlanes/facts';
import { fetchDerivatives } from '$lib/server/marketFeedService';
import { pairToSymbol } from '$lib/server/providers/binance';

type LegacyDerivativesPayload = Awaited<ReturnType<typeof fetchDerivatives>>;

export interface PerpContextBridgeSnapshot {
	pair: string;
	timeframe: string;
	symbol: string;
	enginePerp: PerpContextPayload | null;
	legacyDeriv: LegacyDerivativesPayload | null;
}

export interface PerpContextBridgeHeaders {
	upstream: 'facts/perp-context' | 'facts/perp-context+legacy-enrichment' | 'legacy-compute';
	state: 'adapter' | 'fallback';
}

export async function loadPerpContextBridge(
	fetchFn: typeof fetch,
	args: { pair: string; timeframe: string },
): Promise<PerpContextBridgeSnapshot> {
	const symbol = pairToSymbol(args.pair);
	const [enginePerp, legacyDeriv] = await Promise.all([
		fetchPerpContextProxy(fetchFn, { symbol, timeframe: args.timeframe, offline: true }).catch(() => null),
		fetchDerivatives(fetchFn, args.pair, args.timeframe).catch(() => null),
	]);

	return {
		pair: args.pair,
		timeframe: args.timeframe,
		symbol,
		enginePerp,
		legacyDeriv,
	};
}

export function summarizePerpContextBridge(
	snapshot: PerpContextBridgeSnapshot,
): PerpContextBridgeHeaders {
	if (snapshot.enginePerp) {
		return {
			upstream: snapshot.legacyDeriv ? 'facts/perp-context+legacy-enrichment' : 'facts/perp-context',
			state: 'adapter',
		};
	}

	return {
		upstream: 'legacy-compute',
		state: 'fallback',
	};
}
