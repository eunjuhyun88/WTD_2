// ═══════════════════════════════════════════════════════════════
// Data Engine — Snapshot Cache
// ═══════════════════════════════════════════════════════════════
//
// Latest-value snapshot cache.
//
// Stores the most recent NormalizedSnapshot for each metric/symbol
// combination. Suited for frequently-updating scalars such as
// funding rate, OI, mark price, and fear/greed index.
//
// Key convention: 'provider:metric:symbol'
//   e.g., 'binance:funding_rate:BTCUSDT'

import type { NormalizedSnapshot } from '../types';

interface SnapshotEntry {
	snapshot: NormalizedSnapshot;
	expiresAt: number;
}

/**
 * Latest-value snapshot cache with per-entry TTL.
 *
 * Only one value is stored per key; calling `set` with the same key
 * replaces the previous value. Expired entries are lazily removed on
 * the next access that targets them.
 */
export class SnapshotCache {
	private readonly store = new Map<string, SnapshotEntry>();

	// ─── Read ────────────────────────────────────────────────────

	/** Return the snapshot for `key`, or null if absent / expired. */
	get(key: string): NormalizedSnapshot | null {
		const entry = this.store.get(key);
		if (!entry) return null;
		if (Date.now() > entry.expiresAt) {
			this.store.delete(key);
			return null;
		}
		return entry.snapshot;
	}

	/**
	 * Return all non-expired snapshots whose `symbol` field matches.
	 *
	 * Expired entries encountered during the scan are lazily evicted.
	 */
	getAll(symbol: string): NormalizedSnapshot[] {
		const results: NormalizedSnapshot[] = [];
		const now = Date.now();
		for (const [key, entry] of this.store) {
			if (now > entry.expiresAt) {
				this.store.delete(key);
				continue;
			}
			if (entry.snapshot.symbol === symbol) {
				results.push(entry.snapshot);
			}
		}
		return results;
	}

	// ─── Write ───────────────────────────────────────────────────

	/** Store a snapshot with the given TTL, replacing any existing entry. */
	set(key: string, snapshot: NormalizedSnapshot, ttlMs = 60_000): void {
		this.store.set(key, { snapshot, expiresAt: Date.now() + ttlMs });
	}

	// ─── Invalidation ────────────────────────────────────────────

	/** Remove all entries for the given symbol. */
	invalidate(symbol: string): void {
		for (const [key, entry] of this.store) {
			if (entry.snapshot.symbol === symbol) this.store.delete(key);
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
}
