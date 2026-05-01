/**
 * GET /api/patterns/:slug/formula
 *
 * Returns a {@link PatternFormula} payload — settings, variables (component
 * score keys), regime × p_win bucket grid, recent traded evidence, and an
 * auto-built suspect queue (blocked candidates that appreciated post-block).
 *
 * Auth: bearer/session required (decision C1).
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import {
	checkAvailability,
	fetchBlocked,
	fetchComponentScoreKeys,
	fetchLastFiredAt,
	fetchTradedReturns,
	pickReturnByHorizon,
} from '$lib/server/counterfactualRepo';
import {
	PatternFormulaSchema,
	type BucketCell,
	type EvidenceRow,
	type PatternFormula,
	type SuspectRow,
	type SuspectWeight,
} from '$lib/contracts/patternFormula';
import { query } from '$lib/server/db';

const SINCE_DAYS = 90;

const REGIMES = ['bull', 'neutral', 'bear'] as const;
type Regime = (typeof REGIMES)[number];

const PWIN_BUCKETS: { label: string; lo: number; hi: number }[] = [
	{ label: '0.55-0.60', lo: 0.55, hi: 0.6 },
	{ label: '0.60-0.65', lo: 0.6, hi: 0.65 },
	{ label: '0.65-0.70', lo: 0.65, hi: 0.7 },
	{ label: '0.70+', lo: 0.7, hi: Number.POSITIVE_INFINITY },
];

const SUSPECT_LIMIT = 5;

interface ComponentScoreRow {
	id: string;
	component_scores: Record<string, unknown> | null;
}

function deriveRegime(scores: Record<string, unknown> | null | undefined): Regime {
	// Heuristic: prefer explicit `regime` key if present, otherwise classify
	// from `htf_structure` sign. Falls back to neutral.
	if (!scores) return 'neutral';
	const explicit = scores.regime;
	if (typeof explicit === 'string') {
		const lower = explicit.toLowerCase();
		if (lower === 'bull' || lower === 'bullish') return 'bull';
		if (lower === 'bear' || lower === 'bearish') return 'bear';
		return 'neutral';
	}
	const htf = Number(scores.htf_structure);
	if (Number.isFinite(htf)) {
		if (htf > 0.2) return 'bull';
		if (htf < -0.2) return 'bear';
	}
	return 'neutral';
}

function pickPwin(scores: Record<string, unknown> | null | undefined): number | null {
	if (!scores) return null;
	const v = scores.p_win;
	if (typeof v === 'number' && Number.isFinite(v)) return v;
	return null;
}

function classifyWeight(cf24h: number | null): SuspectWeight {
	if (cf24h == null) return 'low';
	const abs = Math.abs(cf24h);
	if (abs >= 2) return 'high';
	if (abs >= 1) return 'med';
	return 'low';
}

export const GET: RequestHandler = async ({ params, cookies }) => {
	const user = await getAuthUserFromCookies(cookies);
	if (!user) return json({ ok: false, data: null });

	const slug = params.slug;
	if (!slug) return json({ ok: false, data: null }, { status: 400 });

	const availability = await checkAvailability();
	if (!availability.traded) {
		return json({ ok: true, data: emptyFormula(slug) });
	}

	const [variables, calibratedAt, traded, scoreRows, blocked] = await Promise.all([
		fetchComponentScoreKeys(slug, SINCE_DAYS),
		fetchLastFiredAt(slug),
		fetchTradedReturns({ pattern: slug, sinceDays: SINCE_DAYS }),
		query<ComponentScoreRow>(
			`SELECT id::text AS id, component_scores
			 FROM public.scan_signal_events
			 WHERE pattern = $1
			   AND fired_at >= now() - ($2::int * interval '1 day')`,
			[slug, SINCE_DAYS]
		).then((r) => r.rows),
		availability.blocked
			? fetchBlocked({ pattern: slug, sinceDays: SINCE_DAYS })
			: Promise.resolve([]),
	]);

	// Settings: best-effort from most recent traded row.
	const tpPct = traded[0] ? extractNumeric(scoreRows, traded[0].id, 'tp_pct') : null;
	const slPct = traded[0] ? extractNumeric(scoreRows, traded[0].id, 'sl_pct') : null;
	const cooldownMin = traded[0]
		? extractNumeric(scoreRows, traded[0].id, 'cooldown_min')
		: null;
	const settings = {
		p_win_min: 0.55,
		tp_pct: tpPct ?? 0.6,
		sl_pct: slPct ?? 0.3,
		cooldown_min: cooldownMin ?? 60,
		regime_allow: ['bull', 'neutral'],
	};

	// Buckets: regime × p_win quantile grid using outcomes at 24h.
	const buckets = buildBuckets(traded, scoreRows);

	// Evidence: latest 5 traded with non-null r24h
	const evidence: EvidenceRow[] = traded
		.filter((r) => r.r24h != null)
		.slice(0, 5)
		.map((r) => ({
			id: r.id,
			fired_at: r.fired_at,
			symbol: r.symbol,
			direction: r.direction,
			pnl_24h: r.r24h,
			evidence_hash: r.id.slice(0, 8),
		}));

	// Suspect queue: blocked rows where 24h forward return > +1%
	const suspects: SuspectRow[] = blocked
		.filter((r) => r.r24h != null && r.r24h > 1)
		.sort((a, b) => (b.r24h ?? 0) - (a.r24h ?? 0))
		.slice(0, SUSPECT_LIMIT)
		.map((r) => ({
			candidate_id: r.id,
			blocked_at: r.blocked_at,
			symbol: r.symbol,
			blocked_reason: r.reason,
			cf_24h: r.r24h,
			weight: classifyWeight(r.r24h),
		}));

	const formula: PatternFormula = {
		slug,
		settings,
		calibrated_at: calibratedAt,
		variables,
		buckets,
		evidence,
		suspects,
		outcomes_available: availability.traded && availability.blocked,
	};

	const parsed = PatternFormulaSchema.safeParse(formula);
	if (!parsed.success) {
		return json({ ok: false, data: null, error: 'contract_mismatch' }, { status: 500 });
	}
	return json({ ok: true, data: parsed.data });
};

function extractNumeric(
	scoreRows: ComponentScoreRow[],
	signalId: string,
	key: string
): number | null {
	const row = scoreRows.find((s) => s.id === signalId);
	if (!row || !row.component_scores) return null;
	const v = row.component_scores[key];
	if (typeof v === 'number' && Number.isFinite(v)) return v;
	return null;
}

function buildBuckets(
	traded: { id: string; r24h: number | null }[],
	scoreRows: ComponentScoreRow[]
): BucketCell[] {
	const buckets = new Map<string, { sum: number; n: number }>();
	const scoreById = new Map<string, ComponentScoreRow['component_scores']>();
	for (const s of scoreRows) scoreById.set(s.id, s.component_scores);

	for (const t of traded) {
		if (t.r24h == null) continue;
		const scores = scoreById.get(t.id);
		const regime = deriveRegime(scores);
		const pwin = pickPwin(scores);
		if (pwin == null) continue;
		const bucket = PWIN_BUCKETS.find((b) => pwin >= b.lo && pwin < b.hi);
		if (!bucket) continue;
		const key = `${regime}|${bucket.label}`;
		const cur = buckets.get(key) ?? { sum: 0, n: 0 };
		cur.sum += t.r24h;
		cur.n += 1;
		buckets.set(key, cur);
	}

	const out: BucketCell[] = [];
	for (const regime of REGIMES) {
		for (const b of PWIN_BUCKETS) {
			const cur = buckets.get(`${regime}|${b.label}`) ?? { sum: 0, n: 0 };
			out.push({
				regime,
				quantile: b.label,
				n: cur.n,
				pnl: cur.n > 0 ? round4(cur.sum / cur.n) : 0,
			});
		}
	}
	return out;
}

function round4(v: number): number {
	if (!Number.isFinite(v)) return 0;
	return Math.round(v * 1e4) / 1e4;
}

function emptyFormula(slug: string): PatternFormula {
	const buckets: BucketCell[] = [];
	for (const regime of REGIMES) {
		for (const b of PWIN_BUCKETS) {
			buckets.push({ regime, quantile: b.label, n: 0, pnl: 0 });
		}
	}
	return {
		slug,
		settings: {
			p_win_min: 0.55,
			tp_pct: 0.6,
			sl_pct: 0.3,
			cooldown_min: 60,
			regime_allow: ['bull', 'neutral'],
		},
		calibrated_at: null,
		variables: [],
		buckets,
		evidence: [],
		suspects: [],
		outcomes_available: false,
	};
}
