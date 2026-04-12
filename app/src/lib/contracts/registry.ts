/**
 * Raw Source Registry — user-configurable data acquisition layer
 *
 * The raw-data layer in CHATBATTLE is NOT a hardcoded list. Users choose
 * which raw sources to pull, at what cadence, within what cost ceiling.
 * This file freezes the SHAPE of two objects:
 *
 *   1. `RawSource`             — one entry in the runtime catalog of
 *                                available data sources.
 *   2. `RawSourceSubscription` — a per-user preference row describing the
 *                                adjustments that user makes on top of
 *                                the system defaults.
 *
 * Phase 0 only defines the shapes. The actual catalog contents, the DB
 * table, and the preferences UI are Phase 1+ work. Freezing the shape here
 * lets every future loader, API route, and UI component agree on the
 * contract without retrofitting later.
 *
 * Source of truth:
 *   docs/exec-plans/active/three-pipeline-integration-design-2026-04-11.md
 *   (the raw-data customization decision was taken 2026-04-11 during
 *   Phase 0 review; see `ids.ts` header for the rationale)
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Enumerations — every field below is meant to be stable across releases.
// ---------------------------------------------------------------------------

/**
 * Polling cadence vocabulary. Matches the harness engine-spec §4 cadence
 * column plus a `realtime` tier for websocket streams and an `on_change`
 * tier for user-controlled session fields.
 */
export const RawSourceCadenceSchema = z.enum([
	'realtime',
	'1s',
	'5s',
	'15s',
	'30s',
	'1m',
	'5m',
	'15m',
	'30m',
	'1h',
	'4h',
	'1d',
	'on_change'
]);
export type RawSourceCadence = z.infer<typeof RawSourceCadenceSchema>;

/**
 * Subject-area grouping used by the preferences UI and by ranking heuristics.
 * `user_extension` covers BYOB sources a user wires themselves (e.g. their
 * own indicator endpoint).
 */
export const RawSourceCategorySchema = z.enum([
	'global',
	'scan',
	'symbol',
	'derivatives',
	'orderbook',
	'tape',
	'liquidation',
	'onchain',
	'sentiment',
	'user_extension'
]);
export type RawSourceCategory = z.infer<typeof RawSourceCategorySchema>;

/**
 * Resource impact tier. The preferences UI uses this to let users cap
 * their cost. `paid` means the source requires the user to supply their
 * own API key (BYOB).
 */
export const RawSourceCostHintSchema = z.enum([
	'free',
	'cheap',
	'metered',
	'heavy',
	'paid'
]);
export type RawSourceCostHint = z.infer<typeof RawSourceCostHintSchema>;

/**
 * What the engine should do when a source is missing, stale, or over its
 * SLA. Mirrors the "Null / fallback policy" column in harness §4.
 */
export const RawSourceNullPolicySchema = z.enum([
	'required',
	'fallback_last_known',
	'stale_safe',
	'zero_weight',
	'synthetic_safe'
]);
export type RawSourceNullPolicy = z.infer<typeof RawSourceNullPolicySchema>;

// ---------------------------------------------------------------------------
// RawSource — one catalog entry
// ---------------------------------------------------------------------------

export const RawSourceSchema = z.object({
	/** Fully-qualified `raw.*` id. Must match the loader's emit. */
	id: z.string().regex(/^raw\./, 'raw source id must start with "raw."'),

	/** Short human label for the preferences UI. */
	label: z.string().min(1).max(120),

	/** Longer description for tooltip / learn-more affordance. */
	description: z.string().max(500).nullable(),

	category: RawSourceCategorySchema,

	/** Upstream service identifier, e.g. `binance-futures`, `mempool.space`. */
	provider: z.string().min(1).max(80),

	/** Default polling cadence for this source. */
	cadence: RawSourceCadenceSchema,

	/** Value unit, e.g. `USD`, `sat/vB`, `count`, `%`. */
	unit: z.string().max(40),

	cost_hint: RawSourceCostHintSchema,
	null_policy: RawSourceNullPolicySchema,

	/**
	 * `false` = system-required, cannot be disabled by a subscription.
	 * `true`  = user is free to turn this on or off.
	 */
	optional: z.boolean(),

	/**
	 * For optional sources only: whether they are ON in the system defaults.
	 * Non-optional sources are always on regardless of this flag.
	 */
	default_on: z.boolean(),

	/** `true` = requires the user to supply an API key. */
	requires_api_key: z.boolean(),

	/** Optional upstream docs URL for the preferences UI. */
	docs_url: z.string().url().nullable()
});
export type RawSource = z.infer<typeof RawSourceSchema>;

export const RawSourceCatalogSchema = z.array(RawSourceSchema);
export type RawSourceCatalog = z.infer<typeof RawSourceCatalogSchema>;

// ---------------------------------------------------------------------------
// RawSourceSubscription — per-user preference row
// ---------------------------------------------------------------------------
//
// Semantics:
//   effective set = (non-optional sources)
//                 ∪ (optional sources with default_on = true)
//                 ∪ (ids in include_extra_ids)
//                 −  (ids in exclude_ids, only valid for optional sources)
//                 −  (sources with cost_hint above max_cost_tier)
//
// The `resolveEffectiveRawSet` helper below implements this.

export const RawSourceSubscriptionSchemaVersion = 'raw_source_subscription-v1' as const;
export type RawSourceSubscriptionSchemaVersion = typeof RawSourceSubscriptionSchemaVersion;

export const RawSourceSubscriptionSchema = z
	.object({
		schema_version: z.literal(RawSourceSubscriptionSchemaVersion),
		user_id: z.string().min(1),

		/** Optional raws the user opted IN that are not on by default. */
		include_extra_ids: z.array(z.string().regex(/^raw\./)).default([]),

		/** Raws the user opted OUT of. Must reference optional sources only. */
		exclude_ids: z.array(z.string().regex(/^raw\./)).default([]),

		/** Per-raw cadence override. Keyed by raw id. */
		polling_overrides: z
			.record(z.string().regex(/^raw\./), RawSourceCadenceSchema)
			.default({}),

		/**
		 * Cost ceiling. If set, sources with `cost_hint` ranked above this
		 * tier are filtered out of the effective set regardless of include/
		 * exclude. `null` = no ceiling.
		 */
		max_cost_tier: RawSourceCostHintSchema.nullable().default(null),

		updated_at: z.string().datetime({ offset: true })
	})
	.refine(
		(s) => !s.include_extra_ids.some((id) => s.exclude_ids.includes(id)),
		{
			message: 'raw id cannot appear in both include_extra_ids and exclude_ids'
		}
	);
export type RawSourceSubscription = z.infer<typeof RawSourceSubscriptionSchema>;

// ---------------------------------------------------------------------------
// BYOB: per-provider API key override (server-only)
// ---------------------------------------------------------------------------
//
// API keys must never leave the server. This schema is intentionally kept
// SEPARATE from `RawSourceSubscriptionSchema` so that the subscription
// schema is safe to serialize to the client (e.g. for a preferences page),
// while keys are only ever loaded inside server-authoritative code.

export const RawProviderKeyOverrideSchema = z.object({
	user_id: z.string().min(1),
	provider: z.string().min(1).max(80),
	// NOTE: this field must be stored encrypted at rest and NEVER echoed
	// back to the client. The contract keeps it as a plain string because
	// server code is the only caller.
	api_key_ciphertext: z.string().min(1),
	updated_at: z.string().datetime({ offset: true })
});
export type RawProviderKeyOverride = z.infer<typeof RawProviderKeyOverrideSchema>;

// ---------------------------------------------------------------------------
// Resolver helper
// ---------------------------------------------------------------------------

const COST_RANK: Record<RawSourceCostHint, number> = {
	free: 0,
	cheap: 1,
	metered: 2,
	heavy: 3,
	paid: 4
};

/**
 * Compute the effective set of raw sources for a user given the catalog
 * and their subscription. Pure function — no I/O, no clock reads, no
 * mutation. Safe to call from both server and client.
 */
export function resolveEffectiveRawSet(
	catalog: RawSourceCatalog,
	subscription: RawSourceSubscription | null
): RawSource[] {
	if (!subscription) {
		// No preferences = system defaults only
		return catalog.filter((s) => !s.optional || s.default_on);
	}

	const include = new Set(subscription.include_extra_ids);
	const exclude = new Set(subscription.exclude_ids);
	const maxCost =
		subscription.max_cost_tier != null
			? COST_RANK[subscription.max_cost_tier]
			: Number.POSITIVE_INFINITY;

	return catalog.filter((s) => {
		if (COST_RANK[s.cost_hint] > maxCost) return false;
		if (!s.optional) return true; // system-required, always in
		if (exclude.has(s.id)) return false;
		if (include.has(s.id)) return true;
		return s.default_on;
	});
}

/**
 * Resolve the effective cadence for a given raw id, honoring a user
 * cadence override if present. Returns `null` when the id is not in the
 * effective set for that subscription.
 */
export function resolveEffectiveCadence(
	catalog: RawSourceCatalog,
	subscription: RawSourceSubscription | null,
	rawId: string
): RawSourceCadence | null {
	const effective = resolveEffectiveRawSet(catalog, subscription);
	const source = effective.find((s) => s.id === rawId);
	if (!source) return null;
	const override = subscription?.polling_overrides?.[rawId];
	return override ?? source.cadence;
}

// ---------------------------------------------------------------------------
// Parse helpers
// ---------------------------------------------------------------------------

export function parseRawSource(input: unknown): RawSource {
	return RawSourceSchema.parse(input);
}

export function parseRawSourceCatalog(input: unknown): RawSourceCatalog {
	return RawSourceCatalogSchema.parse(input);
}

export function parseRawSourceSubscription(input: unknown): RawSourceSubscription {
	return RawSourceSubscriptionSchema.parse(input);
}

export function safeParseRawSourceSubscription(input: unknown) {
	return RawSourceSubscriptionSchema.safeParse(input);
}
