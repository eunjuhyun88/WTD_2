/**
 * Feature registry — E1 of the harness engine integration plan.
 *
 * Features are deterministic values derived from raw sources. They
 * are not events (no threshold crossings), not states (no
 * state-machine transitions), not verdicts (no decision output).
 * They are the numeric / enum building blocks that layers emit so
 * downstream code can display, rank, and audit without re-running
 * the computation.
 *
 * Design rules:
 *   - Every `FeatureId` is a stable string constant.
 *   - Every feature ID has a zod value schema.
 *   - Features are ADDITIVE. New layer slices (E3a..e) add their
 *     own features here without touching existing ones.
 *   - No layer file imports from this file yet. E1 lands the
 *     registry; E3 sub-slices wire the layer functions to emit.
 *
 * Reference:
 *   docs/exec-plans/active/harness-engine-integration-plan-2026-04-11.md §3 E1
 *   docs/exec-plans/active/alpha-terminal-harness-html-dissection-2026-04-10.md §5
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// FeatureId — stable string constants
// ---------------------------------------------------------------------------

/**
 * Canonical feature identifiers. Each ID corresponds to a zod value
 * schema in `FeatureValueSchema`. IDs follow the namespace
 * convention `feat.<domain>.<name>`.
 */
export const FeatureId = {
	// --- Flow domain (funding / OI / L-S / taker) — wired in E3a ----------
	/** Funding-rate regime bucket — coarse bull / neutral / bear label. */
	FLOW_FR_REGIME: 'feat.flow.funding_regime',
	/** Long-short account ratio regime bucket. */
	FLOW_LONG_SHORT_REGIME: 'feat.flow.long_short_regime',
	/** Taker-buy / taker-sell ratio regime bucket. */
	FLOW_TAKER_REGIME: 'feat.flow.taker_regime',
	/** OI percent change over the window. Raw number, signed. */
	FLOW_OI_CHANGE_PCT: 'feat.flow.oi_change_pct',

	// --- Volatility domain (BB + ATR) — wired in E3b ----------------------
	/** Bollinger bandwidth — normalized (upper-lower)/mid. */
	VOL_BB_BANDWIDTH: 'feat.vol.bb_bandwidth',
	/** BB position — (close-lower)/(upper-lower), 0..1. */
	VOL_BB_POSITION: 'feat.vol.bb_position',
	/** ATR percent — ATR / close, unitless. */
	VOL_ATR_PCT: 'feat.vol.atr_pct'
} as const;

export type FeatureId = (typeof FeatureId)[keyof typeof FeatureId];

// ---------------------------------------------------------------------------
// Value schemas
// ---------------------------------------------------------------------------

// Regime buckets — the coarse labels that feed downstream reasoning.
export const FrRegimeSchema = z.enum([
	'extreme_negative',
	'negative',
	'neutral',
	'positive',
	'hot',
	'extreme_positive'
]);
export type FrRegime = z.infer<typeof FrRegimeSchema>;

export const LongShortRegimeSchema = z.enum([
	'heavy_long',
	'long',
	'balanced',
	'short',
	'heavy_short'
]);
export type LongShortRegime = z.infer<typeof LongShortRegimeSchema>;

export const TakerRegimeSchema = z.enum([
	'buyers_dominant',
	'buyers_lean',
	'balanced',
	'sellers_lean',
	'sellers_dominant'
]);
export type TakerRegime = z.infer<typeof TakerRegimeSchema>;

// ---------------------------------------------------------------------------
// Discriminated feature-value union
// ---------------------------------------------------------------------------

/**
 * A single feature entry: the ID plus its value, with a shape that
 * depends on the ID. Consumers discriminate on `id`.
 */
const FrRegimeEntrySchema = z.object({
	id: z.literal(FeatureId.FLOW_FR_REGIME),
	value: FrRegimeSchema
});

const LongShortRegimeEntrySchema = z.object({
	id: z.literal(FeatureId.FLOW_LONG_SHORT_REGIME),
	value: LongShortRegimeSchema
});

const TakerRegimeEntrySchema = z.object({
	id: z.literal(FeatureId.FLOW_TAKER_REGIME),
	value: TakerRegimeSchema
});

const OiChangePctEntrySchema = z.object({
	id: z.literal(FeatureId.FLOW_OI_CHANGE_PCT),
	value: z.number().finite()
});

const BbBandwidthEntrySchema = z.object({
	id: z.literal(FeatureId.VOL_BB_BANDWIDTH),
	value: z.number().finite().nonnegative()
});

const BbPositionEntrySchema = z.object({
	id: z.literal(FeatureId.VOL_BB_POSITION),
	value: z.number().finite()
});

const AtrPctEntrySchema = z.object({
	id: z.literal(FeatureId.VOL_ATR_PCT),
	value: z.number().finite().nonnegative()
});

export const FeatureValueSchema = z.discriminatedUnion('id', [
	FrRegimeEntrySchema,
	LongShortRegimeEntrySchema,
	TakerRegimeEntrySchema,
	OiChangePctEntrySchema,
	BbBandwidthEntrySchema,
	BbPositionEntrySchema,
	AtrPctEntrySchema
]);

export type FeatureValue = z.infer<typeof FeatureValueSchema>;

/** Parse an unknown value as a feature entry. Throws on failure. */
export function parseFeatureValue(input: unknown): FeatureValue {
	return FeatureValueSchema.parse(input);
}

export function safeParseFeatureValue(input: unknown) {
	return FeatureValueSchema.safeParse(input);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export const ALL_FEATURE_IDS: ReadonlyArray<FeatureId> = Object.freeze(
	Object.values(FeatureId) as ReadonlyArray<FeatureId>
);

export function isFeatureId(input: unknown): input is FeatureId {
	return typeof input === 'string' && ALL_FEATURE_IDS.includes(input as FeatureId);
}
