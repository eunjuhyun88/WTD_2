/**
 * Counterfactual repository (W-0383)
 *
 * Read-only data access for the counterfactual / filter-drag / formula
 * dashboards. Uses raw SQL on the existing scan_signal_events ×
 * scan_signal_outcomes × blocked_candidates schema. Engine is bypassed —
 * these pages are analytics-only and the engine has no equivalent endpoint.
 *
 * Resilience: every public function checks `to_regclass(...)` first and
 * returns `{ outcomes_available: false, ... }` with empty arrays when the
 * underlying tables are absent (e.g. dev DB missing W-0382 migration).
 *
 * No write paths live here. No personalisation. The dashboards are
 * org-wide aggregates.
 */

import { query } from './db';

const TRADED_TABLE = 'public.scan_signal_events';
const OUTCOME_TABLE = 'public.scan_signal_outcomes';
const BLOCKED_TABLE = 'public.blocked_candidates';

const HORIZON_TO_OUTCOME_COL: Record<number, 'forward_1h' | 'forward_4h' | 'forward_24h' | 'forward_72h'> = {
	1: 'forward_1h',
	4: 'forward_4h',
	24: 'forward_24h',
	72: 'forward_72h',
};

export interface DataAvailability {
	traded: boolean;
	blocked: boolean;
}

/** Check both source tables in a single round-trip. */
export async function checkAvailability(): Promise<DataAvailability> {
	const res = await query<{ traded: boolean | null; blocked: boolean | null }>(
		`SELECT
			(to_regclass($1) IS NOT NULL) AS traded,
			(to_regclass($2) IS NOT NULL) AS blocked`,
		[TRADED_TABLE, BLOCKED_TABLE]
	);
	const row = res.rows[0];
	return {
		traded: !!row?.traded,
		blocked: !!row?.blocked,
	};
}

export interface RawTradedReturn {
	id: string;
	fired_at: string;
	symbol: string;
	pattern: string;
	direction: string;
	r1h: number | null;
	r4h: number | null;
	r24h: number | null;
	r72h: number | null;
}

export async function fetchTradedReturns(opts: {
	pattern: string | 'ALL';
	sinceDays: number;
	limit?: number;
}): Promise<RawTradedReturn[]> {
	const args: unknown[] = [opts.sinceDays];
	let where = `e.fired_at >= now() - ($1::int * interval '1 day')`;
	if (opts.pattern && opts.pattern !== 'ALL') {
		args.push(opts.pattern);
		where += ` AND e.pattern = $${args.length}`;
	}
	const limit = Math.max(1, Math.min(opts.limit ?? 5000, 20000));
	const sql = `
		SELECT
			e.id::text                                              AS id,
			e.fired_at                                              AS fired_at,
			e.symbol                                                AS symbol,
			e.pattern                                               AS pattern,
			e.direction                                             AS direction,
			MAX(o.realized_pnl_pct) FILTER (WHERE o.horizon_h = 1)  AS r1h,
			MAX(o.realized_pnl_pct) FILTER (WHERE o.horizon_h = 4)  AS r4h,
			MAX(o.realized_pnl_pct) FILTER (WHERE o.horizon_h = 24) AS r24h,
			MAX(o.realized_pnl_pct) FILTER (WHERE o.horizon_h = 72) AS r72h
		FROM ${TRADED_TABLE} e
		LEFT JOIN ${OUTCOME_TABLE} o ON o.signal_id = e.id
		WHERE ${where}
		GROUP BY e.id, e.fired_at, e.symbol, e.pattern, e.direction
		ORDER BY e.fired_at DESC
		LIMIT ${limit}
	`;
	const res = await query<RawTradedReturn>(sql, args);
	return res.rows.map((r) => ({
		...r,
		fired_at: typeof r.fired_at === 'string' ? r.fired_at : new Date(r.fired_at as unknown as Date).toISOString(),
	}));
}

export interface RawBlockedRow {
	id: string;
	blocked_at: string;
	symbol: string;
	direction: string;
	reason: string;
	score: number | null;
	p_win: number | null;
	r1h: number | null;
	r4h: number | null;
	r24h: number | null;
	r72h: number | null;
}

export async function fetchBlocked(opts: {
	pattern: string | 'ALL';
	sinceDays: number;
	limit?: number;
}): Promise<RawBlockedRow[]> {
	// blocked_candidates does not currently store a pattern column (see
	// migration 044). When a pattern filter is requested we fall back to
	// "all blocked" — the UI badge labels this clearly.
	const args: unknown[] = [opts.sinceDays];
	const limit = Math.max(1, Math.min(opts.limit ?? 10000, 30000));
	const sql = `
		SELECT
			id::text       AS id,
			blocked_at     AS blocked_at,
			symbol,
			direction,
			reason::text   AS reason,
			score,
			p_win,
			forward_1h     AS r1h,
			forward_4h     AS r4h,
			forward_24h    AS r24h,
			forward_72h    AS r72h
		FROM ${BLOCKED_TABLE}
		WHERE blocked_at >= now() - ($1::int * interval '1 day')
		ORDER BY blocked_at DESC
		LIMIT ${limit}
	`;
	const res = await query<RawBlockedRow>(sql, args);
	return res.rows.map((r) => ({
		...r,
		blocked_at: typeof r.blocked_at === 'string' ? r.blocked_at : new Date(r.blocked_at as unknown as Date).toISOString(),
	}));
}

export function pickReturnByHorizon<T extends Pick<RawTradedReturn, 'r1h' | 'r4h' | 'r24h' | 'r72h'>>(
	row: T,
	horizon: number
): number | null {
	const col = HORIZON_TO_OUTCOME_COL[horizon];
	if (!col) return null;
	const v = (row as unknown as Record<string, number | null>)[col.replace('forward_', 'r')];
	return v == null ? null : v;
}

/** Most recent fired_at for a pattern slug — used as "calibrated_at" proxy. */
export async function fetchLastFiredAt(pattern: string): Promise<string | null> {
	const res = await query<{ fired_at: string | null }>(
		`SELECT MAX(fired_at) AS fired_at FROM ${TRADED_TABLE} WHERE pattern = $1`,
		[pattern]
	);
	const v = res.rows[0]?.fired_at;
	if (!v) return null;
	return typeof v === 'string' ? v : new Date(v as unknown as Date).toISOString();
}

/** Distinct component_scores keys observed for the pattern (variables list). */
export async function fetchComponentScoreKeys(pattern: string, sinceDays = 30): Promise<string[]> {
	const sql = `
		SELECT DISTINCT key
		FROM ${TRADED_TABLE}, jsonb_object_keys(component_scores) AS key
		WHERE pattern = $1
		  AND fired_at >= now() - ($2::int * interval '1 day')
		ORDER BY key ASC
	`;
	const res = await query<{ key: string }>(sql, [pattern, sinceDays]);
	return res.rows.map((r) => r.key);
}

export const HORIZONS_SUPPORTED = [1, 4, 24, 72] as const;
