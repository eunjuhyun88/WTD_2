/**
 * Event registry — E1 of the harness engine integration plan.
 *
 * The dissection worksheet (§4 "hard-coded threshold ledger") catalogs
 * every magic number in the source HTML and says it must become a
 * typed event. This file is where those event IDs live — NOT in
 * `ids.ts`, which stays frozen to its Phase 0 RAW + state shape.
 *
 * Design rules:
 *   - Every `EventId` is a stable string constant. Renaming is a
 *     migration, not a refactor.
 *   - Every event ID has a zod payload schema. The discriminated
 *     union `EventPayloadSchema` is what downstream code parses.
 *   - Events are ADDITIVE. New layer slices (E3a..e) each add their
 *     own events here without touching existing ones.
 *   - No layer file imports from this file yet. E1 lands the
 *     registry; E3 sub-slices wire the layer functions to emit.
 *
 * Reference:
 *   docs/exec-plans/active/harness-engine-integration-plan-2026-04-11.md §3 E1
 *   docs/exec-plans/active/alpha-terminal-harness-html-dissection-2026-04-10.md §4
 */

import { z } from 'zod';
import { EventDirection, EventSeverity } from './ids.ts';

// ---------------------------------------------------------------------------
// EventId — stable string constants
// ---------------------------------------------------------------------------

/**
 * Canonical event identifiers. Each ID corresponds to a typed payload
 * schema below. IDs follow the namespace convention `event.<layer>.<name>`.
 *
 * Never rename an existing entry. New entries go at the bottom of the
 * relevant group or a new group at the end. Removal requires a migration
 * plan — existing `MLPreferencePair` rows may reference the old ID.
 */
export const EventId = {
	// --- L2 flow (funding-rate derived) — wired in E3a ---------------------
	/** FR < -0.07: extreme negative funding → short-squeeze risk. */
	FLOW_FR_EXTREME_NEGATIVE: 'event.flow.fr_extreme_negative',
	/** FR > +0.08: extreme positive funding → long-liquidation risk. */
	FLOW_FR_EXTREME_POSITIVE: 'event.flow.fr_extreme_positive',
	/** OI ↑ + price ↑ together: longs building new exposure. */
	FLOW_LONG_ENTRY_BUILD: 'event.flow.long_entry_build',
	/** OI ↑ + price ↓ together: shorts building new exposure. */
	FLOW_SHORT_ENTRY_BUILD: 'event.flow.short_entry_build',
	/** OI ↓ + price ↑: short-covering cascade (squeeze). */
	FLOW_SHORT_SQUEEZE_ACTIVE: 'event.flow.short_squeeze_active',
	/** OI ↓ + price ↓: long-liquidation cascade. */
	FLOW_LONG_CASCADE_ACTIVE: 'event.flow.long_cascade_active',

	// --- L14 BB squeeze (bollinger band contraction) — wired in E3b --------
	/** Bandwidth contracted below 65% of its 20-bar prior value. */
	BB_SQUEEZE: 'event.bb.squeeze',
	/** Bandwidth contracted below 50% of its 50-bar prior value. */
	BB_BIG_SQUEEZE: 'event.bb.big_squeeze',
	/** Bandwidth expanded above 130% of its prior value after a squeeze. */
	BB_EXPANSION: 'event.bb.expansion',

	// --- L11 CVD (cumulative volume delta) — wired in E3c ------------------
	/** Price stalls while CVD accelerates: absorption by resting liquidity. */
	CVD_ABSORPTION: 'event.cvd.absorption',

	// --- L9 real-liq (force-order derived) — wired in E3d ------------------
	/** Force-order volume $> 500k$ dominated by long liquidations. */
	REAL_LIQ_LONG_CASCADE: 'event.real_liq.long_cascade',
	/** Force-order volume $> 500k$ dominated by short liquidations. */
	REAL_LIQ_SHORT_SQUEEZE: 'event.real_liq.short_squeeze'
} as const;

export type EventId = (typeof EventId)[keyof typeof EventId];

// ---------------------------------------------------------------------------
// Shared payload fields
// ---------------------------------------------------------------------------

const EventDirectionEnum = z.enum([
	EventDirection.BULL,
	EventDirection.BEAR,
	EventDirection.NEUTRAL,
	EventDirection.CONTEXT
]);

const EventSeverityEnum = z.enum([
	EventSeverity.LOW,
	EventSeverity.MEDIUM,
	EventSeverity.HIGH
]);

/**
 * Fields every event payload carries. The discriminated union below
 * extends this with event-specific `data`.
 */
const EventBaseSchema = z.object({
	direction: EventDirectionEnum,
	severity: EventSeverityEnum,
	/** Free-form one-line human explanation. Max 240 chars. */
	note: z.string().max(240).nullable()
});

// ---------------------------------------------------------------------------
// Per-event payload schemas
// ---------------------------------------------------------------------------

const FlowFrExtremeNegativeSchema = EventBaseSchema.extend({
	id: z.literal(EventId.FLOW_FR_EXTREME_NEGATIVE),
	data: z.object({
		funding_rate: z.number().finite(),
		threshold: z.number().finite()
	})
});

const FlowFrExtremePositiveSchema = EventBaseSchema.extend({
	id: z.literal(EventId.FLOW_FR_EXTREME_POSITIVE),
	data: z.object({
		funding_rate: z.number().finite(),
		threshold: z.number().finite()
	})
});

const FlowLongEntryBuildSchema = EventBaseSchema.extend({
	id: z.literal(EventId.FLOW_LONG_ENTRY_BUILD),
	data: z.object({
		oi_change_pct: z.number().finite(),
		price_change_pct: z.number().finite()
	})
});

const FlowShortEntryBuildSchema = EventBaseSchema.extend({
	id: z.literal(EventId.FLOW_SHORT_ENTRY_BUILD),
	data: z.object({
		oi_change_pct: z.number().finite(),
		price_change_pct: z.number().finite()
	})
});

const FlowShortSqueezeActiveSchema = EventBaseSchema.extend({
	id: z.literal(EventId.FLOW_SHORT_SQUEEZE_ACTIVE),
	data: z.object({
		oi_change_pct: z.number().finite(),
		price_change_pct: z.number().finite()
	})
});

const FlowLongCascadeActiveSchema = EventBaseSchema.extend({
	id: z.literal(EventId.FLOW_LONG_CASCADE_ACTIVE),
	data: z.object({
		oi_change_pct: z.number().finite(),
		price_change_pct: z.number().finite()
	})
});

const BbSqueezeSchema = EventBaseSchema.extend({
	id: z.literal(EventId.BB_SQUEEZE),
	data: z.object({
		bandwidth: z.number().finite().nonnegative(),
		bandwidth_ratio_20: z.number().finite().nonnegative()
	})
});

const BbBigSqueezeSchema = EventBaseSchema.extend({
	id: z.literal(EventId.BB_BIG_SQUEEZE),
	data: z.object({
		bandwidth: z.number().finite().nonnegative(),
		bandwidth_ratio_50: z.number().finite().nonnegative()
	})
});

const BbExpansionSchema = EventBaseSchema.extend({
	id: z.literal(EventId.BB_EXPANSION),
	data: z.object({
		bandwidth: z.number().finite().nonnegative(),
		expansion_ratio: z.number().finite().positive()
	})
});

const CvdAbsorptionSchema = EventBaseSchema.extend({
	id: z.literal(EventId.CVD_ABSORPTION),
	data: z.object({
		price_change_pct: z.number().finite(),
		cvd_trend: z.number().finite(),
		cvd_start: z.number().finite()
	})
});

const RealLiqLongCascadeSchema = EventBaseSchema.extend({
	id: z.literal(EventId.REAL_LIQ_LONG_CASCADE),
	data: z.object({
		long_liq_usd: z.number().finite().nonnegative(),
		short_liq_usd: z.number().finite().nonnegative(),
		dominance_ratio: z.number().finite().positive()
	})
});

const RealLiqShortSqueezeSchema = EventBaseSchema.extend({
	id: z.literal(EventId.REAL_LIQ_SHORT_SQUEEZE),
	data: z.object({
		long_liq_usd: z.number().finite().nonnegative(),
		short_liq_usd: z.number().finite().nonnegative(),
		dominance_ratio: z.number().finite().positive()
	})
});

// ---------------------------------------------------------------------------
// Discriminated union
// ---------------------------------------------------------------------------

/**
 * The single parser downstream code uses. Discriminated on `id` so
 * type-narrowing on the result gives you the exact `data` shape.
 */
export const EventPayloadSchema = z.discriminatedUnion('id', [
	FlowFrExtremeNegativeSchema,
	FlowFrExtremePositiveSchema,
	FlowLongEntryBuildSchema,
	FlowShortEntryBuildSchema,
	FlowShortSqueezeActiveSchema,
	FlowLongCascadeActiveSchema,
	BbSqueezeSchema,
	BbBigSqueezeSchema,
	BbExpansionSchema,
	CvdAbsorptionSchema,
	RealLiqLongCascadeSchema,
	RealLiqShortSqueezeSchema
]);

export type EventPayload = z.infer<typeof EventPayloadSchema>;

/** Parse an unknown value as an event payload. Throws on failure. */
export function parseEventPayload(input: unknown): EventPayload {
	return EventPayloadSchema.parse(input);
}

/** Safe-parse variant for conditional validation. */
export function safeParseEventPayload(input: unknown) {
	return EventPayloadSchema.safeParse(input);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Every declared `EventId` as a readonly array — handy for catalog smoke. */
export const ALL_EVENT_IDS: ReadonlyArray<EventId> = Object.freeze(
	Object.values(EventId) as ReadonlyArray<EventId>
);

/** True when the input is one of the known `EventId` strings. */
export function isEventId(input: unknown): input is EventId {
	return typeof input === 'string' && ALL_EVENT_IDS.includes(input as EventId);
}
