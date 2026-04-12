/**
 * E2 verdict builder smoke test.
 *
 * Verifies `buildVerdictBlock` produces a zod-valid `VerdictBlock` for
 * every bias tier and handles edge cases:
 *   1. Strong-bull snapshot → STRONG_BULL verdict with top_reasons > 0
 *   2. Strong-bear snapshot → STRONG_BEAR verdict with counter_reasons empty
 *   3. Neutral snapshot → NEUTRAL verdict, no amplifier
 *   4. Missing trace_id → throws
 *   5. Extreme FR alert → urgency HIGH
 *   6. BB big squeeze only → urgency MEDIUM
 *   7. Non-finite alphaScore → confidence clamped to 0.5 (defensive)
 *   8. Structure state mapping: MARKUP → state.markup_continuation
 *   9. Stop levels populated → execution.stop matches
 *   10. Schema re-parse round-trip via `parseVerdictBlock`
 *
 * Run:
 *   npm run research:e2-verdict-builder-smoke
 */

import type { SignalSnapshot } from '../../src/lib/engine/cogochi/types.ts';
import { buildVerdictBlock } from '../../src/lib/engine/cogochi/verdictBuilder.ts';
import { parseVerdictBlock } from '../../src/lib/contracts/verdict.ts';
import { VerdictBias, VerdictUrgency, StructureStateId } from '../../src/lib/contracts/ids.ts';

// ---------------------------------------------------------------------------
// SignalSnapshot factory — minimum valid shape, mutation hooks for bias tier
// ---------------------------------------------------------------------------

function baseSnapshot(overrides: Partial<SignalSnapshot> = {}): SignalSnapshot {
	const base: SignalSnapshot = {
		l1: {
			phase: 'NONE',
			pattern: 'none',
			score: 0
		},
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
		hmac: ''
	};
	return { ...base, ...overrides };
}

const context = {
	traceId: 'e2-smoke-trace',
	asOf: '2026-04-11T00:00:00.000Z',
	maxRawAgeMs: 1000,
	staleSources: [],
	isStale: false
};

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------

const lines: string[] = [];

function record(ok: boolean, name: string, detail = ''): void {
	lines.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  →  ' + detail : ''}`);
}

// 1. Strong-bull
function checkStrongBull(): void {
	const snap = baseSnapshot({
		alphaScore: 75,
		alphaLabel: 'STRONG_BULL',
		l1: { phase: 'ACCUMULATION', pattern: 'spring', score: 25 },
		l10: { mtf_confluence: 'BULL_ALIGNED', acc_count: 3, dist_count: 0, score: 18, label: 'triple bull' },
		mtfTriple: true,
		l15: {
			atr_pct: 0.015,
			vol_state: 'NORMAL',
			stop_long: 58000,
			stop_short: 0,
			tp1_long: 63000,
			tp2_long: 66000,
			rr_ratio: 2.5,
			score: 4
		}
	});
	try {
		const v = buildVerdictBlock(snap, { ...context, traceId: 'bull-trace' });
		const ok =
			v.bias === VerdictBias.STRONG_BULL &&
			v.structure_state === StructureStateId.ACC_PHASE_C &&
			v.urgency === VerdictUrgency.HIGH && // mtfTriple → HIGH
			v.top_reasons.length >= 2 &&
			v.execution.stop === 58000 &&
			v.execution.targets.length === 2 &&
			v.invalidation.direction === 'below';
		record(
			ok,
			'strong_bull: builds with HIGH urgency + targets + below invalidation',
			`bias=${v.bias} urgency=${v.urgency} top=${v.top_reasons.length} targets=${v.execution.targets.length}`
		);
	} catch (err) {
		record(false, 'strong_bull', (err as Error).message);
	}
}

// 2. Strong-bear
function checkStrongBear(): void {
	const snap = baseSnapshot({
		alphaScore: -70,
		alphaLabel: 'STRONG_BEAR',
		l1: { phase: 'DISTRIBUTION', pattern: 'utad', score: -22 },
		l10: { mtf_confluence: 'BEAR_ALIGNED', acc_count: 0, dist_count: 3, score: -18, label: 'triple bear' },
		mtfTriple: true,
		l9: { liq_long_usd: 800_000, liq_short_usd: 150_000, score: -8, label: 'long cascade' },
		l15: {
			atr_pct: 0.02,
			vol_state: 'HIGH',
			stop_long: 0,
			stop_short: 66000,
			tp1_long: 0,
			tp2_long: 0,
			rr_ratio: 2.0,
			score: -3
		}
	});
	try {
		const v = buildVerdictBlock(snap, { ...context, traceId: 'bear-trace' });
		const ok =
			v.bias === VerdictBias.STRONG_BEAR &&
			v.structure_state === StructureStateId.DIST_PHASE_C &&
			v.urgency === VerdictUrgency.HIGH &&
			v.top_reasons.length >= 2 &&
			v.execution.stop === 66000 &&
			v.invalidation.direction === 'above';
		record(
			ok,
			'strong_bear: builds with bear invalidation above + triple MTF',
			`bias=${v.bias} stop=${v.execution.stop} inv=${v.invalidation.direction}`
		);
	} catch (err) {
		record(false, 'strong_bear', (err as Error).message);
	}
}

// 3. Neutral
function checkNeutral(): void {
	const snap = baseSnapshot({
		alphaScore: 5,
		alphaLabel: 'NEUTRAL'
	});
	try {
		const v = buildVerdictBlock(snap, { ...context, traceId: 'neutral-trace' });
		const ok =
			v.bias === VerdictBias.NEUTRAL &&
			v.urgency === VerdictUrgency.LOW &&
			v.counter_reasons.length === 0 &&
			v.execution.stop === null;
		record(ok, 'neutral: LOW urgency, no stop, counter empty', `urgency=${v.urgency}`);
	} catch (err) {
		record(false, 'neutral', (err as Error).message);
	}
}

// 4. Missing trace_id → throws
function checkMissingTrace(): void {
	const snap = baseSnapshot({ alphaLabel: 'BULL', alphaScore: 30 });
	try {
		buildVerdictBlock(snap, { ...context, traceId: '' });
		record(false, 'missing trace_id rejected', 'did not throw');
	} catch (err) {
		record(true, 'missing trace_id rejected', (err as Error).message.slice(0, 80));
	}
}

// 5. Extreme FR → HIGH urgency
function checkExtremeFrUrgency(): void {
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
			price_change: 0.01,
			score: 20,
			detail: ''
		}
	});
	const v = buildVerdictBlock(snap, { ...context, traceId: 'fr-trace' });
	const ok = v.urgency === VerdictUrgency.HIGH && v.top_reasons.some((r) => r.text.includes('Funding'));
	record(ok, 'extreme FR → HIGH urgency + FR reason', `urgency=${v.urgency}`);
}

// 6. BB big squeeze only → MEDIUM urgency
function checkBbBigSqueezeUrgency(): void {
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
			score: 5,
			label: 'big squeeze'
		}
	});
	const v = buildVerdictBlock(snap, { ...context, traceId: 'bb-trace' });
	const ok = v.urgency === VerdictUrgency.MEDIUM;
	record(ok, 'bb big squeeze only → MEDIUM urgency', `urgency=${v.urgency}`);
}

// 7. Non-finite alphaScore → defensive fallback
function checkNonFiniteScore(): void {
	const snap = baseSnapshot({
		alphaScore: Number.NaN,
		alphaLabel: 'NEUTRAL'
	});
	const v = buildVerdictBlock(snap, { ...context, traceId: 'nan-trace' });
	const ok = v.confidence === 0.5 && v.legacy_alpha_score === null;
	record(
		ok,
		'NaN alphaScore → confidence 0.5, legacy null',
		`confidence=${v.confidence} legacy=${v.legacy_alpha_score}`
	);
}

// 8. Structure state mapping — MARKUP → markup_continuation
function checkStructureMapping(): void {
	const snap = baseSnapshot({
		alphaScore: 40,
		alphaLabel: 'BULL',
		l1: { phase: 'MARKUP', pattern: 'sos', score: 18 }
	});
	const v = buildVerdictBlock(snap, { ...context, traceId: 'markup-trace' });
	const ok = v.structure_state === StructureStateId.MARKUP_CONTINUATION;
	record(ok, 'MARKUP → state.markup_continuation', `state=${v.structure_state}`);
}

// 9. Schema round-trip via parseVerdictBlock
function checkRoundTrip(): void {
	const snap = baseSnapshot({
		alphaScore: 62,
		alphaLabel: 'STRONG_BULL',
		l1: { phase: 'ACCUMULATION', pattern: 'spring', score: 24 },
		l15: {
			atr_pct: 0.015,
			vol_state: 'NORMAL',
			stop_long: 58000,
			stop_short: 0,
			tp1_long: 63000,
			tp2_long: 66000,
			rr_ratio: 2.5,
			score: 4
		}
	});
	const v = buildVerdictBlock(snap, { ...context, traceId: 'round-trip-trace' });
	try {
		const reparsed = parseVerdictBlock(v);
		const ok =
			reparsed.bias === v.bias &&
			reparsed.trace_id === v.trace_id &&
			reparsed.structure_state === v.structure_state;
		record(ok, 'round-trip: parseVerdictBlock accepts builder output', `bias=${reparsed.bias}`);
	} catch (err) {
		record(false, 'round-trip', (err as Error).message);
	}
}

// 10. Stale data propagates
function checkStaleFreshness(): void {
	const snap = baseSnapshot({ alphaLabel: 'NEUTRAL' });
	const v = buildVerdictBlock(snap, {
		...context,
		traceId: 'stale-trace',
		staleSources: ['raw.global.fear_greed.value'],
		isStale: true,
		maxRawAgeMs: 5 * 60 * 1000
	});
	const ok =
		v.data_freshness.is_stale === true &&
		v.data_freshness.stale_sources.length === 1 &&
		v.data_freshness.max_raw_age_ms === 5 * 60 * 1000;
	record(
		ok,
		'stale data_freshness propagated',
		`is_stale=${v.data_freshness.is_stale} sources=${v.data_freshness.stale_sources.length}`
	);
}

function main(): number {
	console.log('E2 verdict builder smoke gate');
	console.log('=============================');

	checkStrongBull();
	checkStrongBear();
	checkNeutral();
	checkMissingTrace();
	checkExtremeFrUrgency();
	checkBbBigSqueezeUrgency();
	checkNonFiniteScore();
	checkStructureMapping();
	checkRoundTrip();
	checkStaleFreshness();

	let failed = 0;
	for (const line of lines) {
		console.log(line);
		if (line.startsWith('FAIL')) failed++;
	}
	console.log('-----------------------------');
	console.log(
		failed === 0
			? `All ${lines.length} E2 assertions passed.`
			: `${failed} of ${lines.length} E2 assertions FAILED.`
	);
	return failed === 0 ? 0 : 1;
}

process.exit(main());
