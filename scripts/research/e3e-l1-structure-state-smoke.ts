/**
 * E3e L1 structure_state refined mapping smoke test.
 *
 * Verifies that buildVerdictBlock's Wyckoff phase → StructureStateId
 * mapping honors the sub-phase precision flags on L1Result.
 *
 *   - ACCUMULATION + hasSos → ACC_PHASE_D (breakout transition)
 *   - ACCUMULATION + hasSpring → ACC_PHASE_C (spring test)
 *   - ACCUMULATION (no flags) → ACC_PHASE_C (default)
 *   - DISTRIBUTION + hasSow → DIST_PHASE_D (breakdown transition)
 *   - DISTRIBUTION + hasUtad → DIST_PHASE_C (UTAD test)
 *   - DISTRIBUTION (no flags) → DIST_PHASE_C (default)
 *   - MARKUP → MARKUP_CONTINUATION
 *   - MARKDOWN → MARKDOWN_CONTINUATION
 *   - REACCUM → REACCUMULATION
 *   - REDIST → REDISTRIBUTION
 *   - NONE → NONE
 *   - hasSos AND hasSpring → SOS wins (D > C transition precedence)
 *   - hasSow AND hasUtad → SOW wins
 *
 * Run:
 *   npm run research:e3e-l1-structure-state-smoke
 */

import type { SignalSnapshot, L1Result, WyckoffPhase } from '../../src/lib/engine/cogochi/types.ts';
import { buildVerdictBlock } from '../../src/lib/engine/cogochi/verdictBuilder.ts';
import { StructureStateId } from '../../src/lib/contracts/ids.ts';

// ---------------------------------------------------------------------------
// Fixture factory
// ---------------------------------------------------------------------------

function baseSnapshot(l1: L1Result): SignalSnapshot {
	return {
		l1,
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
}

const CTX = {
	traceId: 'e3e-smoke',
	asOf: '2026-04-11T00:00:00.000Z',
	maxRawAgeMs: 1000,
	staleSources: [],
	isStale: false
};

function makeL1(phase: WyckoffPhase, flags: Partial<L1Result> = {}): L1Result {
	return {
		phase,
		pattern: `${phase} test`,
		score: 20,
		...flags
	};
}

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------

const lines: string[] = [];

function record(ok: boolean, name: string, detail = ''): void {
	lines.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  →  ' + detail : ''}`);
}

function assertStructureState(
	name: string,
	snap: SignalSnapshot,
	expected: string
): void {
	const v = buildVerdictBlock(snap, { ...CTX, traceId: `e3e-${name}` });
	record(
		v.structure_state === expected,
		name,
		`got ${v.structure_state}, expected ${expected}`
	);
}

function main(): number {
	console.log('E3e L1 structure_state refined mapping smoke gate');
	console.log('=================================================');

	// ACCUMULATION branches
	assertStructureState(
		'ACC + hasSos → ACC_PHASE_D',
		baseSnapshot(makeL1('ACCUMULATION', { hasSos: true })),
		StructureStateId.ACC_PHASE_D
	);
	assertStructureState(
		'ACC + hasSpring (no sos) → ACC_PHASE_C',
		baseSnapshot(makeL1('ACCUMULATION', { hasSpring: true })),
		StructureStateId.ACC_PHASE_C
	);
	assertStructureState(
		'ACC (no flags) → ACC_PHASE_C default',
		baseSnapshot(makeL1('ACCUMULATION')),
		StructureStateId.ACC_PHASE_C
	);
	assertStructureState(
		'ACC + hasSos + hasSpring → ACC_PHASE_D (sos wins)',
		baseSnapshot(makeL1('ACCUMULATION', { hasSos: true, hasSpring: true })),
		StructureStateId.ACC_PHASE_D
	);

	// DISTRIBUTION branches
	assertStructureState(
		'DIST + hasSow → DIST_PHASE_D',
		baseSnapshot(makeL1('DISTRIBUTION', { hasSow: true })),
		StructureStateId.DIST_PHASE_D
	);
	assertStructureState(
		'DIST + hasUtad (no sow) → DIST_PHASE_C',
		baseSnapshot(makeL1('DISTRIBUTION', { hasUtad: true })),
		StructureStateId.DIST_PHASE_C
	);
	assertStructureState(
		'DIST (no flags) → DIST_PHASE_C default',
		baseSnapshot(makeL1('DISTRIBUTION')),
		StructureStateId.DIST_PHASE_C
	);
	assertStructureState(
		'DIST + hasSow + hasUtad → DIST_PHASE_D (sow wins)',
		baseSnapshot(makeL1('DISTRIBUTION', { hasSow: true, hasUtad: true })),
		StructureStateId.DIST_PHASE_D
	);

	// Continuation phases
	assertStructureState(
		'MARKUP → markup_continuation',
		baseSnapshot(makeL1('MARKUP')),
		StructureStateId.MARKUP_CONTINUATION
	);
	assertStructureState(
		'MARKDOWN → markdown_continuation',
		baseSnapshot(makeL1('MARKDOWN')),
		StructureStateId.MARKDOWN_CONTINUATION
	);

	// Re-accum / re-dist
	assertStructureState(
		'REACCUM → reaccumulation',
		baseSnapshot(makeL1('REACCUM')),
		StructureStateId.REACCUMULATION
	);
	assertStructureState(
		'REDIST → redistribution',
		baseSnapshot(makeL1('REDIST')),
		StructureStateId.REDISTRIBUTION
	);

	// NONE
	assertStructureState(
		'NONE → state.none',
		baseSnapshot(makeL1('NONE')),
		StructureStateId.NONE
	);

	let failed = 0;
	for (const line of lines) {
		console.log(line);
		if (line.startsWith('FAIL')) failed++;
	}
	console.log('-------------------------------------------------');
	console.log(
		failed === 0
			? `All ${lines.length} E3e assertions passed.`
			: `${failed} of ${lines.length} E3e assertions FAILED.`
	);
	return failed === 0 ? 0 : 1;
}

process.exit(main());
