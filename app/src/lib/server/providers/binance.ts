// ═══════════════════════════════════════════════════════════════
// Binance Raw Loader (providers/ home, P1.A0 slice 1)
// ═══════════════════════════════════════════════════════════════
//
// Canonical location for Binance REST fetchers. This file is the
// single definition of the binance raw loaders; `src/lib/server/binance.ts`
// is now a thin re-export shim that forwards all symbols here so that
// the six existing callers continue to work without code changes.
//
// Why this move exists
// --------------------
// The three-pipeline trunk plan (`docs/exec-plans/active/three-pipeline-
// integration-design-2026-04-11.md` §Phase 1 A-P0) is decomposing the
// scan-path god file into per-provider raw loaders under
// `src/lib/server/providers/<source>.ts`. This slice (P1.A0-binance in
// `docs/exec-plans/active/trunk-plan.dag.json`) is the first such move.
//
// Zero behavior change by design — the body below is byte-identical to
// the previous `src/lib/server/binance.ts` except for:
//   1. The cache import is now a relative `./cache` (same directory).
//   2. Market data type imports now come from app contracts.
//
// Future P1 slices will move coingecko, coinalyze, dexscreener, and the
// other 17 providers here using the same shim-then-migrate pattern.

import { getCached, setCache } from './cache';
import { toBinanceInterval } from '$lib/utils/timeframe';
import type { BinanceKline, Binance24hr } from '$lib/contracts/marketContext';

// Re-export contract types for convenience — consumers can `import type
// { BinanceKline } from '$lib/server/providers/binance'` once they
// migrate off the legacy path.
export type { BinanceKline, Binance24hr } from '$lib/contracts/marketContext';

const BASE = 'https://api.binance.com';
const FETCH_TIMEOUT = 8_000;
const KLINE_CACHE_TTL = 60_000; // 1min — klines change fast
const TICKER_CACHE_TTL = 30_000; // 30s
const EXTENDED_INTERVALS = new Set(['1M']);

function normalizeServerInterval(interval: string): string {
	const trimmed = String(interval || '').trim();
	if (EXTENDED_INTERVALS.has(trimmed)) return trimmed;
	return toBinanceInterval(trimmed);
}

// ─── Klines ──────────────────────────────────────────────────

export async function fetchKlinesServer(
	symbol: string,
	interval: string = '4h',
	limit: number = 200
): Promise<BinanceKline[]> {
	const normalizedInterval = normalizeServerInterval(interval);
	const cacheKey = `binance:klines:${symbol}:${normalizedInterval}:${limit}`;
	const cached = getCached<BinanceKline[]>(cacheKey);
	if (cached) return cached;

	const url = `${BASE}/api/v3/klines?symbol=${symbol}&interval=${normalizedInterval}&limit=${limit}`;
	const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT) });
	if (!res.ok) throw new Error(`Binance klines ${res.status}`);

	const data: unknown[][] = await res.json();
	const klines: BinanceKline[] = data.map((k) => ({
		time: Math.floor(Number(k[0]) / 1000),
		open: parseFloat(String(k[1])),
		high: parseFloat(String(k[2])),
		low: parseFloat(String(k[3])),
		close: parseFloat(String(k[4])),
		volume: parseFloat(String(k[5]))
	}));

	setCache(cacheKey, klines, KLINE_CACHE_TTL);
	return klines;
}

// ─── 24hr Ticker ─────────────────────────────────────────────

export async function fetch24hrServer(symbol: string): Promise<Binance24hr> {
	const cacheKey = `binance:24hr:${symbol}`;
	const cached = getCached<Binance24hr>(cacheKey);
	if (cached) return cached;

	const url = `${BASE}/api/v3/ticker/24hr?symbol=${symbol}`;
	const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT) });
	if (!res.ok) throw new Error(`Binance 24hr ${res.status}`);

	const data: Binance24hr = await res.json();
	setCache(cacheKey, data, TICKER_CACHE_TTL);
	return data;
}

// ─── Symbol mapping ──────────────────────────────────────────

export function pairToSymbol(pair: string): string {
	return pair.replace('/', '');
}
