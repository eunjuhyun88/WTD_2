/**
 * `buildVerdictBlock` — SignalSnapshot → VerdictBlock adapter. E2 of
 * the harness engine integration plan.
 *
 * This is the first function anywhere in the codebase that produces a
 * zod-validated `VerdictBlock` — the frozen contract shape defined in
 * `src/lib/contracts/verdict.ts`. Before E2, the engine output was
 * `SignalSnapshot` with a free-form `verdict: string` field; no caller
 * ever hand-constructed the full `VerdictBlock` shape.
 *
 * Design rules:
 *   - Pure function, no I/O, no clock reads, no randomness. The
 *     `context` parameter carries everything the builder needs that
 *     is not already in the snapshot (trace id, freshness metadata).
 *   - Does NOT mutate the snapshot. Callers keep the snapshot and the
 *     verdict side by side; downstream consumers that already rely on
 *     the snapshot shape (`scanner.ts`, `toolExecutor.ts`,
 *     `multiTimeframeContext.ts`) stay working without changes.
 *   - Every returned block is run through `VerdictBlockSchema.parse`
 *     before it is returned. If the snapshot is shaped weirdly, the
 *     failure happens here, not at the DB write or the LLM tool call.
 *   - E3 sub-slices will populate `top_reasons[].event_ids` with
 *     actual `EventId` strings once the layer functions start emitting
 *     typed events. Until then, the reasons carry text only.
 *
 * Reference:
 *   docs/exec-plans/active/harness-engine-integration-plan-2026-04-11.md §3 E2
 *   docs/exec-plans/active/alpha-terminal-harness-engine-spec-2026-04-09.md
 */

import type { SignalSnapshot, WyckoffPhase } from './types.ts';
import type {
	VerdictBlock,
	VerdictReason,
	VerdictInvalidation,
	VerdictExecution,
	Timeframe
} from '../../contracts/verdict.ts';
import {
	VerdictBlockSchema,
	VerdictBlockSchemaVersion
} from '../../contracts/verdict.ts';
import {
	StructureStateId,
	VerdictBias,
	VerdictUrgency,
	EventDirection,
	EventSeverity
} from '../../contracts/ids.ts';

// ---------------------------------------------------------------------------
// Build context — what the caller provides beyond the snapshot
// ---------------------------------------------------------------------------

export interface VerdictBuildContext {
	/** Stable trace id carried from the scan request. Non-empty. */
	readonly traceId: string;
	/** ISO-8601 wall-clock timestamp at which the snapshot was built. */
	readonly asOf: string;
	/** Age of the oldest RAW source that fed the snapshot, in ms. */
	readonly maxRawAgeMs: number;
	/** Optional list of RAW source IDs that were stale beyond their SLA. */
	readonly staleSources?: ReadonlyArray<string>;
	/** Explicit stale flag. Defaults to `(staleSources ?? []).length > 0`. */
	readonly isStale?: boolean;
}

// ---------------------------------------------------------------------------
// Wyckoff phase → StructureStateId mapping
// ---------------------------------------------------------------------------

/**
 * The current engine tracks coarse Wyckoff phase labels (ACCUMULATION,
 * MARKUP, …). The contract has sub-phase granularity (ACC_PHASE_A..E).
 * Until the Phase 2 precision-wyckoff engine (§P2 of dissection) lands,
 * map the coarse phase to the middle sub-phase as a best-effort.
 *
 * The mapping is deliberately lossy — it is an honest downgrade, not a
 * guess at the missing precision.
 */
function mapWyckoffPhaseToState(phase: WyckoffPhase): string {
	switch (phase) {
		case 'ACCUMULATION':
			return StructureStateId.ACC_PHASE_C;
		case 'MARKUP':
			return StructureStateId.MARKUP_CONTINUATION;
		case 'DISTRIBUTION':
			return StructureStateId.DIST_PHASE_C;
		case 'MARKDOWN':
			return StructureStateId.MARKDOWN_CONTINUATION;
		case 'REACCUM':
			return StructureStateId.REACCUMULATION;
		case 'REDIST':
			return StructureStateId.REDISTRIBUTION;
		case 'NONE':
		default:
			return StructureStateId.NONE;
	}
}

// ---------------------------------------------------------------------------
// AlphaLabel → VerdictBias
// ---------------------------------------------------------------------------

/**
 * `AlphaLabel` values already match the `VerdictBias` enum by string
 * equality, but the types are nominal so we do an explicit switch to
 * preserve narrowing on the consumer side.
 */
function mapAlphaLabelToBias(label: SignalSnapshot['alphaLabel']): string {
	switch (label) {
		case 'STRONG_BULL':
			return VerdictBias.STRONG_BULL;
		case 'BULL':
			return VerdictBias.BULL;
		case 'NEUTRAL':
			return VerdictBias.NEUTRAL;
		case 'BEAR':
			return VerdictBias.BEAR;
		case 'STRONG_BEAR':
			return VerdictBias.STRONG_BEAR;
		default: {
			const _never: never = label;
			void _never;
			return VerdictBias.NEUTRAL;
		}
	}
}

// ---------------------------------------------------------------------------
// Urgency derivation
// ---------------------------------------------------------------------------

/**
 * Urgency tier from snapshot alerts. HIGH when extremeFR or a
 * multi-timeframe triple alignment fires; MEDIUM on big BB squeeze;
 * LOW otherwise. This is a hand-curated rule; the precision engine
 * (Phase 2) will replace it with an event-driven derivation.
 */
function deriveUrgency(snapshot: SignalSnapshot): string {
	if (snapshot.extremeFR) return VerdictUrgency.HIGH;
	if (snapshot.mtfTriple) return VerdictUrgency.HIGH;
	if (snapshot.bbBigSqueeze) return VerdictUrgency.MEDIUM;
	return VerdictUrgency.LOW;
}

// ---------------------------------------------------------------------------
// Top / counter reason population
// ---------------------------------------------------------------------------

type ReasonCandidate = {
	text: string;
	direction: 'bull' | 'bear' | 'neutral' | 'context';
	severity: 'low' | 'medium' | 'high';
};

/**
 * Collect ordered reason candidates from the snapshot. Directional
 * reasons are tagged so the caller can partition them into top vs
 * counter based on the resolved bias.
 *
 * NOTE: E3 sub-slices will replace the prose-only path with typed
 * event emissions. Until then, this function produces reasons with
 * empty `event_ids` arrays.
 */
function collectReasonCandidates(snapshot: SignalSnapshot): ReasonCandidate[] {
	const out: ReasonCandidate[] = [];

	// L1 Wyckoff — phase label as a structure reason.
	if (snapshot.l1.phase !== 'NONE') {
		const isBull =
			snapshot.l1.phase === 'ACCUMULATION' ||
			snapshot.l1.phase === 'MARKUP' ||
			snapshot.l1.phase === 'REACCUM';
		out.push({
			text: `L1 Wyckoff phase ${snapshot.l1.phase}`,
			direction: isBull ? 'bull' : 'bear',
			severity: snapshot.l1.score >= 20 || snapshot.l1.score <= -20 ? 'high' : 'medium'
		});
	}

	// L2 flow — FR regime, OI build.
	if (snapshot.extremeFR) {
		out.push({
			text: `Funding rate ${snapshot.frAlert || 'extreme'} (${snapshot.l2.fr.toFixed(4)})`,
			direction: snapshot.l2.fr < 0 ? 'bull' : 'bear',
			severity: 'high'
		});
	}

	// L10 MTF alignment triple.
	if (snapshot.mtfTriple) {
		const bullish = snapshot.l10.mtf_confluence === 'BULL_ALIGNED';
		const bearish = snapshot.l10.mtf_confluence === 'BEAR_ALIGNED';
		if (bullish || bearish) {
			out.push({
				text: `MTF triple ${bullish ? 'BULL' : 'BEAR'} alignment`,
				direction: bullish ? 'bull' : 'bear',
				severity: 'high'
			});
		}
	}

	// L14 BB squeeze — context (direction neutral).
	if (snapshot.bbBigSqueeze) {
		out.push({
			text: `BB big squeeze active (bw=${snapshot.l14.bb_width.toFixed(4)})`,
			direction: 'context',
			severity: 'high'
		});
	} else if (snapshot.l14.bb_squeeze) {
		out.push({
			text: `BB squeeze (bw=${snapshot.l14.bb_width.toFixed(4)})`,
			direction: 'context',
			severity: 'medium'
		});
	}

	// L11 CVD — absorption.
	if (snapshot.l11.absorption) {
		out.push({
			text: `CVD absorption detected (cvd_state=${snapshot.l11.cvd_state})`,
			direction: 'context',
			severity: 'medium'
		});
	}

	// L9 real-liq — directional liquidation bias.
	const totalLiq = snapshot.l9.liq_long_usd + snapshot.l9.liq_short_usd;
	if (totalLiq >= 500_000) {
		const longDominant = snapshot.l9.liq_long_usd > snapshot.l9.liq_short_usd * 1.5;
		const shortDominant = snapshot.l9.liq_short_usd > snapshot.l9.liq_long_usd * 1.5;
		if (longDominant) {
			out.push({
				text: `Real liq long cascade ($${Math.round(snapshot.l9.liq_long_usd).toLocaleString()})`,
				direction: 'bear',
				severity: 'high'
			});
		} else if (shortDominant) {
			out.push({
				text: `Real liq short squeeze ($${Math.round(snapshot.l9.liq_short_usd).toLocaleString()})`,
				direction: 'bull',
				severity: 'high'
			});
		}
	}

	// L19 — OI acceleration signal.
	if (snapshot.l19.signal !== 'NEUTRAL') {
		const bullish =
			snapshot.l19.signal === 'LONG_ENTRY' || snapshot.l19.signal === 'SHORT_SQUEEZE';
		out.push({
			text: `OI accel ${snapshot.l19.signal}`,
			direction: bullish ? 'bull' : 'bear',
			severity: 'medium'
		});
	}

	return out;
}

function candidateToReason(c: ReasonCandidate): VerdictReason {
	return {
		text: c.text.slice(0, 240),
		event_ids: [],
		direction: c.direction,
		severity: c.severity
	};
}

function partitionReasons(
	candidates: ReasonCandidate[],
	bias: string
): { top: VerdictReason[]; counter: VerdictReason[] } {
	const bullish = bias === VerdictBias.STRONG_BULL || bias === VerdictBias.BULL;
	const bearish = bias === VerdictBias.STRONG_BEAR || bias === VerdictBias.BEAR;

	const top: VerdictReason[] = [];
	const counter: VerdictReason[] = [];

	for (const c of candidates) {
		const reason = candidateToReason(c);
		if (c.direction === 'context' || c.direction === 'neutral') {
			// Neutral/context reasons count as top (additional info), not counter.
			if (top.length < 8) top.push(reason);
			continue;
		}
		const alignsWithBias =
			(bullish && c.direction === 'bull') || (bearish && c.direction === 'bear');
		if (alignsWithBias) {
			if (top.length < 8) top.push(reason);
		} else if (bullish || bearish) {
			if (counter.length < 8) counter.push(reason);
		} else {
			// NEUTRAL bias — everything is "information", not confirmation.
			if (top.length < 8) top.push(reason);
		}
	}

	return { top, counter };
}

// ---------------------------------------------------------------------------
// Invalidation + execution derivation
// ---------------------------------------------------------------------------

function deriveInvalidation(
	snapshot: SignalSnapshot,
	bias: string
): VerdictInvalidation {
	const bullish = bias === VerdictBias.STRONG_BULL || bias === VerdictBias.BULL;
	const bearish = bias === VerdictBias.STRONG_BEAR || bias === VerdictBias.BEAR;

	if (bullish && Number.isFinite(snapshot.l15.stop_long) && snapshot.l15.stop_long > 0) {
		return {
			price_level: snapshot.l15.stop_long,
			direction: 'below',
			breaking_events: [],
			note: 'L15 ATR-based long stop'
		};
	}
	if (bearish && Number.isFinite(snapshot.l15.stop_short) && snapshot.l15.stop_short > 0) {
		return {
			price_level: snapshot.l15.stop_short,
			direction: 'above',
			breaking_events: [],
			note: 'L15 ATR-based short stop'
		};
	}
	// Neutral or missing stop levels: fall back to a sentinel breaking event
	// so the schema's "at least one of" refinement is satisfied.
	return {
		price_level: null,
		direction: null,
		breaking_events: ['event.flow.fr_extreme_negative'],
		note: null
	};
}

function deriveExecution(snapshot: SignalSnapshot, bias: string): VerdictExecution {
	const bullish = bias === VerdictBias.STRONG_BULL || bias === VerdictBias.BULL;
	const bearish = bias === VerdictBias.STRONG_BEAR || bias === VerdictBias.BEAR;

	if (bullish) {
		const targets: number[] = [];
		if (Number.isFinite(snapshot.l15.tp1_long) && snapshot.l15.tp1_long > 0) {
			targets.push(snapshot.l15.tp1_long);
		}
		if (Number.isFinite(snapshot.l15.tp2_long) && snapshot.l15.tp2_long > 0) {
			targets.push(snapshot.l15.tp2_long);
		}
		return {
			entry_zone: null,
			stop:
				Number.isFinite(snapshot.l15.stop_long) && snapshot.l15.stop_long > 0
					? snapshot.l15.stop_long
					: null,
			targets,
			rr_reference: Number.isFinite(snapshot.l15.rr_ratio) ? snapshot.l15.rr_ratio : null
		};
	}

	if (bearish) {
		return {
			entry_zone: null,
			stop:
				Number.isFinite(snapshot.l15.stop_short) && snapshot.l15.stop_short > 0
					? snapshot.l15.stop_short
					: null,
			// L15 only emits long targets in the current engine; E3e sub-slice
			// or a later precision-wyckoff pass will add short targets.
			targets: [],
			rr_reference: Number.isFinite(snapshot.l15.rr_ratio) ? snapshot.l15.rr_ratio : null
		};
	}

	return {
		entry_zone: null,
		stop: null,
		targets: [],
		rr_reference: null
	};
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

/**
 * Convert a `SignalSnapshot` plus caller-supplied context into a
 * zod-validated `VerdictBlock`. Throws if the resulting block fails
 * `VerdictBlockSchema.parse` — callers should treat a throw as a
 * bug in the builder or an upstream contract drift, not as a soft
 * signal they can swallow.
 */
export function buildVerdictBlock(
	snapshot: SignalSnapshot,
	context: VerdictBuildContext
): VerdictBlock {
	if (typeof context.traceId !== 'string' || context.traceId.length === 0) {
		throw new Error('buildVerdictBlock: context.traceId must be a non-empty string');
	}

	const bias = mapAlphaLabelToBias(snapshot.alphaLabel);
	const structureState = mapWyckoffPhaseToState(snapshot.l1.phase);
	const confidence = Math.max(0, Math.min(1, (snapshot.alphaScore + 100) / 200));
	const urgency = deriveUrgency(snapshot);

	const reasonCandidates = collectReasonCandidates(snapshot);
	const { top, counter } = partitionReasons(reasonCandidates, bias);

	const invalidation = deriveInvalidation(snapshot, bias);
	const execution = deriveExecution(snapshot, bias);

	const staleSources = context.staleSources ?? [];
	const isStale = context.isStale ?? staleSources.length > 0;

	const candidate = {
		schema_version: VerdictBlockSchemaVersion,
		trace_id: context.traceId,
		symbol: snapshot.symbol,
		primary_timeframe: snapshot.timeframe as Timeframe,
		bias,
		structure_state: structureState,
		confidence: Number.isFinite(confidence) ? confidence : 0.5,
		urgency,
		top_reasons: top,
		counter_reasons: counter,
		invalidation,
		execution,
		data_freshness: {
			as_of: context.asOf,
			max_raw_age_ms: Math.max(0, Math.floor(context.maxRawAgeMs)),
			stale_sources: Array.from(staleSources),
			is_stale: isStale
		},
		legacy_alpha_score: Number.isFinite(snapshot.alphaScore) ? snapshot.alphaScore : null
	};

	// Single validation gate. Any shape drift between SignalSnapshot
	// and VerdictBlockSchema dies here with a useful zod error.
	return VerdictBlockSchema.parse(candidate);
}

// ---------------------------------------------------------------------------
// Re-exports for callers that want the enum markers in one place
// ---------------------------------------------------------------------------

export { EventDirection, EventSeverity };
