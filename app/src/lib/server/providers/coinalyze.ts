// ═══════════════════════════════════════════════════════════════
// Stockclaw — Coinalyze Raw Loader (providers/ home, P1.A0 slice 3)
// ═══════════════════════════════════════════════════════════════
//
// Canonical location for Coinalyze REST fetchers. This file is the
// single definition of the coinalyze raw loaders;
// `src/lib/server/coinalyze.ts` is now a thin re-export shim that
// forwards all symbols here so that the two existing callers
// (scanEngine.ts, alertRules.ts) continue to work without code changes.
//
// Follows the shim-then-migrate pattern established by
// providers/binance.ts and providers/coingecko.ts. Body is
// byte-identical to the previous coinalyze.ts except for the cache
// import becoming `./cache` (same directory).

import { env as privateEnv } from '$env/dynamic/private';
import { getCached, setCache } from './cache';
import { toCoinalyzeInterval } from '$lib/utils/timeframe';

const BASE = 'https://api.coinalyze.net/v1';
const FETCH_TIMEOUT = 10_000;
const DERIV_CACHE_TTL = 60_000; // 1min

// ─── Types ───────────────────────────────────────────────────

export interface OIDataPoint {
	time: number;
	value: number;
}
export interface FundingDataPoint {
	time: number;
	value: number;
}
export interface LiquidationDataPoint {
	time: number;
	long: number;
	short: number;
}
export interface LSRatioDataPoint {
	time: number;
	value: number;
}

// ─── Helpers ─────────────────────────────────────────────────

function pairToCoinalyze(pair: string): string {
	return pair.replace('/', '') + '_PERP.A';
}

async function coinalyzeFetchDirect(
	endpoint: string,
	params: Record<string, string>
): Promise<any> {
	const apiKey = privateEnv.COINALYZE_API_KEY?.trim() ?? '';
	if (!apiKey) throw new Error('COINALYZE_API_KEY not set');

	const qs = new URLSearchParams({ ...params, api_key: apiKey });
	const url = `${BASE}/${endpoint}?${qs.toString()}`;
	const res = await fetch(url, {
		headers: { Accept: 'application/json' },
		signal: AbortSignal.timeout(FETCH_TIMEOUT)
	});
	if (!res.ok) {
		const detail = await res.text().catch(() => '');
		throw new Error(`Coinalyze ${endpoint} ${res.status}: ${detail}`);
	}
	return res.json();
}

// ─── Current OI ──────────────────────────────────────────────

export async function fetchCurrentOIServer(
	pair: string
): Promise<{ value: number; update: number } | null> {
	const symbol = pairToCoinalyze(pair);
	const cacheKey = `coinalyze:oi:${symbol}`;
	const cached = getCached<{ value: number; update: number }>(cacheKey);
	if (cached) return cached;

	try {
		const data = await coinalyzeFetchDirect('open-interest', {
			symbols: symbol,
			convert_to_usd: 'true'
		});
		if (Array.isArray(data) && data.length > 0) {
			const result = { value: data[0].value, update: data[0].update };
			setCache(cacheKey, result, DERIV_CACHE_TTL);
			return result;
		}
		return null;
	} catch {
		return null;
	}
}

// ─── Current Funding Rate ────────────────────────────────────

export async function fetchCurrentFundingServer(
	pair: string
): Promise<{ value: number; update: number } | null> {
	const symbol = pairToCoinalyze(pair);
	const cacheKey = `coinalyze:funding:${symbol}`;
	const cached = getCached<{ value: number; update: number }>(cacheKey);
	if (cached) return cached;

	try {
		const data = await coinalyzeFetchDirect('funding-rate', {
			symbols: symbol
		});
		if (Array.isArray(data) && data.length > 0) {
			const result = { value: data[0].value, update: data[0].update };
			setCache(cacheKey, result, DERIV_CACHE_TTL);
			return result;
		}
		return null;
	} catch {
		return null;
	}
}

// ─── Predicted Funding Rate ──────────────────────────────────

export async function fetchPredictedFundingServer(
	pair: string
): Promise<{ value: number } | null> {
	const symbol = pairToCoinalyze(pair);
	const cacheKey = `coinalyze:predFunding:${symbol}`;
	const cached = getCached<{ value: number }>(cacheKey);
	if (cached) return cached;

	try {
		const data = await coinalyzeFetchDirect('predicted-funding-rate', {
			symbols: symbol
		});
		if (Array.isArray(data) && data.length > 0) {
			const result = { value: data[0].value };
			setCache(cacheKey, result, DERIV_CACHE_TTL);
			return result;
		}
		return null;
	} catch {
		return null;
	}
}

// ─── OI History ──────────────────────────────────────────────

export async function fetchOIHistoryServer(
	pair: string,
	tf: string,
	limit: number = 100
): Promise<OIDataPoint[]> {
	const symbol = pairToCoinalyze(pair);
	const interval = toCoinalyzeInterval(tf);
	const cacheKey = `coinalyze:oiHist:${symbol}:${interval}:${limit}`;
	const cached = getCached<OIDataPoint[]>(cacheKey);
	if (cached) return cached;

	try {
		const now = Math.floor(Date.now() / 1000);
		const intervalSecs: Record<string, number> = {
			'1min': 60,
			'5min': 300,
			'15min': 900,
			'30min': 1800,
			'1hour': 3600,
			'4hour': 14400,
			daily: 86400
		};
		const from = now - (intervalSecs[interval] ?? 14400) * limit;

		const data = await coinalyzeFetchDirect('open-interest-history', {
			symbols: symbol,
			interval,
			from: String(from),
			to: String(now),
			convert_to_usd: 'true'
		});

		const result: OIDataPoint[] = [];
		if (Array.isArray(data) && data.length > 0 && Array.isArray(data[0]?.history)) {
			for (const pt of data[0].history) {
				result.push({ time: pt.t, value: pt.c ?? pt.o ?? 0 });
			}
		}
		setCache(cacheKey, result, DERIV_CACHE_TTL);
		return result;
	} catch {
		return [];
	}
}

// ─── Funding History ─────────────────────────────────────────

export async function fetchFundingHistoryServer(
	pair: string,
	tf: string,
	limit: number = 100
): Promise<FundingDataPoint[]> {
	const symbol = pairToCoinalyze(pair);
	const interval = toCoinalyzeInterval(tf);
	const cacheKey = `coinalyze:fundingHist:${symbol}:${interval}:${limit}`;
	const cached = getCached<FundingDataPoint[]>(cacheKey);
	if (cached) return cached;

	try {
		const now = Math.floor(Date.now() / 1000);
		const intervalSecs: Record<string, number> = {
			'1min': 60,
			'5min': 300,
			'15min': 900,
			'30min': 1800,
			'1hour': 3600,
			'4hour': 14400,
			daily: 86400
		};
		const from = now - (intervalSecs[interval] ?? 14400) * limit;

		const data = await coinalyzeFetchDirect('funding-rate-history', {
			symbols: symbol,
			interval,
			from: String(from),
			to: String(now)
		});

		const result: FundingDataPoint[] = [];
		if (Array.isArray(data) && data.length > 0 && Array.isArray(data[0]?.history)) {
			for (const pt of data[0].history) {
				result.push({ time: pt.t, value: pt.c ?? pt.o ?? 0 });
			}
		}
		setCache(cacheKey, result, DERIV_CACHE_TTL);
		return result;
	} catch {
		return [];
	}
}

// ─── Liquidation History ─────────────────────────────────────

export async function fetchLiquidationHistoryServer(
	pair: string,
	tf: string,
	limit: number = 100
): Promise<LiquidationDataPoint[]> {
	const symbol = pairToCoinalyze(pair);
	const interval = toCoinalyzeInterval(tf);
	const cacheKey = `coinalyze:liq:${symbol}:${interval}:${limit}`;
	const cached = getCached<LiquidationDataPoint[]>(cacheKey);
	if (cached) return cached;

	try {
		const now = Math.floor(Date.now() / 1000);
		const intervalSecs: Record<string, number> = {
			'1min': 60,
			'5min': 300,
			'15min': 900,
			'30min': 1800,
			'1hour': 3600,
			'4hour': 14400,
			daily: 86400
		};
		const from = now - (intervalSecs[interval] ?? 14400) * limit;

		const data = await coinalyzeFetchDirect('liquidation-history', {
			symbols: symbol,
			interval,
			from: String(from),
			to: String(now)
		});

		const result: LiquidationDataPoint[] = [];
		if (Array.isArray(data) && data.length > 0 && Array.isArray(data[0]?.history)) {
			for (const pt of data[0].history) {
				result.push({ time: pt.t, long: pt.l ?? 0, short: pt.s ?? 0 });
			}
		}
		setCache(cacheKey, result, DERIV_CACHE_TTL);
		return result;
	} catch {
		return [];
	}
}

// ─── L/S Ratio History ───────────────────────────────────────

export async function fetchLSRatioHistoryServer(
	pair: string,
	tf: string,
	limit: number = 100
): Promise<LSRatioDataPoint[]> {
	const symbol = pairToCoinalyze(pair);
	const interval = toCoinalyzeInterval(tf);
	const cacheKey = `coinalyze:lsr:${symbol}:${interval}:${limit}`;
	const cached = getCached<LSRatioDataPoint[]>(cacheKey);
	if (cached) return cached;

	try {
		const now = Math.floor(Date.now() / 1000);
		const intervalSecs: Record<string, number> = {
			'1min': 60,
			'5min': 300,
			'15min': 900,
			'30min': 1800,
			'1hour': 3600,
			'4hour': 14400,
			daily: 86400
		};
		const from = now - (intervalSecs[interval] ?? 14400) * limit;

		const data = await coinalyzeFetchDirect('long-short-ratio-history', {
			symbols: symbol,
			interval,
			from: String(from),
			to: String(now)
		});

		const result: LSRatioDataPoint[] = [];
		if (Array.isArray(data) && data.length > 0 && Array.isArray(data[0]?.history)) {
			for (const pt of data[0].history) {
				result.push({ time: pt.t, value: pt.c ?? 1 });
			}
		}
		setCache(cacheKey, result, DERIV_CACHE_TTL);
		return result;
	} catch {
		return [];
	}
}
