/**
 * GET /api/lab/counterfactual?pattern=&since=&horizon=
 *
 * Returns a {@link CounterfactualReview} payload — distribution comparison
 * between traded and blocked signals plus a per-reason attribution table and
 * a 50-row signal log.
 *
 * Auth: bearer/session required. Anonymous callers receive
 * `{ ok: false, data: null }` (decision C1, W-0383 design).
 *
 * No engine roundtrip — query the DB directly via getPool() (decision A1).
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import {
	checkAvailability,
	fetchBlocked,
	fetchTradedReturns,
	pickReturnByHorizon,
	HORIZONS_SUPPORTED,
} from '$lib/server/counterfactualRepo';
import {
	bootstrapMedianDeltaCi,
	summarize,
	welchTTest,
} from '$lib/lab/counterfactualStats';
import {
	CounterfactualReviewSchema,
	type CounterfactualReview,
	type ForwardReturnRow,
	type ReasonRow,
	type Verdict,
} from '$lib/contracts/counterfactualReview';

const HISTOGRAM_BINS = 20;
const SIGNAL_TABLE_LIMIT = 50;

function parseHorizon(raw: string | null): 1 | 4 | 24 | 72 {
	const n = Number(raw);
	if (HORIZONS_SUPPORTED.includes(n as 1 | 4 | 24 | 72)) return n as 1 | 4 | 24 | 72;
	return 24;
}

function parseSinceDays(raw: string | null): 7 | 30 | 90 {
	const n = Number(raw);
	if (n === 7 || n === 30 || n === 90) return n;
	return 30;
}

function classifyReason(deltaPct: number, n: number): Verdict {
	if (n < 30) return 'inconclusive';
	if (deltaPct > 0.15) return 'relax';
	return 'keep';
}

export const GET: RequestHandler = async ({ url, cookies }) => {
	const user = await getAuthUserFromCookies(cookies);
	if (!user) return json({ ok: false, data: null });

	const pattern = (url.searchParams.get('pattern') || 'ALL').trim() || 'ALL';
	const horizon = parseHorizon(url.searchParams.get('horizon'));
	const sinceDays = parseSinceDays(url.searchParams.get('since'));

	const availability = await checkAvailability();
	const outcomesAvailable = availability.traded && availability.blocked;

	if (!availability.traded) {
		return json({
			ok: true,
			data: emptyReview(pattern, horizon, sinceDays, false),
		});
	}

	const traded = await fetchTradedReturns({ pattern, sinceDays });
	const blocked = availability.blocked
		? await fetchBlocked({ pattern, sinceDays })
		: [];

	const tradedReturns = traded
		.map((r) => pickReturnByHorizon(r, horizon))
		.filter((v): v is number => v != null);
	const blockedReturns = blocked
		.map((r) => pickReturnByHorizon(r, horizon))
		.filter((v): v is number => v != null);

	const allReturns = [...tradedReturns, ...blockedReturns];
	const min = allReturns.length > 0 ? Math.min(...allReturns) : -1;
	const max = allReturns.length > 0 ? Math.max(...allReturns) : 1;
	const range: [number, number] = min === max ? [min - 0.5, max + 0.5] : [min, max];

	const tradedSummary = summarize(tradedReturns, HISTOGRAM_BINS, range);
	const blockedSummary = summarize(blockedReturns, HISTOGRAM_BINS, range);
	const welch = welchTTest(tradedReturns, blockedReturns);
	const ci95 = bootstrapMedianDeltaCi(tradedReturns, blockedReturns, { resamples: 200 });

	// Per-reason attribution
	const byReasonMap = new Map<string, number[]>();
	for (const row of blocked) {
		const v = pickReturnByHorizon(row, horizon);
		if (v == null) continue;
		const arr = byReasonMap.get(row.reason) ?? [];
		arr.push(v);
		byReasonMap.set(row.reason, arr);
	}
	const byReason: ReasonRow[] = [...byReasonMap.entries()]
		.map<ReasonRow>(([reason, returns]) => {
			const s = summarize(returns, 1, range);
			const delta = s.median - tradedSummary.median;
			return {
				reason,
				n: s.n,
				median: roundTo(s.median, 4),
				p_win: roundTo(s.p_win, 4),
				delta: roundTo(delta, 4),
				verdict: classifyReason(delta, s.n),
			};
		})
		.sort((a, b) => b.n - a.n)
		.slice(0, 5);

	// Signal table (mix traded + blocked, sort by time desc)
	const tradedRows: ForwardReturnRow[] = traded.slice(0, SIGNAL_TABLE_LIMIT).map((r) => ({
		id: r.id,
		time: r.fired_at,
		symbol: r.symbol,
		pattern: r.pattern,
		direction: r.direction,
		status: 'traded',
		reason: null,
		r1h: r.r1h,
		r4h: r.r4h,
		r24h: r.r24h,
	}));
	const blockedRows: ForwardReturnRow[] = blocked.slice(0, SIGNAL_TABLE_LIMIT).map((r) => ({
		id: r.id,
		time: r.blocked_at,
		symbol: r.symbol,
		pattern: pattern === 'ALL' ? null : pattern,
		direction: r.direction,
		status: 'blocked',
		reason: r.reason,
		r1h: r.r1h,
		r4h: r.r4h,
		r24h: r.r24h,
	}));
	const table = [...tradedRows, ...blockedRows]
		.sort((a, b) => (a.time < b.time ? 1 : -1))
		.slice(0, SIGNAL_TABLE_LIMIT);

	const review: CounterfactualReview = {
		pattern,
		horizon,
		since_days: sinceDays,
		traded: toDistribution(tradedSummary),
		blocked: toDistribution(blockedSummary),
		delta_median: roundTo(tradedSummary.median - blockedSummary.median, 4),
		ci_95: [roundTo(ci95[0], 4), roundTo(ci95[1], 4)],
		welch: {
			t: roundTo(welch.t, 4),
			p: roundTo(welch.p, 6),
			df: roundTo(welch.df, 2),
			insufficient_data: welch.insufficient_data,
		},
		by_reason: byReason,
		table,
		outcomes_available: outcomesAvailable,
	};

	const parsed = CounterfactualReviewSchema.safeParse(review);
	if (!parsed.success) {
		return json({ ok: false, data: null, error: 'contract_mismatch' }, { status: 500 });
	}
	return json({ ok: true, data: parsed.data });
};

function toDistribution(s: ReturnType<typeof summarize>) {
	return {
		n: s.n,
		median: roundTo(s.median, 4),
		iqr: [roundTo(s.iqr[0], 4), roundTo(s.iqr[1], 4)] as [number, number],
		p_win: roundTo(s.p_win, 4),
		histogram: s.histogram,
	};
}

function roundTo(v: number, digits: number): number {
	if (!Number.isFinite(v)) return 0;
	const m = 10 ** digits;
	return Math.round(v * m) / m;
}

function emptyReview(
	pattern: string,
	horizon: 1 | 4 | 24 | 72,
	sinceDays: 7 | 30 | 90,
	outcomesAvailable: boolean
): CounterfactualReview {
	const empty = summarize([], HISTOGRAM_BINS);
	return {
		pattern,
		horizon,
		since_days: sinceDays,
		traded: toDistribution(empty),
		blocked: toDistribution(empty),
		delta_median: 0,
		ci_95: [0, 0],
		welch: { t: 0, p: 1, df: 0, insufficient_data: true },
		by_reason: [],
		table: [],
		outcomes_available: outcomesAvailable,
	};
}
