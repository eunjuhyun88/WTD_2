// ═══════════════════════════════════════════════════════════════
// Data Engine — Timeframe Normalization
// ═══════════════════════════════════════════════════════════════
//
// Normalize timeframe strings to canonical format.
// Canonical: '1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w'
// Invalid or missing input defaults to '4h'.

// ─── Valid Timeframes ─────────────────────────────────────────

export const VALID_TIMEFRAMES = ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w'] as const;
export type ValidTimeframe = (typeof VALID_TIMEFRAMES)[number];

// ─── Alias Map ────────────────────────────────────────────────

const TF_ALIASES: Record<string, ValidTimeframe> = {
	// Minutes
	'1m': '1m', '1min': '1m', '1minute': '1m',
	'5m': '5m', '5min': '5m', '5minute': '5m',
	'15m': '15m', '15min': '15m',
	'30m': '30m', '30min': '30m',
	// Hours
	'1h': '1h', '1hour': '1h', '60m': '1h', '60min': '1h',
	'4h': '4h', '4hour': '4h', '240m': '4h',
	// Days
	'1d': '1d', '1day': '1d', '1D': '1d', 'D': '1d', 'daily': '1d',
	// Weeks
	'1w': '1w', '1week': '1w', '1W': '1w', 'W': '1w', 'weekly': '1w',
};

// ─── Normalize ────────────────────────────────────────────────

/**
 * Normalize a timeframe string to canonical format.
 * Returns '4h' as default when input is missing or unrecognized.
 *
 * @param input - Raw timeframe string from any source.
 * @returns Canonical timeframe (e.g., '4h', '1d').
 */
export function normalizeTimeframe(input?: string | null): ValidTimeframe {
	if (!input) return '4h';
	const key = input.trim().toLowerCase();
	return TF_ALIASES[key] ?? TF_ALIASES[input.trim()] ?? '4h';
}

// ─── Duration Helper ─────────────────────────────────────────

/**
 * Get the duration of a timeframe in seconds.
 *
 * @param tf - Canonical timeframe.
 * @returns Duration in seconds.
 */
export function timeframeDurationSeconds(tf: ValidTimeframe): number {
	const durations: Record<ValidTimeframe, number> = {
		'1m': 60,
		'5m': 300,
		'15m': 900,
		'30m': 1800,
		'1h': 3600,
		'4h': 14400,
		'1d': 86400,
		'1w': 604800,
	};
	return durations[tf];
}
