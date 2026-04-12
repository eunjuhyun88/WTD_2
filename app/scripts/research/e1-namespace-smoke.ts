/**
 * E1 event/feature namespace smoke test.
 *
 * Verifies the new `contracts/events.ts` and `contracts/features.ts`
 * registries:
 *   1. Every declared `EventId` has a valid payload schema (round-trip
 *      parse of a minimal fixture).
 *   2. Every declared `FeatureId` has a valid value schema.
 *   3. `EventPayloadSchema.safeParse` rejects unknown IDs and malformed
 *      payloads with typed errors.
 *   4. `FeatureValueSchema` rejects mismatched value types.
 *   5. `isEventId` / `isFeatureId` return true/false correctly.
 *
 * Run:
 *   npm run research:e1-namespace-smoke
 */

import {
	EventId,
	EventPayloadSchema,
	ALL_EVENT_IDS,
	isEventId,
	parseEventPayload,
	safeParseEventPayload
} from '../../src/lib/contracts/events.ts';
import {
	FeatureId,
	FeatureValueSchema,
	ALL_FEATURE_IDS,
	isFeatureId,
	parseFeatureValue,
	safeParseFeatureValue
} from '../../src/lib/contracts/features.ts';
import { EventDirection, EventSeverity } from '../../src/lib/contracts/ids.ts';

// ---------------------------------------------------------------------------
// Fixture factory — minimal valid payload per declared event ID.
// ---------------------------------------------------------------------------

function fixtureForEvent(id: (typeof EventId)[keyof typeof EventId]): unknown {
	const base = {
		id,
		direction: EventDirection.NEUTRAL,
		severity: EventSeverity.LOW,
		note: null
	};
	switch (id) {
		case EventId.FLOW_FR_EXTREME_NEGATIVE:
			return { ...base, data: { funding_rate: -0.08, threshold: -0.07 } };
		case EventId.FLOW_FR_EXTREME_POSITIVE:
			return { ...base, data: { funding_rate: 0.09, threshold: 0.08 } };
		case EventId.FLOW_LONG_ENTRY_BUILD:
		case EventId.FLOW_SHORT_ENTRY_BUILD:
		case EventId.FLOW_SHORT_SQUEEZE_ACTIVE:
		case EventId.FLOW_LONG_CASCADE_ACTIVE:
			return { ...base, data: { oi_change_pct: 3.5, price_change_pct: 1.2 } };
		case EventId.BB_SQUEEZE:
			return { ...base, data: { bandwidth: 0.01, bandwidth_ratio_20: 0.62 } };
		case EventId.BB_BIG_SQUEEZE:
			return { ...base, data: { bandwidth: 0.008, bandwidth_ratio_50: 0.45 } };
		case EventId.BB_EXPANSION:
			return { ...base, data: { bandwidth: 0.04, expansion_ratio: 1.35 } };
		case EventId.CVD_ABSORPTION:
			return {
				...base,
				data: { price_change_pct: 0.004, cvd_trend: 120, cvd_start: 300 }
			};
		case EventId.REAL_LIQ_LONG_CASCADE:
		case EventId.REAL_LIQ_SHORT_SQUEEZE:
			return {
				...base,
				data: { long_liq_usd: 600_000, short_liq_usd: 200_000, dominance_ratio: 3 }
			};
		default: {
			// Exhaustiveness check — the switch must cover every declared ID.
			const _never: never = id;
			void _never;
			throw new Error(`no fixture for unknown event id: ${String(id)}`);
		}
	}
}

function fixtureForFeature(id: (typeof FeatureId)[keyof typeof FeatureId]): unknown {
	switch (id) {
		case FeatureId.FLOW_FR_REGIME:
			return { id, value: 'neutral' };
		case FeatureId.FLOW_LONG_SHORT_REGIME:
			return { id, value: 'balanced' };
		case FeatureId.FLOW_TAKER_REGIME:
			return { id, value: 'balanced' };
		case FeatureId.FLOW_OI_CHANGE_PCT:
			return { id, value: 2.5 };
		case FeatureId.VOL_BB_BANDWIDTH:
			return { id, value: 0.015 };
		case FeatureId.VOL_BB_POSITION:
			return { id, value: 0.5 };
		case FeatureId.VOL_ATR_PCT:
			return { id, value: 0.012 };
		default: {
			const _never: never = id;
			void _never;
			throw new Error(`no fixture for unknown feature id: ${String(id)}`);
		}
	}
}

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------

const lines: string[] = [];

function record(ok: boolean, name: string, detail = ''): void {
	lines.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  →  ' + detail : ''}`);
}

// 1. Round-trip every event ID through its schema.
function checkEventRoundTrip(): void {
	let pass = 0;
	for (const id of ALL_EVENT_IDS) {
		try {
			const fixture = fixtureForEvent(id);
			const parsed = parseEventPayload(fixture);
			if (parsed.id !== id) {
				record(false, `event round-trip: ${id}`, `got ${parsed.id}`);
				return;
			}
			pass += 1;
		} catch (err) {
			record(false, `event round-trip: ${id}`, (err as Error).message);
			return;
		}
	}
	record(
		pass === ALL_EVENT_IDS.length,
		`event round-trip: all ${ALL_EVENT_IDS.length} ids parse cleanly`,
		`pass=${pass}`
	);
}

// 2. Round-trip every feature ID through its schema.
function checkFeatureRoundTrip(): void {
	let pass = 0;
	for (const id of ALL_FEATURE_IDS) {
		try {
			const fixture = fixtureForFeature(id);
			const parsed = parseFeatureValue(fixture);
			if (parsed.id !== id) {
				record(false, `feature round-trip: ${id}`, `got ${parsed.id}`);
				return;
			}
			pass += 1;
		} catch (err) {
			record(false, `feature round-trip: ${id}`, (err as Error).message);
			return;
		}
	}
	record(
		pass === ALL_FEATURE_IDS.length,
		`feature round-trip: all ${ALL_FEATURE_IDS.length} ids parse cleanly`,
		`pass=${pass}`
	);
}

// 3. Reject an unknown event ID.
function checkUnknownEventRejected(): void {
	const result = safeParseEventPayload({
		id: 'event.bogus.does_not_exist',
		direction: 'bull',
		severity: 'low',
		note: null,
		data: {}
	});
	record(
		!result.success,
		'event: unknown id rejected',
		result.success ? 'accepted (wrong)' : 'rejected'
	);
}

// 4. Reject mismatched event data shape.
function checkMismatchedEventDataRejected(): void {
	const result = safeParseEventPayload({
		id: EventId.FLOW_FR_EXTREME_NEGATIVE,
		direction: 'bear',
		severity: 'high',
		note: null,
		data: { something_else: true }
	});
	record(
		!result.success,
		'event: mismatched data rejected',
		result.success ? 'accepted (wrong)' : 'rejected'
	);
}

// 5. Reject mismatched feature value.
function checkMismatchedFeatureValueRejected(): void {
	const result = safeParseFeatureValue({
		id: FeatureId.FLOW_FR_REGIME,
		value: 42 // regime is an enum, not a number
	});
	record(
		!result.success,
		'feature: wrong value type rejected',
		result.success ? 'accepted (wrong)' : 'rejected'
	);
}

// 6. isEventId / isFeatureId behavior.
function checkIsGuards(): void {
	const posEvt = isEventId(EventId.BB_SQUEEZE);
	const negEvt = isEventId('event.not.real');
	const posFeat = isFeatureId(FeatureId.VOL_BB_BANDWIDTH);
	const negFeat = isFeatureId('feat.not.real');
	record(
		posEvt && !negEvt && posFeat && !negFeat,
		'type guards',
		`posEvt=${posEvt} negEvt=${negEvt} posFeat=${posFeat} negFeat=${negFeat}`
	);
}

// 7. Every declared EventId is present in the discriminated union.
function checkDiscriminatedUnionCoverage(): void {
	const unionMembers = new Set<string>();
	for (const id of ALL_EVENT_IDS) {
		const fixture = fixtureForEvent(id);
		const result = EventPayloadSchema.safeParse(fixture);
		if (!result.success) {
			record(false, 'event union coverage', `missing schema for ${id}`);
			return;
		}
		unionMembers.add(result.data.id);
	}
	record(
		unionMembers.size === ALL_EVENT_IDS.length,
		'event union coverage',
		`union members=${unionMembers.size}, ids=${ALL_EVENT_IDS.length}`
	);
}

function main(): number {
	console.log('E1 event + feature namespace smoke gate');
	console.log('=======================================');

	checkEventRoundTrip();
	checkFeatureRoundTrip();
	checkUnknownEventRejected();
	checkMismatchedEventDataRejected();
	checkMismatchedFeatureValueRejected();
	checkIsGuards();
	checkDiscriminatedUnionCoverage();

	let failed = 0;
	for (const line of lines) {
		console.log(line);
		if (line.startsWith('FAIL')) failed++;
	}
	console.log('---------------------------------------');
	console.log(
		failed === 0
			? `All ${lines.length} E1 assertions passed.`
			: `${failed} of ${lines.length} E1 assertions FAILED.`
	);
	return failed === 0 ? 0 : 1;
}

process.exit(main());
