/**
 * Counterfactual review contracts (W-0383)
 *
 * Boundary types for `/lab/counterfactual` and `/patterns/filter-drag`.
 *
 * The dashboards consume two API surfaces:
 *   GET /api/lab/counterfactual         — distribution comparison + signal table.
 *   GET /api/patterns/:slug/filter-drag — per-filter attribution + equity preview.
 *
 * Both rely on `scan_signal_events × scan_signal_outcomes` (traded leg) and
 * `blocked_candidates` (counterfactual leg). When the counterfactual table is
 * absent (e.g. local dev without W-0382 migrations), the API returns an empty
 * payload with `outcomes_available: false` so the UI can render a soft empty
 * state instead of erroring.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

export const HorizonHourSchema = z.union([
	z.literal(1),
	z.literal(4),
	z.literal(24),
	z.literal(72),
]);
export type HorizonHour = z.infer<typeof HorizonHourSchema>;

export const SinceDaysSchema = z.union([z.literal(7), z.literal(30), z.literal(90)]);
export type SinceDays = z.infer<typeof SinceDaysSchema>;

export const VerdictSchema = z.enum(['keep', 'relax', 'inconclusive']);
export type Verdict = z.infer<typeof VerdictSchema>;

const FiniteNumber = z.number().refine((n) => Number.isFinite(n), 'must be finite');

// ---------------------------------------------------------------------------
// /lab/counterfactual
// ---------------------------------------------------------------------------

export const DistributionStatsSchema = z.object({
	n: z.number().int().nonnegative(),
	median: FiniteNumber,
	iqr: z.tuple([FiniteNumber, FiniteNumber]),
	p_win: FiniteNumber,
	histogram: z.array(z.number().int().nonnegative()),
});
export type DistributionStats = z.infer<typeof DistributionStatsSchema>;

export const WelchTestSchema = z.object({
	t: FiniteNumber,
	p: FiniteNumber,
	df: FiniteNumber.optional(),
	insufficient_data: z.boolean().default(false),
});
export type WelchTest = z.infer<typeof WelchTestSchema>;

export const ReasonRowSchema = z.object({
	reason: z.string(),
	n: z.number().int().nonnegative(),
	median: FiniteNumber,
	p_win: FiniteNumber,
	delta: FiniteNumber,
	verdict: VerdictSchema,
});
export type ReasonRow = z.infer<typeof ReasonRowSchema>;

export const ForwardReturnRowSchema = z.object({
	id: z.string(),
	time: z.string(), // ISO8601
	symbol: z.string(),
	pattern: z.string().nullable(),
	direction: z.string(),
	status: z.enum(['traded', 'blocked']),
	reason: z.string().nullable(),
	r1h: FiniteNumber.nullable(),
	r4h: FiniteNumber.nullable(),
	r24h: FiniteNumber.nullable(),
});
export type ForwardReturnRow = z.infer<typeof ForwardReturnRowSchema>;

export const CounterfactualReviewSchema = z.object({
	pattern: z.string(),
	horizon: HorizonHourSchema,
	since_days: SinceDaysSchema,
	traded: DistributionStatsSchema,
	blocked: DistributionStatsSchema,
	delta_median: FiniteNumber,
	ci_95: z.tuple([FiniteNumber, FiniteNumber]),
	welch: WelchTestSchema,
	by_reason: z.array(ReasonRowSchema),
	table: z.array(ForwardReturnRowSchema),
	outcomes_available: z.boolean(),
});
export type CounterfactualReview = z.infer<typeof CounterfactualReviewSchema>;

// ---------------------------------------------------------------------------
// /patterns/filter-drag
// ---------------------------------------------------------------------------

export const FilterTypeSchema = z.enum(['number', 'toggle', 'duration']);
export type FilterType = z.infer<typeof FilterTypeSchema>;

export const FilterRowSchema = z.object({
	key: z.string(),
	label: z.string(),
	type: FilterTypeSchema,
	range: z.tuple([FiniteNumber, FiniteNumber]).nullable(),
	current: z.union([FiniteNumber, z.boolean()]),
	simulated: z.union([FiniteNumber, z.boolean()]),
	pnl_delta_pct: FiniteNumber,
	trade_count_delta: z.number().int(),
});
export type FilterRow = z.infer<typeof FilterRowSchema>;

export const EquityPreviewSchema = z.object({
	current: z.object({
		equity: z.array(FiniteNumber),
		sharpe: FiniteNumber,
	}),
	simulated: z.object({
		equity: z.array(FiniteNumber),
		sharpe: FiniteNumber,
	}),
	delta_pct: FiniteNumber,
});
export type EquityPreview = z.infer<typeof EquityPreviewSchema>;

export const FilterDragStateSchema = z.object({
	slug: z.string(),
	since_days: SinceDaysSchema,
	filters: z.array(FilterRowSchema),
	preview: EquityPreviewSchema,
	outcomes_available: z.boolean(),
});
export type FilterDragState = z.infer<typeof FilterDragStateSchema>;
