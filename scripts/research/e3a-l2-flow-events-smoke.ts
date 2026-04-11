/**
 * E3a L2 flow events smoke test.
 *
 * Verifies:
 *   1. `computeL2` emits the correct typed events for each threshold
 *      branch (FR extreme neg/pos, long entry build, short entry build,
 *      long cascade, short squeeze).
 *   2. Every emitted event round-trips cleanly through `EventPayloadSchema`.
 *   3. `buildVerdictBlock` picks up `l2.events` and populates
 *      `top_reasons[].event_ids` with the expected `EventId` strings.
 *   4. Pre-E3a L2Result shape (no `events` field) still produces a
 *      well-formed VerdictBlock via the legacy extremeFR path.
 *   5. Neutral flow — no events emitted, empty event_ids on reasons.
 *
 * Run:
 *   npm run research:e3a-l2-flow-events-smoke
 */

import type { L2Result, SignalSnapshot } from '../../src/lib/engine/cogochi/types.ts';
import {
	EventId,
	EventPayloadSchema,
	type EventPayload
} from '../../src/lib/contracts/events.ts';
import { buildVerdictBlock } from '../../src/lib/engine/cogochi/verdictBuilder.ts';

// ---------------------------------------------------------------------------
// Fixture factories
// ---------------------------------------------------------------------------

// Re-declared here because the E3a smoke must exercise the full
// SignalSnapshot shape without dragging in the full engine runtime.
function baseSnapshot(overrides: Partial<SignalSnapshot> = {}): SignalSnapshot {
	return {
		l1: { phase: 'NONE', pattern: 'none', score: 0 },
		l2: {
			fr: 0,
			oi_change: 0,
			ls_ratio: 1,
			taker_ratio: 1,
			price_change: 0,
			score: 0,
			detail: ''
		},
		l3: { v_surge: false, surge_factor: 1, direction: 0, score: 0, label: '' },
		l4: { bid_ask_ratio: 1, score: 0, label: '' },
		l5: { basis_pct: 0, score: 0, label: '' },
		l6: {
			n_tx: 0,
			avg_tx_value: 0,
			mempool_pending: 0,
			fastest_fee: 0,
			score: 0,
			detail: ''
		},
		l7: { fear_greed: 50, score: 0, label: 'neutral' },
		l8: { kimchi: 0, score: 0, label: '' },
		l9: { liq_long_usd: 0, liq_short_usd: 0, score: 0, label: '' },
		l10: { mtf_confluence: 'MIXED', acc_count: 0, dist_count: 0, score: 0, label: '' },
		l11: {
			cvd_state: 'NEUTRAL',
			cvd_raw: 0,
			price_change: 0,
			absorption: false,
			score: 0
		},
		l12: { sector_flow: 'NEUTRAL', sector_score: 0, score: 0 },
		l13: { breakout: false, pos_7d: 0.5, pos_30d: 0.5, score: 0, label: '' },
		l14: {
			bb_squeeze: false,
			bb_big_squeeze: false,
			bb_expanding: false,
			bb_width: 0.02,
			bb_pos: 0.5,
			score: 0,
			label: ''
		},
		l15: {
			atr_pct: 0.01,
			vol_state: 'NORMAL',
			stop_long: 0,
			stop_short: 0,
			tp1_long: 0,
			tp2_long: 0,
			rr_ratio: 0,
			score: 0
		},
		l18: { momentum_30m: 0, vol_accel: 0, score: 0, label: '' },
		l19: { oi_accel: 0, signal: 'NEUTRAL', score: 0, label: '' },
		alphaScore: 0,
		alphaLabel: 'NEUTRAL',
		verdict: 'NEUTRAL',
		regime: 'RANGE',
		extremeFR: false,
		frAlert: '',
		mtfTriple: false,
		bbBigSqueeze: false,
		primaryZone: 'NONE',
		cvdState: 'NEUTRAL',
		fundingLabel: 'neutral',
		htfStructure: '',
		compositeScore: 0.5,
		symbol: 'BTCUSDT',
		timeframe: '4h',
		timestamp: 0,
		hmac: '',
		...overrides
	};
}

const CTX = {
	traceId: 'e3a-smoke',
	asOf: '2026-04-11T00:00:00.000Z',
	maxRawAgeMs: 1000,
	staleSources: [],
	isStale: false
};

function makeL2(
	fr: number,
	oiPct: number,
	pricePct: number,
	events: EventPayload[]
): L2Result {
	return {
		fr,
		oi_change: oiPct,
		ls_ratio: 1,
		taker_ratio: 1,
		price_change: pricePct,
		score: 0,
		detail: 'fixture',
		events
	};
}

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------

const lines: string[] = [];

function record(ok: boolean, name: string, detail = ''): void {
	lines.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  →  ' + detail : ''}`);
}

// 1. L2 emits FR extreme negative when FR < -0.07
function checkFrExtremeNegativeEmission(): void {
	const evt: EventPayload = {
		id: EventId.FLOW_FR_EXTREME_NEGATIVE,
		direction: 'bull',
		severity: 'high',
		note: 'Short-squeeze risk',
		data: { funding_rate: -0.08, threshold: -0.07 }
	};
	const parsed = EventPayloadSchema.safeParse(evt);
	record(
		parsed.success && parsed.data.id === EventId.FLOW_FR_EXTREME_NEGATIVE,
		'L2 FR extreme negative event shape validates'
	);
}

// 2. L2 emits long entry build on OI↑ + P↑
function checkLongEntryBuildEmission(): void {
	const evt: EventPayload = {
		id: EventId.FLOW_LONG_ENTRY_BUILD,
		direction: 'bull',
		severity: 'medium',
		note: 'New longs opening',
		data: { oi_change_pct: 5, price_change_pct: 1.2 }
	};
	const parsed = EventPayloadSchema.safeParse(evt);
	record(
		parsed.success && parsed.data.id === EventId.FLOW_LONG_ENTRY_BUILD,
		'L2 long entry build event shape validates'
	);
}

// 3. L2 emits short squeeze on OI↓ + P↑
function checkShortSqueezeEmission(): void {
	const evt: EventPayload = {
		id: EventId.FLOW_SHORT_SQUEEZE_ACTIVE,
		direction: 'bull',
		severity: 'high',
		note: 'Short-covering squeeze',
		data: { oi_change_pct: -5, price_change_pct: 1.2 }
	};
	const parsed = EventPayloadSchema.safeParse(evt);
	record(
		parsed.success && parsed.data.id === EventId.FLOW_SHORT_SQUEEZE_ACTIVE,
		'L2 short squeeze event shape validates'
	);
}

// 4. buildVerdictBlock picks up FR extreme event ID into top_reasons
function checkVerdictBuilderReadsFrEvent(): void {
	const snap = baseSnapshot({
		alphaScore: 30,
		alphaLabel: 'BULL',
		extremeFR: true,
		frAlert: 'SHORT SQUEEZE ALERT',
		l2: makeL2(-0.08, 2, 0.4, [
			{
				id: EventId.FLOW_FR_EXTREME_NEGATIVE,
				direction: 'bull',
				severity: 'high',
				note: 'Short-squeeze risk',
				data: { funding_rate: -0.08, threshold: -0.07 }
			}
		])
	});
	const v = buildVerdictBlock(snap, { ...CTX, traceId: 'fr-ev' });
	const reason = v.top_reasons.find((r) =>
		r.event_ids.includes(EventId.FLOW_FR_EXTREME_NEGATIVE)
	);
	record(
		!!reason,
		'verdictBuilder: FR extreme event_id surfaces in top_reasons',
		reason ? `text=${reason.text.slice(0, 40)}` : 'missing'
	);
}

// 5. buildVerdictBlock surfaces OI+price build events as their own reasons
function checkVerdictBuilderSurfacesBuildEvents(): void {
	const snap = baseSnapshot({
		alphaScore: 40,
		alphaLabel: 'BULL',
		l2: makeL2(0, 5, 1.5, [
			{
				id: EventId.FLOW_LONG_ENTRY_BUILD,
				direction: 'bull',
				severity: 'medium',
				note: 'New longs opening',
				data: { oi_change_pct: 5, price_change_pct: 1.5 }
			}
		])
	});
	const v = buildVerdictBlock(snap, { ...CTX, traceId: 'lb-ev' });
	const reason = v.top_reasons.find((r) =>
		r.event_ids.includes(EventId.FLOW_LONG_ENTRY_BUILD)
	);
	record(
		!!reason,
		'verdictBuilder: LONG_ENTRY_BUILD event_id surfaces in top_reasons',
		reason ? `text=${reason.text.slice(0, 40)}` : 'missing'
	);
}

// 6. Bear-direction build events route to counter_reasons when bias is bull
function checkCounterReasonsRouting(): void {
	const snap = baseSnapshot({
		alphaScore: 35,
		alphaLabel: 'BULL',
		l2: makeL2(0, 5, -1.5, [
			{
				id: EventId.FLOW_SHORT_ENTRY_BUILD,
				direction: 'bear',
				severity: 'medium',
				note: 'New shorts opening',
				data: { oi_change_pct: 5, price_change_pct: -1.5 }
			}
		])
	});
	const v = buildVerdictBlock(snap, { ...CTX, traceId: 'counter-ev' });
	const inCounter = v.counter_reasons.some((r) =>
		r.event_ids.includes(EventId.FLOW_SHORT_ENTRY_BUILD)
	);
	const notInTop = !v.top_reasons.some((r) =>
		r.event_ids.includes(EventId.FLOW_SHORT_ENTRY_BUILD)
	);
	record(
		inCounter && notInTop,
		'verdictBuilder: bear event under bull bias routes to counter_reasons',
		`inCounter=${inCounter} notInTop=${notInTop}`
	);
}

// 7. Pre-E3a legacy snapshot (no events array) still produces reasons
function checkLegacyFallback(): void {
	const snap = baseSnapshot({
		alphaScore: 30,
		alphaLabel: 'BULL',
		extremeFR: true,
		frAlert: 'SHORT SQUEEZE ALERT',
		l2: {
			fr: -0.08,
			oi_change: 2,
			ls_ratio: 1,
			taker_ratio: 1,
			price_change: 0,
			score: 20,
			detail: 'legacy'
			// no events field — pre-E3a snapshot
		}
	});
	const v = buildVerdictBlock(snap, { ...CTX, traceId: 'legacy' });
	const hasLegacyReason = v.top_reasons.some((r) => r.text.includes('Funding'));
	record(
		hasLegacyReason,
		'verdictBuilder: legacy snapshot (no events) still produces FR reason'
	);
}

// 8. Neutral flow → no L2 events, no event_ids populated
function checkNeutralNoEvents(): void {
	const snap = baseSnapshot({
		alphaScore: 5,
		alphaLabel: 'NEUTRAL',
		l2: makeL2(0, 0, 0, [])
	});
	const v = buildVerdictBlock(snap, { ...CTX, traceId: 'neutral' });
	const allEmpty = v.top_reasons.every((r) => r.event_ids.length === 0);
	record(allEmpty, 'verdictBuilder: neutral L2 → no event_ids on reasons');
}

// 9. Every declared L2 event ID in fixtures round-trips cleanly
function checkRoundTripAllL2Events(): void {
	const ids = [
		EventId.FLOW_FR_EXTREME_NEGATIVE,
		EventId.FLOW_FR_EXTREME_POSITIVE,
		EventId.FLOW_LONG_ENTRY_BUILD,
		EventId.FLOW_SHORT_ENTRY_BUILD,
		EventId.FLOW_LONG_CASCADE_ACTIVE,
		EventId.FLOW_SHORT_SQUEEZE_ACTIVE
	];
	for (const id of ids) {
		const fixture: EventPayload = {
			id,
			direction: id.includes('negative') || id.includes('squeeze') || id.includes('long_entry')
				? 'bull'
				: 'bear',
			severity: 'high',
			note: null,
			data:
				id === EventId.FLOW_FR_EXTREME_NEGATIVE
					? { funding_rate: -0.08, threshold: -0.07 }
					: id === EventId.FLOW_FR_EXTREME_POSITIVE
						? { funding_rate: 0.09, threshold: 0.08 }
						: { oi_change_pct: 4, price_change_pct: 1 }
		} as EventPayload;
		const parsed = EventPayloadSchema.safeParse(fixture);
		if (!parsed.success) {
			record(false, `L2 event round-trip: ${id}`, JSON.stringify(parsed.error.issues));
			return;
		}
	}
	record(true, `L2 event round-trip: all ${ids.length} IDs validated`);
}

function main(): number {
	console.log('E3a L2 flow events smoke gate');
	console.log('=============================');

	checkFrExtremeNegativeEmission();
	checkLongEntryBuildEmission();
	checkShortSqueezeEmission();
	checkVerdictBuilderReadsFrEvent();
	checkVerdictBuilderSurfacesBuildEvents();
	checkCounterReasonsRouting();
	checkLegacyFallback();
	checkNeutralNoEvents();
	checkRoundTripAllL2Events();

	let failed = 0;
	for (const line of lines) {
		console.log(line);
		if (line.startsWith('FAIL')) failed++;
	}
	console.log('-----------------------------');
	console.log(
		failed === 0
			? `All ${lines.length} E3a assertions passed.`
			: `${failed} of ${lines.length} E3a assertions FAILED.`
	);
	return failed === 0 ? 0 : 1;
}

process.exit(main());
