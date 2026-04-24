import { KnownRawId } from '$lib/contracts/ids';
import { fetchCoinMarketCapQuote, hasCoinMarketCapApiKey } from '$lib/server/coinmarketcap';
import { readRaw } from '$lib/server/providers/rawSources';
import {
	loadPerpContextBridge,
	summarizePerpContextBridge,
	type PerpContextBridgeHeaders,
	type PerpContextBridgeSnapshot,
} from '$lib/server/perpContextBridge';

type FlowDerivativesView = {
	funding: number | null;
	lsRatio: number | null;
	oi: number | null;
	liqLong24h: number;
	liqShort24h: number;
	updatedAt: number;
};

type FlowRecord = {
	id: string;
	pair: string;
	token: string;
	agentId: string;
	agent: string;
	vote: string;
	confidence: number;
	text: string;
	source: string;
	createdAt: number;
};

export interface MarketFlowPayload {
	pair: string;
	timeframe: string;
	token: string;
	bias: 'LONG' | 'SHORT' | 'NEUTRAL';
	snapshot: {
		source: {
			binance: boolean;
			coinalyze: boolean;
			coinmarketcap: boolean;
		};
		priceChangePct: number | null;
		quoteVolume24h: number | null;
		funding: number | null;
		lsRatio: number | null;
		liqLong24h: number | null;
		liqShort24h: number | null;
		cmcPrice: number | null;
		cmcMarketCap: number | null;
		cmcVolume24hUsd: number | null;
		cmcChange24hPct: number | null;
		cmcUpdatedAt: number | null;
		cmcKeyConfigured: boolean;
	};
	records: FlowRecord[];
}

export interface MarketFlowResult {
	data: MarketFlowPayload;
	headers: PerpContextBridgeHeaders;
}

function pickBias(
	funding: number | null,
	lsRatio: number | null,
	liqLong: number,
	liqShort: number,
): 'LONG' | 'SHORT' | 'NEUTRAL' {
	let score = 0;
	if (funding != null) score += funding > 0.0006 ? -1 : funding < -0.0006 ? 1 : 0;
	if (lsRatio != null) score += lsRatio > 1.1 ? -1 : lsRatio < 0.9 ? 1 : 0;
	if (liqLong + liqShort > 0) score += liqShort > liqLong ? 1 : liqLong > liqShort ? -1 : 0;
	if (score > 0) return 'LONG';
	if (score < 0) return 'SHORT';
	return 'NEUTRAL';
}

function buildDerivativesView(
	perpBridge: PerpContextBridgeSnapshot,
): FlowDerivativesView | null {
	const { enginePerp, legacyDeriv } = perpBridge;
	if (!enginePerp && !legacyDeriv) return null;

	return {
		funding: enginePerp?.metrics.funding_rate ?? legacyDeriv?.funding ?? null,
		lsRatio: enginePerp?.metrics.long_short_ratio ?? legacyDeriv?.lsRatio ?? null,
		oi: legacyDeriv?.oi ?? null,
		liqLong24h: legacyDeriv?.liqLong24h ?? 0,
		liqShort24h: legacyDeriv?.liqShort24h ?? 0,
		updatedAt: legacyDeriv?.updatedAt ?? Date.now(),
	};
}

export async function loadMarketFlow(
	fetchFn: typeof fetch,
	args: {
		pair: string;
		timeframe: string;
		perpBridge?: PerpContextBridgeSnapshot;
	},
): Promise<MarketFlowResult> {
	const token = args.pair.split('/')[0] ?? 'BTC';
	const perpBridge =
		args.perpBridge ?? (await loadPerpContextBridge(fetchFn, { pair: args.pair, timeframe: args.timeframe }));

	const [tickerRes, cmcRes] = await Promise.allSettled([
		readRaw(KnownRawId.TICKER_24HR, { symbol: perpBridge.symbol }),
		fetchCoinMarketCapQuote(token),
	]);

	const ticker = tickerRes.status === 'fulfilled' ? tickerRes.value : null;
	const cmc = cmcRes.status === 'fulfilled' ? cmcRes.value : null;
	const deriv = buildDerivativesView(perpBridge);
	const bias = pickBias(
		deriv?.funding ?? null,
		deriv?.lsRatio ?? null,
		deriv?.liqLong24h ?? 0,
		deriv?.liqShort24h ?? 0,
	);

	const records: FlowRecord[] = [];
	const now = Date.now();
	if (deriv) {
		records.push({
			id: `deriv-flow-${args.pair}-${now}`,
			pair: args.pair,
			token,
			agentId: 'deriv',
			agent: 'DERIV',
			vote: bias,
			confidence: 70,
			text:
				`Funding ${deriv.funding != null ? (deriv.funding * 100).toFixed(4) + '%' : 'n/a'} · ` +
				`OI ${deriv.oi != null ? '$' + (deriv.oi / 1e9).toFixed(2) + 'B' : 'n/a'} · ` +
				`L/S ${deriv.lsRatio?.toFixed(2) ?? 'n/a'} · ` +
				`Liq L $${Math.round(deriv.liqLong24h).toLocaleString()} / S $${Math.round(deriv.liqShort24h).toLocaleString()}`,
			source: 'COINALYZE',
			createdAt: now,
		});
	}
	if (ticker) {
		const pctChg = Number(ticker.priceChangePercent || 0);
		const vol = Number(ticker.quoteVolume || 0);
		records.push({
			id: `flow-ticker-${args.pair}-${now}`,
			pair: args.pair,
			token,
			agentId: 'flow',
			agent: 'FLOW',
			vote: pctChg >= 0 ? 'LONG' : 'SHORT',
			confidence: 60,
			text: `24h ${pctChg >= 0 ? '+' : ''}${pctChg.toFixed(2)}% · Vol $${(vol / 1e9).toFixed(2)}B`,
			source: 'BINANCE',
			createdAt: now,
		});
	}

	return {
		data: {
			pair: args.pair,
			timeframe: args.timeframe,
			token,
			bias,
			snapshot: {
				source: {
					binance: Boolean(ticker),
					coinalyze: Boolean(perpBridge.enginePerp ?? perpBridge.legacyDeriv),
					coinmarketcap: Boolean(cmc),
				},
				priceChangePct: ticker ? Number(ticker.priceChangePercent) : null,
				quoteVolume24h: ticker ? Number(ticker.quoteVolume) : null,
				funding: deriv?.funding ?? null,
				lsRatio: deriv?.lsRatio ?? null,
				liqLong24h: deriv?.liqLong24h ?? null,
				liqShort24h: deriv?.liqShort24h ?? null,
				cmcPrice: cmc?.price ?? null,
				cmcMarketCap: cmc?.marketCap ?? null,
				cmcVolume24hUsd: cmc?.volume24h ?? null,
				cmcChange24hPct: cmc?.change24hPct ?? null,
				cmcUpdatedAt: cmc?.updatedAt ?? null,
				cmcKeyConfigured: hasCoinMarketCapApiKey(),
			},
			records,
		},
		headers: summarizePerpContextBridge(perpBridge),
	};
}
