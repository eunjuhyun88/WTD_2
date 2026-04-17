/**
 * Short-TTL shared cache in front of `readRaw()` fetchers.
 *
 * Why:
 *  - `/api/cogochi/analyze` + `/api/chart/klines` + other routes often request
 *    the same Binance-backed atoms concurrently for the same symbol.
 *  - `analyze` already wraps `collectAnalyzeInputs` in a 5s cache; this layer
 *    dedupes *across* features and coalesces in-flight work with the same
 *    granularity as a single raw read (id + input).
 *
 * Redis (SHARED_CACHE_* / UPSTASH_*) is optional — when unset, local +
 * in-flight coalescing still help a single instance.
 *
 * Env:
 *  - RAW_READ_CACHE_TTL_MS — default 2500; set 0 / off / false to disable.
 */
import { KnownRawId } from '$lib/contracts/ids';
import { createSharedPublicRouteCache } from '$lib/server/publicRouteCache';

/** Atoms that already memoize internally or have their own provider cache. */
const SKIP_MICRO_CACHE_IDS = new Set<string>([
	KnownRawId.TICKER_SYMBOL,
	KnownRawId.TICKER_QUOTE_VOLUME,
	KnownRawId.TICKER_PRICE_CHANGE_PCT,
	KnownRawId.TICKER_HIGH_PRICE,
	KnownRawId.TICKER_LOW_PRICE,
	KnownRawId.TICKER_LAST_PRICE,
	KnownRawId.UNIVERSE_IS_USDT,
	KnownRawId.COINALYZE_OI_HIST_TF,
	KnownRawId.COINALYZE_FUNDING_HIST_TF,
	KnownRawId.COINALYZE_LSRATIO_HIST_TF,
	KnownRawId.COINALYZE_LIQ_HIST_TF,
	KnownRawId.SECTOR_MAP,
	KnownRawId.SECTOR_OVERRIDE,
	KnownRawId.AGG_TRADES_LIVE,
	KnownRawId.BOOK_TICKER_LIVE,
	KnownRawId.DEPTH_LIVE,
]);

export function skipRawReadMicroCache(id: string): boolean {
	return SKIP_MICRO_CACHE_IDS.has(id);
}

export function buildRawReadMicroCacheKey(id: string, input: unknown): string {
	if (input == null) return id;
	if (typeof input === 'object' && input !== null && Object.keys(input as object).length === 0) {
		return id;
	}
	return `${id}:${JSON.stringify(input)}`;
}

export function parseRawReadMicroCacheTtlMs(): number | null {
	const raw = process.env.RAW_READ_CACHE_TTL_MS?.trim() ?? '';
	const v = raw.toLowerCase();
	if (v === '0' || v === 'off' || v === 'false' || v === 'no') return null;
	const n = raw === '' ? 2500 : Number.parseInt(raw, 10);
	if (!Number.isFinite(n)) return 2500;
	if (n <= 0) return null;
	return Math.min(3_600_000, Math.max(1_000, n));
}

let cache: ReturnType<typeof createSharedPublicRouteCache<unknown>> | null = null;
let boundTtl: number | null = null;

export function getRawReadMicroCache(): ReturnType<
	typeof createSharedPublicRouteCache<unknown>
> | null {
	const ttl = parseRawReadMicroCacheTtlMs();
	if (ttl === null) return null;
	if (!cache || boundTtl !== ttl) {
		cache = createSharedPublicRouteCache<unknown>({ scope: 'raw-read', ttlMs: ttl });
		boundTtl = ttl;
	}
	return cache;
}
