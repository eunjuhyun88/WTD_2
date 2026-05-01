/**
 * Pattern Formula contract (W-0383)
 *
 * Boundary type for `/patterns/formula?slug=...` — a single-page dump of a
 * pattern's settings, variables, regime/p_win bucket grid, recent evidence,
 * and the auto-built suspect review queue (blocked candidates that paid off).
 *
 * Source tables (fall back to empty arrays when missing):
 *   - scan_signal_events / scan_signal_outcomes (evidence + buckets)
 *   - blocked_candidates                         (suspects)
 */

import { z } from 'zod';

const FiniteNumber = z.number().refine((n) => Number.isFinite(n), 'must be finite');

export const PatternSettingsSchema = z.object({
	p_win_min: FiniteNumber.nullable(),
	tp_pct: FiniteNumber.nullable(),
	sl_pct: FiniteNumber.nullable(),
	cooldown_min: FiniteNumber.nullable(),
	regime_allow: z.array(z.string()),
});
export type PatternSettings = z.infer<typeof PatternSettingsSchema>;

export const BucketCellSchema = z.object({
	regime: z.string(),
	quantile: z.string(), // '0.55-0.60' | '0.60-0.65' | '0.65-0.70' | '0.70+'
	n: z.number().int().nonnegative(),
	pnl: FiniteNumber, // mean realized pnl % at 24h
});
export type BucketCell = z.infer<typeof BucketCellSchema>;

export const EvidenceRowSchema = z.object({
	id: z.string(),
	fired_at: z.string(),
	symbol: z.string(),
	direction: z.string(),
	pnl_24h: FiniteNumber.nullable(),
	evidence_hash: z.string().nullable(),
});
export type EvidenceRow = z.infer<typeof EvidenceRowSchema>;

export const SuspectWeightSchema = z.enum(['high', 'med', 'low']);
export type SuspectWeight = z.infer<typeof SuspectWeightSchema>;

export const SuspectRowSchema = z.object({
	candidate_id: z.string(),
	blocked_at: z.string(),
	symbol: z.string(),
	blocked_reason: z.string(),
	cf_24h: FiniteNumber.nullable(),
	weight: SuspectWeightSchema,
});
export type SuspectRow = z.infer<typeof SuspectRowSchema>;

export const PatternFormulaSchema = z.object({
	slug: z.string(),
	settings: PatternSettingsSchema,
	calibrated_at: z.string().nullable(),
	variables: z.array(z.string()),
	buckets: z.array(BucketCellSchema),
	evidence: z.array(EvidenceRowSchema),
	suspects: z.array(SuspectRowSchema),
	outcomes_available: z.boolean(),
});
export type PatternFormula = z.infer<typeof PatternFormulaSchema>;
