/**
 * E3b L14 BB squeeze events smoke test.
 *
 * Verifies:
 *   1. `computeL14BbSqueeze` emits BB_BIG_SQUEEZE when bandwidth is
 *      contracted below 50% of its 50-bar prior value.
 *   2. `computeL14BbSqueeze` emits BB_SQUEEZE (no big) when bandwidth
 *      is contracted below 65% of the 20-bar prior but not the 50-bar.
 *   3. `computeL14BbSqueeze` emits BB_EXPANSION when bandwidth expands
 *      beyond 130% of the 20-bar prior.
 *   4. `computeL14BbSqueeze` emits no events when bandwidth is normal.
 *   5. Every emitted event round-trips through `EventPayloadSchema`.
 *   6. `buildVerdictBlock` surfaces BB_BIG_SQUEEZE event_id in a
 *      top_reason (context direction → always top).
 *   7. `buildVerdictBlock` surfaces BB_SQUEEZE event_id in a top_reason.
 *   8. `buildVerdictBlock` surfaces BB_EXPANSION event_id as its own
 *      top_reason when expansion fires.
 *   9. Pre-E3b L14Result shape (no events field) still produces
 *      BB reason via legacy path.
 *
 * Run:
 *   npm run research:e3b-l14-bb-events-smoke
 */

import type { BinanceKline } from '../../src/lib/engine/types.ts';
import type { SignalSnapshot, L14Result } from '../../src/lib/engine/cogochi/types.ts';
import { computeL14BbSqueeze } from '../../src/lib/engine/cogochi/layers/l14BbSqueeze.ts';
import {
	EventId,
	EventPayloadSchema,
	type EventPayload
} from '../../src/lib/contracts/events.ts';
import { buildVerdictBlock } from '../../src/lib/engine/cogochi/verdictBuilder.ts';

// ---------------------------------------------------------------------------
// Synthetic kline generator — build bandwidths that trip each threshold
// ---------------------------------------------------------------------------

function makeKline(close: number, idx: number): BinanceKline {
	return {
		openTime: idx * 60_000,
		open: close,
		high: close,
		low: close,
		close,
		volume: 100,
		closeTime: idx * 60_000 + 59_999,
		quoteAssetVolume: 0,
		trades: 0,
		takerBuyBase: 0,
		takerBuyQuote: 0
	} as unknown as BinanceKline;
}

/**
 * Generate a kline series whose bandwidth is DECREASING to the given
 * final amplitude. Length 120 so both 20-bar and 50-bar prior BBs are
 * available. The `amplitude` parameter controls the std deviation of
 * the recent 20-bar window.
 */
function buildDecreasingBandwidthKlines(finalAmplitude: number): BinanceKline[] {
	const klines: BinanceKline[] = [];
	const base = 100;
	for (let i = 0; i < 120; i++) {
		// Prior bars (0-99): wide oscillation
		// Recent bars (100-119): narrow oscillation
		const isRecent = i >= 100;
		const amp = isRecent ? finalAmplitude : 4;
		const close = base + amp * Math.sin(i * 0.5);
		klines.push(makeKline(close, i));
	}
	return klines;
}

/**
 * Generate a kline series whose bandwidth is INCREASING (expansion).
 */
function buildExpansionKlines(): BinanceKline[] {
	const klines: BinanceKline[] = [];
	const base = 100;
	for (let i = 0; i < 120; i++) {
		const isRecent = i >= 100;
		const amp = isRecent ? 8 : 2; // recent 4x wider than prior
		const close = base + amp * Math.sin(i * 0.5);
		klines.push(makeKline(close, i));
	}
	return klines;
}

/**
 * Stable-bandwidth series — nothing should fire.
 */
function buildNormalKlines(): BinanceKline[] {
	const klines: BinanceKline[] = [];
	const base = 100;
	for (let i = 0; i < 120; i++) {
		const close = base + 3 * Math.sin(i * 0.5);
		klines.push(makeKline(close, i));
	}
	return klines;
}

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------

const lines: string[] = [];

function record(ok: boolean, name: string, detail = ''): void {
	lines.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  →  ' + detail : ''}`);
}

// 1. BB big squeeze — tight recent bandwidth
function checkBigSqueeze(): void {
	const klines = buildDecreasingBandwidthKlines(0.5); // very narrow
	const r = computeL14BbSqueeze(klines);
	const hasBig = (r.events ?? []).some((e) => e.id === EventId.BB_BIG_SQUEEZE);
	record(
		r.bb_big_squeeze && hasBig,
		'L14: big squeeze fires BB_BIG_SQUEEZE event',
		`bb_big=${r.bb_big_squeeze} eventCount=${r.events?.length ?? 0}`
	);
}

// 2. BB squeeze — moderate compression
function checkSqueeze(): void {
	const klines = buildDecreasingBandwidthKlines(2.0); // moderately narrow
	const r = computeL14BbSqueeze(klines);
	const hasSqueeze = (r.events ?? []).some((e) => e.id === EventId.BB_SQUEEZE);
	record(
		r.bb_squeeze && hasSqueeze,
		'L14: squeeze fires BB_SQUEEZE event',
		`bb_squeeze=${r.bb_squeeze} eventCount=${r.events?.length ?? 0}`
	);
}

// 3. BB expansion — wide recent
function checkExpansion(): void {
	const klines = buildExpansionKlines();
	const r = computeL14BbSqueeze(klines);
	const hasExpansion = (r.events ?? []).some((e) => e.id === EventId.BB_EXPANSION);
	record(
		r.bb_expanding && hasExpansion,
		'L14: expansion fires BB_EXPANSION event',
		`bb_expanding=${r.bb_expanding} eventCount=${r.events?.length ?? 0}`
	);
}

// 4. Normal bandwidth — no events
function checkNormal(): void {
	const klines = buildNormalKlines();
	const r = computeL14BbSqueeze(klines);
	const events = r.events ?? [];
	record(
		events.length === 0,
		'L14: normal bandwidth → no events emitted',
		`eventCount=${events.length}`
	);
}

// 5. Event shapes round-trip
function checkEventRoundTrip(): void {
	const klines = buildDecreasingBandwidthKlines(0.5);
	const r = computeL14BbSqueeze(klines);
	for (const evt of r.events ?? []) {
		const parsed = EventPayloadSchema.safeParse(evt);
		if (!parsed.success) {
			record(false, `L14 event round-trip: ${evt.id}`, JSON.stringify(parsed.error.issues));
			return;
		}
	}
	record(true, 'L14 event round-trip: all emitted events validate');
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
	traceId: 'e3b-smoke',
	asOf: '2026-04-11T00:00:00.000Z',
	maxRawAgeMs: 1000,
	staleSources: [],
	isStale: false
};

function makeL14WithEvents(events: EventPayload[], bbFlags: Partial<L14Result> = {}): L14Result {
	return {
		bb_squeeze: false,
		bb_big_squeeze: false,
		bb_expanding: false,
		bb_width: 0.008,
		bb_pos: 50,
		score: 5,
		label: 'test',
		events,
		...bbFlags
	} as L14Result;
}

// 6. verdictBuilder surfaces BB_BIG_SQUEEZE event_id
function checkVerdictBuilderBigSqueeze(): void {
	const snap = baseSnapshot({
		alphaScore: 20,
		alphaLabel: 'BULL',
		bbBigSqueeze: true,
		l14: makeL14WithEvents(
			[
				{
					id: EventId.BB_BIG_SQUEEZE,
					direction: 'context',
					severity: 'high',
					note: 'historic compression',
					data: { bandwidth: 0.008, bandwidth_ratio_50: 0.45 }
				}
			],
			{ bb_big_squeeze: true }
		)
	});
	const v = buildVerdictBlock(snap, { ...CTX, traceId: 'big-sq' });
	const reason = v.top_reasons.find((r) => r.event_ids.includes(EventId.BB_BIG_SQUEEZE));
	record(
		!!reason,
		'verdictBuilder: BB_BIG_SQUEEZE event_id surfaces in top_reasons',
		reason ? `text=${reason.text.slice(0, 40)}` : 'missing'
	);
}

// 7. verdictBuilder surfaces BB_SQUEEZE event_id
function checkVerdictBuilderSqueeze(): void {
	const snap = baseSnapshot({
		alphaScore: 10,
		alphaLabel: 'NEUTRAL',
		l14: makeL14WithEvents(
			[
				{
					id: EventId.BB_SQUEEZE,
					direction: 'context',
					severity: 'medium',
					note: 'BB compression',
					data: { bandwidth: 0.012, bandwidth_ratio_20: 0.6 }
				}
			],
			{ bb_squeeze: true }
		)
	});
	const v = buildVerdictBlock(snap, { ...CTX, traceId: 'sq' });
	const reason = v.top_reasons.find((r) => r.event_ids.includes(EventId.BB_SQUEEZE));
	record(!!reason, 'verdictBuilder: BB_SQUEEZE event_id surfaces in top_reasons');
}

// 8. verdictBuilder surfaces BB_EXPANSION as its own reason
function checkVerdictBuilderExpansion(): void {
	const snap = baseSnapshot({
		alphaScore: 30,
		alphaLabel: 'BULL',
		l14: makeL14WithEvents(
			[
				{
					id: EventId.BB_EXPANSION,
					direction: 'context',
					severity: 'medium',
					note: 'expansion in progress',
					data: { bandwidth: 0.04, expansion_ratio: 1.45 }
				}
			],
			{ bb_expanding: true }
		)
	});
	const v = buildVerdictBlock(snap, { ...CTX, traceId: 'exp' });
	const reason = v.top_reasons.find((r) => r.event_ids.includes(EventId.BB_EXPANSION));
	record(!!reason, 'verdictBuilder: BB_EXPANSION event_id surfaces in top_reasons');
}

// 9. Legacy snapshot (no events) still produces BB reason
function checkLegacyFallback(): void {
	const snap = baseSnapshot({
		alphaScore: 30,
		alphaLabel: 'BULL',
		bbBigSqueeze: true,
		l14: {
			bb_squeeze: true,
			bb_big_squeeze: true,
			bb_expanding: false,
			bb_width: 0.008,
			bb_pos: 0.5,
			score: 8,
			label: 'legacy BIG SQUEEZE'
			// no events field — pre-E3b snapshot
		}
	});
	const v = buildVerdictBlock(snap, { ...CTX, traceId: 'legacy-bb' });
	const hasBbReason = v.top_reasons.some((r) =>
		r.text.toLowerCase().includes('bb big squeeze')
	);
	record(hasBbReason, 'verdictBuilder: legacy snapshot (no events) still produces BB reason');
}

function main(): number {
	console.log('E3b L14 BB squeeze events smoke gate');
	console.log('====================================');

	checkBigSqueeze();
	checkSqueeze();
	checkExpansion();
	checkNormal();
	checkEventRoundTrip();
	checkVerdictBuilderBigSqueeze();
	checkVerdictBuilderSqueeze();
	checkVerdictBuilderExpansion();
	checkLegacyFallback();

	let failed = 0;
	for (const line of lines) {
		console.log(line);
		if (line.startsWith('FAIL')) failed++;
	}
	console.log('------------------------------------');
	console.log(
		failed === 0
			? `All ${lines.length} E3b assertions passed.`
			: `${failed} of ${lines.length} E3b assertions FAILED.`
	);
	return failed === 0 ? 0 : 1;
}

process.exit(main());
