/**
 * E3d L9 real-liq events smoke test.
 *
 * Verifies:
 *   1. Event shape validates for REAL_LIQ_LONG_CASCADE
 *   2. Event shape validates for REAL_LIQ_SHORT_SQUEEZE
 *   3. buildVerdictBlock surfaces long-cascade event_id in
 *      counter_reasons under bull bias
 *   4. buildVerdictBlock surfaces long-cascade event_id in
 *      top_reasons under bear bias
 *   5. buildVerdictBlock surfaces short-squeeze event_id in
 *      top_reasons under bull bias
 *   6. Pre-E3d legacy snapshot (no events, just liq USD totals)
 *      still produces the legacy prose reason
 *   7. No liquidation → no event_ids populated anywhere
 *
 * Run:
 *   npm run research:e3d-l9-real-liq-events-smoke
 */

import type { SignalSnapshot, L9Result } from '../../src/lib/engine/cogochi/types.ts';
import {
	EventId,
	EventPayloadSchema,
	type EventPayload
} from '../../src/lib/contracts/events.ts';
import { buildVerdictBlock } from '../../src/lib/engine/cogochi/verdictBuilder.ts';

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------

const lines: string[] = [];

function record(ok: boolean, name: string, detail = ''): void {
	lines.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  →  ' + detail : ''}`);
}

function makeLongCascadeEvent(): EventPayload {
	return {
		id: EventId.REAL_LIQ_LONG_CASCADE,
		direction: 'bear',
		severity: 'high',
		note: 'Long cascade',
		data: { long_liq_usd: 800_000, short_liq_usd: 200_000, dominance_ratio: 4 }
	};
}

function makeShortSqueezeEvent(): EventPayload {
	return {
		id: EventId.REAL_LIQ_SHORT_SQUEEZE,
		direction: 'bull',
		severity: 'high',
		note: 'Short squeeze',
		data: { long_liq_usd: 150_000, short_liq_usd: 700_000, dominance_ratio: 4.7 }
	};
}

function checkLongCascadeShape(): void {
	const parsed = EventPayloadSchema.safeParse(makeLongCascadeEvent());
	record(parsed.success, 'REAL_LIQ_LONG_CASCADE event shape validates');
}

function checkShortSqueezeShape(): void {
	const parsed = EventPayloadSchema.safeParse(makeShortSqueezeEvent());
	record(parsed.success, 'REAL_LIQ_SHORT_SQUEEZE event shape validates');
}

// ---------------------------------------------------------------------------
// verdictBuilder wiring
// ---------------------------------------------------------------------------

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
	traceId: 'e3d-smoke',
	asOf: '2026-04-11T00:00:00.000Z',
	maxRawAgeMs: 1000,
	staleSources: [],
	isStale: false
};

function makeL9(
	events: EventPayload[],
	longLiq = 800_000,
	shortLiq = 200_000
): L9Result {
	return {
		liq_long_usd: longLiq,
		liq_short_usd: shortLiq,
		score: -10,
		label: 'LONG CASCADE',
		events
	};
}

// 3. Long cascade under bull bias → counter_reasons
function checkLongCascadeInCounterUnderBull(): void {
	const snap = baseSnapshot({
		alphaScore: 30,
		alphaLabel: 'BULL',
		l9: makeL9([makeLongCascadeEvent()])
	});
	const v = buildVerdictBlock(snap, { ...CTX, traceId: 'lc-bull' });
	const inCounter = v.counter_reasons.some((r) =>
		r.event_ids.includes(EventId.REAL_LIQ_LONG_CASCADE)
	);
	record(inCounter, 'verdictBuilder: long cascade → counter_reasons under bull bias');
}

// 4. Long cascade under bear bias → top_reasons
function checkLongCascadeInTopUnderBear(): void {
	const snap = baseSnapshot({
		alphaScore: -40,
		alphaLabel: 'BEAR',
		l9: makeL9([makeLongCascadeEvent()])
	});
	const v = buildVerdictBlock(snap, { ...CTX, traceId: 'lc-bear' });
	const inTop = v.top_reasons.some((r) =>
		r.event_ids.includes(EventId.REAL_LIQ_LONG_CASCADE)
	);
	record(inTop, 'verdictBuilder: long cascade → top_reasons under bear bias');
}

// 5. Short squeeze under bull bias → top_reasons
function checkShortSqueezeInTopUnderBull(): void {
	const snap = baseSnapshot({
		alphaScore: 35,
		alphaLabel: 'BULL',
		l9: makeL9([makeShortSqueezeEvent()], 150_000, 700_000)
	});
	const v = buildVerdictBlock(snap, { ...CTX, traceId: 'ss-bull' });
	const inTop = v.top_reasons.some((r) =>
		r.event_ids.includes(EventId.REAL_LIQ_SHORT_SQUEEZE)
	);
	record(inTop, 'verdictBuilder: short squeeze → top_reasons under bull bias');
}

// 6. Legacy snapshot (no events, just liq totals crossing legacy threshold)
function checkLegacyFallback(): void {
	const snap = baseSnapshot({
		alphaScore: 30,
		alphaLabel: 'BULL',
		l9: {
			liq_long_usd: 800_000,
			liq_short_usd: 200_000,
			score: -10,
			label: 'LONG CASCADE'
			// no events field — pre-E3d snapshot
		}
	});
	const v = buildVerdictBlock(snap, { ...CTX, traceId: 'legacy-l9' });
	const hasLegacy = v.counter_reasons.some((r) => r.text.includes('long cascade'));
	record(hasLegacy, 'verdictBuilder: legacy snapshot (no events) still produces liq reason');
}

// 7. No liquidation → no event_ids populated
function checkNoLiq(): void {
	const snap = baseSnapshot({
		alphaScore: 0,
		alphaLabel: 'NEUTRAL',
		l9: {
			liq_long_usd: 0,
			liq_short_usd: 0,
			score: 0,
			label: 'QUIET',
			events: []
		}
	});
	const v = buildVerdictBlock(snap, { ...CTX, traceId: 'no-liq' });
	const anyLiq = [...v.top_reasons, ...v.counter_reasons].some(
		(r) =>
			r.event_ids.includes(EventId.REAL_LIQ_LONG_CASCADE) ||
			r.event_ids.includes(EventId.REAL_LIQ_SHORT_SQUEEZE)
	);
	record(!anyLiq, 'verdictBuilder: no liquidation → no real-liq event_id populated');
}

function main(): number {
	console.log('E3d L9 real-liq events smoke gate');
	console.log('=================================');

	checkLongCascadeShape();
	checkShortSqueezeShape();
	checkLongCascadeInCounterUnderBull();
	checkLongCascadeInTopUnderBear();
	checkShortSqueezeInTopUnderBull();
	checkLegacyFallback();
	checkNoLiq();

	let failed = 0;
	for (const line of lines) {
		console.log(line);
		if (line.startsWith('FAIL')) failed++;
	}
	console.log('---------------------------------');
	console.log(
		failed === 0
			? `All ${lines.length} E3d assertions passed.`
			: `${failed} of ${lines.length} E3d assertions FAILED.`
	);
	return failed === 0 ? 0 : 1;
}

process.exit(main());
