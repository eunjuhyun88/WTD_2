/**
 * DecisionTrajectory + ORPO Preference Pair — Shared Contracts
 *
 * Pipeline C (Decision Journal bridge) stores one `DecisionTrajectory` row
 * per user-or-agent decision. Each row embeds the `VerdictBlock` that
 * produced the decision and carries outcome fields that get filled in
 * asynchronously by the outcome resolver.
 *
 * Pipeline B (ORPO pair generator) later reads clusters of resolved
 * trajectories and emits `MLPreferencePair` rows — the actual training
 * signal that gets fed into fine-tuning.
 *
 * Source of truth:
 *   docs/ORPO_DATA_SCHEMA_PIPELINE_v1_2026-02-26.md §§2, 3, 4, 7
 *   docs/exec-plans/active/alpha-terminal-harness-engine-spec-2026-04-09.md §8
 *   docs/exec-plans/active/three-pipeline-integration-design-2026-04-11.md §Phase 0 Step 0.2
 */

import { z } from 'zod';
import {
	IsoTimestampSchema,
	SymbolSchema,
	TimeframeSchema,
	VerdictBlockSchema,
	VerdictBlockForPairSchema
} from './verdict';

// ---------------------------------------------------------------------------
// Decision envelope: who decided what, in response to which verdict
// ---------------------------------------------------------------------------

export const DecisionActorSchema = z.object({
	kind: z.enum(['user', 'agent', 'baseline']),
	id: z.string().min(1),
	/** Model name / policy version if `kind === 'agent'`, else `null`. */
	policy_version: z.string().nullable()
});
export type DecisionActor = z.infer<typeof DecisionActorSchema>;

export const DecisionActionSchema = z.enum(['open_long', 'open_short', 'close', 'wait']);
export type DecisionAction = z.infer<typeof DecisionActionSchema>;

export const DecisionSchema = z.object({
	actor: DecisionActorSchema,
	action: DecisionActionSchema,
	size_pct: z.number().min(0).max(100).nullable(),
	leverage: z.number().min(0).max(125).nullable(),
	stop_price: z.number().finite().nullable(),
	tp_prices: z.array(z.number().finite()).max(5).default([]),
	note: z.string().max(1000).nullable()
});
export type Decision = z.infer<typeof DecisionSchema>;

// ---------------------------------------------------------------------------
// Outcome — filled asynchronously by the resolver
// ---------------------------------------------------------------------------

/**
 * The outcome slot is always a single object so that clients can branch on
 * `resolved === false` before reading metrics. Metrics are nullable until
 * resolved.
 */
export const TrajectoryOutcomeSchema = z.object({
	resolved: z.boolean(),
	resolved_at: IsoTimestampSchema.nullable(),

	// Price-path outcome
	pnl_bps: z.number().finite().nullable(),
	max_favorable_bps: z.number().finite().nullable(),
	max_adverse_bps: z.number().finite().nullable(),

	// Structural outcome
	tp_hit_index: z.number().int().min(0).max(4).nullable(),
	stop_hit: z.boolean().nullable(),
	structure_state_after: z.string().startsWith('state.').nullable(),

	// Policy outcome (ORPO utility, harness + ORPO doc §4.2)
	utility_score: z.number().finite().nullable(),
	rule_violation_count: z.number().int().min(0).nullable(),
	p0_violation: z.boolean().nullable()
});
export type TrajectoryOutcome = z.infer<typeof TrajectoryOutcomeSchema>;

// ---------------------------------------------------------------------------
// DecisionTrajectory — the root row schema for `decision_trajectories`
// ---------------------------------------------------------------------------

export const DecisionTrajectorySchemaVersion = 'decision_trajectory-v1' as const;
export type DecisionTrajectorySchemaVersion = typeof DecisionTrajectorySchemaVersion;

export const DecisionTrajectorySchema = z.object({
	// Envelope ------------------------------------------------------------
	schema_version: z.literal(DecisionTrajectorySchemaVersion),
	id: z.string().uuid(),
	trace_id: z.string().min(1),
	created_at: IsoTimestampSchema,

	// Market context ------------------------------------------------------
	symbol: SymbolSchema,
	primary_timeframe: TimeframeSchema,
	regime: z.enum(['trend', 'range', 'high_vol', 'unknown']),

	// The frozen verdict at decision time ---------------------------------
	verdict_block: VerdictBlockSchema,

	// The decision made on top of that verdict ----------------------------
	decision: DecisionSchema,

	// Time-axis outcome, filled in later ----------------------------------
	outcome: TrajectoryOutcomeSchema,

	// Data quality --------------------------------------------------------
	/** 0..1 — filled by normalizer; used by pair quality gate. */
	feature_completeness: z.number().min(0).max(1)
});

export type DecisionTrajectory = z.infer<typeof DecisionTrajectorySchema>;

// ---------------------------------------------------------------------------
// MLPreferencePair — the ORPO learning signal
// ---------------------------------------------------------------------------
//
// `prompt` is the shared context (already validated VerdictBlockForPair),
// `chosen` / `rejected` are the two competing decisions with their outcomes.
// margin = utility(chosen) - utility(rejected), quality gate applied per
// ORPO doc §4.3.

export const ORPOPromptSchemaVersion = 'orpo-prompt-v1' as const;
export const ORPOResponseSchemaVersion = 'orpo-response-v1' as const;

export const ORPOPromptSchema = z.object({
	schema_version: z.literal(ORPOPromptSchemaVersion),
	trace_id: z.string().min(1),
	as_of: IsoTimestampSchema,
	verdict_block: VerdictBlockForPairSchema,
	regime: z.enum(['trend', 'range', 'high_vol', 'unknown'])
});
export type ORPOPrompt = z.infer<typeof ORPOPromptSchema>;

export const ORPOResponseSchema = z.object({
	schema_version: z.literal(ORPOResponseSchemaVersion),
	source_trajectory_id: z.string().uuid(),
	decision: DecisionSchema,
	/**
	 * Snapshot of the resolved outcome at pair-build time. A pair cannot be
	 * built from an unresolved trajectory, so `outcome.resolved` is pinned
	 * to `true` here and the nullable metrics are narrowed downstream.
	 */
	outcome: TrajectoryOutcomeSchema.refine((o) => o.resolved === true, {
		message: 'ORPO response must come from a resolved trajectory'
	})
});
export type ORPOResponse = z.infer<typeof ORPOResponseSchema>;

export const PairQualitySchema = z.enum(['high', 'medium', 'low']);
export type PairQuality = z.infer<typeof PairQualitySchema>;

export const MLPreferencePairSchemaVersion = 'ml_preference_pair-v1' as const;
export type MLPreferencePairSchemaVersion = typeof MLPreferencePairSchemaVersion;

export const MLPreferencePairSchema = z
	.object({
		schema_version: z.literal(MLPreferencePairSchemaVersion),
		id: z.string().uuid(),
		created_at: IsoTimestampSchema,

		dataset_version_id: z.string().uuid(),
		prompt_hash: z.string().min(1),

		prompt: ORPOPromptSchema,
		chosen: ORPOResponseSchema,
		rejected: ORPOResponseSchema,

		margin_score: z.number().finite(),
		pair_quality: PairQualitySchema,

		// Tagged copies for balance constraints (ORPO doc §6)
		regime: z.enum(['trend', 'range', 'high_vol', 'unknown']),
		timeframe: TimeframeSchema,

		// Risk flags surfaced to the balancing stage
		p0_violation_chosen: z.boolean(),
		p0_violation_rejected: z.boolean()
	})
	.refine((p) => p.chosen.source_trajectory_id !== p.rejected.source_trajectory_id, {
		message: 'chosen and rejected must come from distinct trajectories'
	})
	.refine((p) => p.margin_score >= 5, {
		message: 'margin_score below the hard quality floor (ORPO doc §4.3)'
	});

export type MLPreferencePair = z.infer<typeof MLPreferencePairSchema>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function parseDecisionTrajectory(input: unknown): DecisionTrajectory {
	return DecisionTrajectorySchema.parse(input);
}

export function safeParseDecisionTrajectory(input: unknown) {
	return DecisionTrajectorySchema.safeParse(input);
}

export function parseMLPreferencePair(input: unknown): MLPreferencePair {
	return MLPreferencePairSchema.parse(input);
}

export function safeParseMLPreferencePair(input: unknown) {
	return MLPreferencePairSchema.safeParse(input);
}

/**
 * Classify a margin score into the pair_quality enum per ORPO doc §4.3.
 * Returns `null` when below the discard threshold.
 */
export function classifyPairQuality(marginScore: number): PairQuality | null {
	if (marginScore >= 30) return 'high';
	if (marginScore >= 15) return 'medium';
	if (marginScore >= 5) return 'low';
	return null;
}
