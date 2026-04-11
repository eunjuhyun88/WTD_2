/**
 * E6b thresholds registry — L14 Bollinger Band squeeze smoke test.
 *
 * Verifies the second sub-slice of the harness engine integration
 * plan §3 E6: lifting the L14 BB magic numbers from
 * `layers/l14BbSqueeze.ts` into the central
 * `src/lib/engine/cogochi/thresholds.ts` registry under the new
 * `Thresholds.bb` namespace.
 *
 * The smoke confirms:
 *   - Top-level barrel still exposes the E6a `flow` namespace
 *     and the new `bb` namespace.
 *   - All 8 expected `Thresholds.bb` keys are present.
 *   - Dissection §4.3 value parity (period 20 / mult 2.0 /
 *     squeeze 0.65 / big-squeeze 0.5 / expansion 1.3 + the three
 *     data-sufficiency floors).
 *   - `bb` namespace + the leaf object are frozen against
 *     mutation in strict mode.
 *   - Compression / expansion ratio invariants
 *     (squeeze ratio < 1, big-squeeze ratio < squeeze ratio,
 *     expansion ratio > 1).
 *   - Lookback floors are strictly increasing
 *     (`bb_min_klines < bb_lookback_20_floor < bb_lookback_50_floor`).
 *   - The data floors stay consistent with the registry period
 *     (each floor is at least `period` so `calcBB` never trips
 *     its `closes.length < period` short-circuit on the
 *     post-floor branch).
 *
 * Behavioural parity is enforced by the type system + the existing
 * E3b smoke + the synthetic `rq-b-sample-size` ladder, same as E6a.
 *
 * Run:
 *   npm run research:e6b-thresholds-bb-smoke
 */

import {
	Thresholds,
	BbThresholds,
	FlowThresholds,
	ENGINE_THRESHOLDS_VERSION
} from '../../src/lib/engine/cogochi/thresholds.ts';

const lines: string[] = [];
function record(ok: boolean, name: string, detail = ''): void {
	lines.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  →  ' + detail : ''}`);
}

// 1. Version literal still pinned (no accidental bump)
function checkVersion(): void {
	record(
		ENGINE_THRESHOLDS_VERSION === 'engine-thresholds-v1',
		'ENGINE_THRESHOLDS_VERSION still engine-thresholds-v1',
		`got=${ENGINE_THRESHOLDS_VERSION}`
	);
}

// 2. Barrel exposes both flow + bb namespaces
function checkBarrel(): void {
	const ok =
		Thresholds.flow === FlowThresholds &&
		Thresholds.bb === BbThresholds &&
		Object.keys(Thresholds).sort().join(',') === 'bb,flow';
	record(ok, 'Thresholds barrel exposes flow + bb namespaces');
}

// 3. Required bb keys present
function checkBbKeys(): void {
	const required: ReadonlyArray<keyof BbThresholds> = [
		'bb_period',
		'bb_std_mult',
		'bb_squeeze_ratio_20',
		'bb_big_squeeze_ratio_50',
		'bb_expansion_ratio',
		'bb_min_klines',
		'bb_lookback_20_floor',
		'bb_lookback_50_floor'
	];
	const missing = required.filter(
		(k) => typeof (BbThresholds as Record<string, unknown>)[k] !== 'number'
	);
	record(
		missing.length === 0,
		'Thresholds.bb exposes every required L14 key',
		`missing=${missing.length === 0 ? 'none' : missing.join(',')}`
	);
}

// 4. Dissection §4.3 value parity
function checkDissectionValues(): void {
	const expected: Record<keyof BbThresholds, number> = {
		bb_period: 20,
		bb_std_mult: 2.0,
		bb_squeeze_ratio_20: 0.65,
		bb_big_squeeze_ratio_50: 0.5,
		bb_expansion_ratio: 1.3,
		bb_min_klines: 25,
		bb_lookback_20_floor: 40,
		bb_lookback_50_floor: 70
	};
	const drifted: string[] = [];
	for (const key of Object.keys(expected) as Array<keyof BbThresholds>) {
		if (BbThresholds[key] !== expected[key]) {
			drifted.push(`${key}: ${BbThresholds[key]} ≠ ${expected[key]}`);
		}
	}
	record(
		drifted.length === 0,
		'Thresholds.bb values match dissection §4.3 ledger',
		drifted.length === 0 ? '8/8' : drifted.join(' | ')
	);
}

// 5. Frozen — both top-level + leaf reject mutation
function checkFrozen(): void {
	let topThrew = false;
	let leafThrew = false;
	try {
		// @ts-expect-error — intentional mutation attempt
		Thresholds.bb = {} as BbThresholds;
	} catch {
		topThrew = true;
	}
	try {
		// @ts-expect-error — intentional mutation attempt
		BbThresholds.bb_period = 999;
	} catch {
		leafThrew = true;
	}
	const stillCorrect =
		Thresholds.bb === BbThresholds && BbThresholds.bb_period === 20;
	record(
		topThrew && leafThrew && stillCorrect,
		'Thresholds.bb frozen against mutation',
		`topThrew=${topThrew} leafThrew=${leafThrew}`
	);
}

// 6. Compression / expansion ratio invariants
function checkRatioInvariants(): void {
	const ok =
		BbThresholds.bb_squeeze_ratio_20 > 0 &&
		BbThresholds.bb_squeeze_ratio_20 < 1 &&
		BbThresholds.bb_big_squeeze_ratio_50 > 0 &&
		BbThresholds.bb_big_squeeze_ratio_50 < BbThresholds.bb_squeeze_ratio_20 &&
		BbThresholds.bb_expansion_ratio > 1;
	record(
		ok,
		'compression ratios in (0,1) and big_squeeze < squeeze; expansion > 1',
		`squeeze=${BbThresholds.bb_squeeze_ratio_20} big=${BbThresholds.bb_big_squeeze_ratio_50} exp=${BbThresholds.bb_expansion_ratio}`
	);
}

// 7. Lookback floor ladder strictly increasing
function checkFloorLadder(): void {
	const ok =
		BbThresholds.bb_min_klines < BbThresholds.bb_lookback_20_floor &&
		BbThresholds.bb_lookback_20_floor < BbThresholds.bb_lookback_50_floor;
	record(
		ok,
		'data floors strictly increasing (min < 20-floor < 50-floor)',
		`${BbThresholds.bb_min_klines} < ${BbThresholds.bb_lookback_20_floor} < ${BbThresholds.bb_lookback_50_floor}`
	);
}

// 8. Floors are at least one period — calcBB short-circuits if
// closes.length < period, so the post-floor branches must always
// have at least `period` closes.
function checkFloorsCoverPeriod(): void {
	const ok =
		BbThresholds.bb_min_klines >= BbThresholds.bb_period &&
		BbThresholds.bb_lookback_20_floor >= BbThresholds.bb_period &&
		BbThresholds.bb_lookback_50_floor >= BbThresholds.bb_period;
	record(
		ok,
		'every data floor is at least one bb_period (calcBB safe)',
		`period=${BbThresholds.bb_period}`
	);
}

// 9. period and std_mult are positive integers / finite reals
function checkPeriodAndMultSanity(): void {
	const ok =
		Number.isInteger(BbThresholds.bb_period) &&
		BbThresholds.bb_period > 0 &&
		Number.isFinite(BbThresholds.bb_std_mult) &&
		BbThresholds.bb_std_mult > 0;
	record(ok, 'bb_period positive integer and bb_std_mult positive finite');
}

// 10. E6a flow namespace untouched (regression check)
function checkFlowUnchanged(): void {
	const ok =
		FlowThresholds.fr_extreme_negative === -0.07 &&
		FlowThresholds.score_clip_min === -55 &&
		FlowThresholds.score_clip_max === 55;
	record(ok, 'E6a Thresholds.flow values unchanged');
}

function main(): number {
	console.log('E6b thresholds registry (L14 BB) smoke gate');
	console.log('===========================================');

	checkVersion();
	checkBarrel();
	checkBbKeys();
	checkDissectionValues();
	checkFrozen();
	checkRatioInvariants();
	checkFloorLadder();
	checkFloorsCoverPeriod();
	checkPeriodAndMultSanity();
	checkFlowUnchanged();

	let failed = 0;
	for (const line of lines) {
		console.log(line);
		if (line.startsWith('FAIL')) failed++;
	}
	console.log('-------------------------------------------');
	console.log(
		failed === 0
			? `All ${lines.length} E6b assertions passed.`
			: `${failed} of ${lines.length} E6b assertions FAILED.`
	);
	return failed === 0 ? 0 : 1;
}

process.exit(main());
