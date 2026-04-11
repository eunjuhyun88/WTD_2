/**
 * VerdictBlock — Shared Contract
 *
 * This is the single contract that ties the three pipelines together:
 *
 *   A — Market → Verdict pipeline  (produces a VerdictBlock)
 *   C — Decision Journal bridge    (embeds it inside a trajectory row)
 *   B — ORPO pair generator        (reads the embedded block as pair context)
 *
 * Any code that handles a verdict — engine, API route, DB write, LLM tool
 * handler, terminal UI — must parse / validate against this schema. No ad-hoc
 * interface redefinitions allowed.
 *
 * Source of truth for field shape:
 *   docs/exec-plans/active/alpha-terminal-harness-engine-spec-2026-04-09.md §8
 *   docs/exec-plans/active/three-pipeline-integration-design-2026-04-11.md §Phase 0 Step 0.1
 */

import { z } from 'zod';
import {
	StructureStateId,
	VerdictBias,
	VerdictUrgency,
	EventDirection,
	EventSeverity
} from './ids.ts';

// ---------------------------------------------------------------------------
// Primitive / shared sub-schemas
// ---------------------------------------------------------------------------

/** ISO-8601 timestamp, tightly validated so bad data fails fast at the edge. */
export const IsoTimestampSchema = z
	.string()
	.datetime({ offset: true })
	.describe('ISO-8601 timestamp with timezone offset');

/** Symbol identifier, e.g. "BTCUSDT". Upper-case, letters + digits only. */
export const SymbolSchema = z
	.string()
	.min(3)
	.max(32)
	.regex(/^[A-Z0-9]+$/, 'symbol must be upper-case alphanumerics');

/** Timeframe label accepted by the scan engine. */
export const TimeframeSchema = z.enum(['1m', '5m', '15m', '1h', '4h', '1d']);
export type Timeframe = z.infer<typeof TimeframeSchema>;

/** Zod enum mirrors of the branded enums in ids.ts. */
export const VerdictBiasSchema = z.enum([
	VerdictBias.STRONG_BULL,
	VerdictBias.BULL,
	VerdictBias.NEUTRAL,
	VerdictBias.BEAR,
	VerdictBias.STRONG_BEAR
]);

export const VerdictUrgencySchema = z.enum([
	VerdictUrgency.LOW,
	VerdictUrgency.MEDIUM,
	VerdictUrgency.HIGH
]);

export const StructureStateIdSchema = z.enum([
	StructureStateId.NONE,
	StructureStateId.RANGE_UNRESOLVED,
	StructureStateId.ACC_PHASE_A,
	StructureStateId.ACC_PHASE_B,
	StructureStateId.ACC_PHASE_C,
	StructureStateId.ACC_PHASE_D,
	StructureStateId.ACC_PHASE_E,
	StructureStateId.REACCUMULATION,
	StructureStateId.DIST_PHASE_A,
	StructureStateId.DIST_PHASE_B,
	StructureStateId.DIST_PHASE_C,
	StructureStateId.DIST_PHASE_D,
	StructureStateId.DIST_PHASE_E,
	StructureStateId.REDISTRIBUTION,
	StructureStateId.MARKUP_CONTINUATION,
	StructureStateId.MARKDOWN_CONTINUATION,
	StructureStateId.FAILED_BULL_BREAKOUT,
	StructureStateId.FAILED_BEAR_BREAKDOWN
]);

export const EventDirectionSchema = z.enum([
	EventDirection.BULL,
	EventDirection.BEAR,
	EventDirection.NEUTRAL,
	EventDirection.CONTEXT
]);

export const EventSeveritySchema = z.enum([
	EventSeverity.LOW,
	EventSeverity.MEDIUM,
	EventSeverity.HIGH
]);

// ---------------------------------------------------------------------------
// Reasoning atoms
// ---------------------------------------------------------------------------

/**
 * One directional reason fed into the verdict assembler. Short human text
 * plus the event IDs that produced it, so the explanation panel can trace
 * the reason back to the underlying event emitters.
 */
export const VerdictReasonSchema = z.object({
	text: z.string().min(1).max(240),
	event_ids: z.array(z.string().startsWith('event.')).default([]),
	direction: EventDirectionSchema,
	severity: EventSeveritySchema
});
export type VerdictReason = z.infer<typeof VerdictReasonSchema>;

/**
 * Invalidation condition. The verdict is falsified when `price_level` is
 * crossed in the specified direction, OR when any of `breaking_events`
 * fires. Either half may be null but at least one must be present.
 */
export const VerdictInvalidationSchema = z
	.object({
		price_level: z.number().finite().nullable(),
		direction: z.enum(['above', 'below']).nullable(),
		breaking_events: z.array(z.string().startsWith('event.')).default([]),
		note: z.string().max(240).nullable()
	})
	.refine(
		(v) =>
			(v.price_level != null && v.direction != null) || (v.breaking_events?.length ?? 0) > 0,
		{ message: 'invalidation requires at least a price_level+direction pair or one breaking event' }
	);
export type VerdictInvalidation = z.infer<typeof VerdictInvalidationSchema>;

/**
 * Execution reference block. Entry / stop / targets are engine-suggested
 * numbers, not orders. The verdict itself never places trades — it only
 * describes levels a caller could use.
 */
export const VerdictExecutionSchema = z.object({
	entry_zone: z
		.object({
			low: z.number().finite(),
			high: z.number().finite(),
			note: z.string().max(120).nullable()
		})
		.nullable(),
	stop: z.number().finite().nullable(),
	targets: z.array(z.number().finite()).max(5).default([]),
	rr_reference: z.number().finite().nonnegative().nullable()
});
export type VerdictExecution = z.infer<typeof VerdictExecutionSchema>;

/**
 * Data freshness block. Every verdict must record the max age (ms) of the
 * raw fields that fed it, plus a flag that the assembler sets to `true`
 * when any required raw source is stale beyond its SLA.
 */
export const VerdictDataFreshnessSchema = z.object({
	as_of: IsoTimestampSchema,
	max_raw_age_ms: z.number().int().nonnegative(),
	stale_sources: z.array(z.string().startsWith('raw.')).default([]),
	is_stale: z.boolean()
});
export type VerdictDataFreshness = z.infer<typeof VerdictDataFreshnessSchema>;

// ---------------------------------------------------------------------------
// VerdictBlock — the root schema
// ---------------------------------------------------------------------------

export const VerdictBlockSchemaVersion = 'verdict_block-v1' as const;
export type VerdictBlockSchemaVersion = typeof VerdictBlockSchemaVersion;

export const VerdictBlockSchema = z.object({
	// Envelope ------------------------------------------------------------
	schema_version: z.literal(VerdictBlockSchemaVersion),
	trace_id: z.string().min(1),
	symbol: SymbolSchema,
	primary_timeframe: TimeframeSchema,

	// Directional core ----------------------------------------------------
	bias: VerdictBiasSchema,
	structure_state: StructureStateIdSchema,
	confidence: z.number().min(0).max(1),
	urgency: VerdictUrgencySchema,

	// Reasoning -----------------------------------------------------------
	top_reasons: z.array(VerdictReasonSchema).min(0).max(8),
	counter_reasons: z.array(VerdictReasonSchema).min(0).max(8),

	// Execution and risk --------------------------------------------------
	invalidation: VerdictInvalidationSchema,
	execution: VerdictExecutionSchema,

	// Freshness and provenance --------------------------------------------
	data_freshness: VerdictDataFreshnessSchema,

	/**
	 * Legacy ranking field preserved until Phase 3 exit (design doc §
	 * "Non-Negotiable Invariants" #4). Kept as a secondary sort key only;
	 * NEVER used to override `bias` / `structure_state`.
	 */
	legacy_alpha_score: z.number().finite().nullable()
});

export type VerdictBlock = z.infer<typeof VerdictBlockSchema>;

// ---------------------------------------------------------------------------
// Embed variant — fields that must never leave the server
// ---------------------------------------------------------------------------
//
// When a VerdictBlock is embedded into an ORPO preference pair context the
// assembler drops fields that would leak future information or blow up the
// training payload. Use this for pair generation, not for UI rendering.

export const VerdictBlockForPairSchema = VerdictBlockSchema.omit({
	data_freshness: true
});
export type VerdictBlockForPair = z.infer<typeof VerdictBlockForPairSchema>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Tight parse for callers that want to throw on invalid data. */
export function parseVerdictBlock(input: unknown): VerdictBlock {
	return VerdictBlockSchema.parse(input);
}

/** Safe parse that returns the zod result object. */
export function safeParseVerdictBlock(input: unknown) {
	return VerdictBlockSchema.safeParse(input);
}
