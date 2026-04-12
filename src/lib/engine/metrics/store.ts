// ═══════════════════════════════════════════════════════════════
// Metric Engine — MetricStore (in-memory TTL cache)
// ═══════════════════════════════════════════════════════════════

import type { MetricResult } from './types';

interface CacheEntry {
	result: MetricResult;
	expiresAt: number;
}

/**
 * Per-request or per-symbol in-memory cache for MetricResult values.
 *
 * Key format: `<metricId>:<symbol>` — intentionally kept opaque; use the
 * provided get/set/invalidate methods rather than accessing the map directly.
 *
 * TTL is sourced from MetricResult.ttlMs at write time. Expired entries are
 * evicted lazily on the next read for the same key (no background sweep).
 */
export class MetricStore {
	private cache = new Map<string, CacheEntry>();

	private key(id: string, symbol: string): string {
		return `${id}:${symbol}`;
	}

	/**
	 * Retrieve a cached MetricResult.
	 * Returns null if the entry is absent or has expired (and evicts it).
	 * The returned result has `source` overridden to `'cached'`.
	 */
	get(id: string, symbol: string): MetricResult | null {
		const k = this.key(id, symbol);
		const entry = this.cache.get(k);
		if (!entry) return null;
		if (Date.now() > entry.expiresAt) {
			this.cache.delete(k);
			return null;
		}
		return { ...entry.result, source: 'cached' };
	}

	/**
	 * Store a MetricResult.
	 * Expiry is computed as `Date.now() + result.ttlMs`.
	 */
	set(result: MetricResult, symbol: string): void {
		this.cache.set(this.key(result.id, symbol), {
			result,
			expiresAt: Date.now() + result.ttlMs
		});
	}

	/**
	 * Remove all cached entries for a given symbol.
	 * Useful when fresh market data arrives and all metrics must be recomputed.
	 */
	invalidate(symbol: string): void {
		for (const key of this.cache.keys()) {
			if (key.endsWith(`:${symbol}`)) this.cache.delete(key);
		}
	}

	/** Clear all cached entries regardless of symbol or TTL. */
	invalidateAll(): void {
		this.cache.clear();
	}

	/** Number of entries currently in the cache (including not-yet-expired). */
	get size(): number {
		return this.cache.size;
	}
}
