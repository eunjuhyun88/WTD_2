// ═══════════════════════════════════════════════════════════════
// Data Engine — Timestamp Normalization
// ═══════════════════════════════════════════════════════════════
//
// Normalize timestamps to Unix seconds.
//
// Handles:
//   - Milliseconds (> 1e12) → divide by 1000
//   - Seconds (reasonable range) → pass through
//   - Invalid/zero → return 0

/**
 * Normalize a single timestamp to Unix seconds.
 *
 * @param ts - Raw timestamp in either seconds or milliseconds.
 * @returns Unix seconds, or 0 if the input is invalid.
 */
export function normalizeTimestamp(ts: number): number {
	if (!Number.isFinite(ts) || ts <= 0) return 0;
	// If timestamp looks like milliseconds (after 2001 in ms, before 2100 in seconds)
	if (ts > 1e12) return Math.floor(ts / 1000);
	return Math.floor(ts);
}

/**
 * Normalize an array of timestamps to Unix seconds, sorted ascending.
 *
 * @param timestamps - Raw timestamp array (ms or seconds, mixed allowed).
 * @returns Sorted array of Unix seconds.
 */
export function normalizeTimestamps(timestamps: number[]): number[] {
	return timestamps.map(normalizeTimestamp).sort((a, b) => a - b);
}

/**
 * Floor a Unix-second timestamp to the nearest timeframe boundary.
 *
 * e.g., ts=1704067261 with tfSeconds=14400 (4h) → 1704067200
 *
 * @param ts        - Unix seconds.
 * @param tfSeconds - Timeframe duration in seconds.
 * @returns Floored Unix seconds aligned to the timeframe grid.
 */
export function floorToTimeframe(ts: number, tfSeconds: number): number {
	if (tfSeconds <= 0) return ts;
	return Math.floor(ts / tfSeconds) * tfSeconds;
}
