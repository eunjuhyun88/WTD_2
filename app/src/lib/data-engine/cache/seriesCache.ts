// ═══════════════════════════════════════════════════════════════
// Data Engine — Series Cache
// ═══════════════════════════════════════════════════════════════
//
// Time-series cache with append-only updates and TTL expiration.
//
// Unlike the point cache in providers/cache.ts, this stores entire
// NormalizedSeries objects and supports efficient incremental appends.
//
// Key convention: 'provider:metric:symbol:timeframe'
//   e.g., 'binance:klines:BTCUSDT:4h'

import type { NormalizedSeries, NormalizedPoint } from '../types';

interface CacheEntry {
	series: NormalizedSeries;
	expiresAt: number;
}

/**
 * Time-series cache with TTL, append, and LRU-style eviction.
 *
 * Designed for medium-lived series data (seconds to minutes TTL).
 * Thread-safety is not guaranteed; callers in a single-threaded JS
 * environment do not need to coordinate.
 */
export class SeriesCache {
	private readonly store = new Map<string, CacheEntry>();
	private readonly maxEntries: number;

	constructor(maxEntries = 200) {
		this.maxEntries = maxEntries;
	}

	// ─── Read ────────────────────────────────────────────────────

	/** Return the series for `key`, or null if absent / expired. */
	get(key: string): NormalizedSeries | null {
		const entry = this.store.get(key);
		if (!entry) return null;
		if (Date.now() > entry.expiresAt) {
			this.store.delete(key);
			return null;
		}
		return entry.series;
	}

	// ─── Write ───────────────────────────────────────────────────

	/** Store a complete series with the given TTL. */
	set(key: string, series: NormalizedSeries, ttlMs = 60_000): void {
		if (this.store.size >= this.maxEntries) this.evictOldest();
		this.store.set(key, { series, expiresAt: Date.now() + ttlMs });
	}

	/**
	 * Append new points to an existing cached series.
	 *
	 * Points whose timestamp already exists in the cache are deduplicated.
	 * The resulting series is re-sorted by timestamp. If the key is not
	 * already cached, this is a no-op.
	 *
	 * @param key    - Cache key.
	 * @param newPoints - Points to merge in.
	 * @param ttlMs  - Refreshed TTL applied after the append.
	 */
	append(key: string, newPoints: NormalizedPoint[], ttlMs = 60_000): void {
		const existing = this.get(key);
		if (!existing) return;

		const tsSet = new Set(existing.points.map(p => p.ts));
		const unique = newPoints.filter(p => !tsSet.has(p.ts));
		const merged = [...existing.points, ...unique].sort((a, b) => a.ts - b.ts);

		this.set(key, { ...existing, points: merged }, ttlMs);
	}

	/**
	 * Trim a cached series to retain only the most recent `maxPoints` points.
	 *
	 * If the series has fewer than `maxPoints` this is a no-op.
	 */
	trim(key: string, maxPoints: number): void {
		const entry = this.store.get(key);
		if (!entry) return;
		if (entry.series.points.length > maxPoints) {
			entry.series = {
				...entry.series,
				points: entry.series.points.slice(-maxPoints),
			};
		}
	}

	// ─── Invalidation ────────────────────────────────────────────

	/** Remove all entries whose key contains `:symbol:`. */
	invalidate(symbol: string): void {
		const pattern = `:${symbol}:`;
		for (const key of this.store.keys()) {
			if (key.includes(pattern)) this.store.delete(key);
		}
	}

	/** Remove all entries. */
	invalidateAll(): void {
		this.store.clear();
	}

	// ─── Introspection ───────────────────────────────────────────

	get size(): number {
		return this.store.size;
	}

	// ─── Internal ────────────────────────────────────────────────

	/**
	 * Evict the oldest 10 % of entries by expiry time.
	 * Called automatically when `maxEntries` is reached.
	 */
	private evictOldest(): void {
		const entries = [...this.store.entries()]
			.sort(([, a], [, b]) => a.expiresAt - b.expiresAt);
		const toEvict = Math.max(1, Math.floor(entries.length * 0.1));
		for (let i = 0; i < toEvict; i++) {
			this.store.delete(entries[i][0]);
		}
	}
}
