/**
 * E6a thresholds registry — L2 flow smoke test.
 *
 * Verifies the first sub-slice of the harness engine integration
 * plan §3 E6: lifting the L2 flow magic numbers from
 * `layerEngine.ts:computeL2` into the central
 * `src/lib/engine/cogochi/thresholds.ts` registry.
 *
 * The smoke is intentionally narrow:
 *   - Confirms the registry exists, is frozen, and exposes the
 *     expected `Thresholds.flow.*` keys.
 *   - Asserts every value matches the dissection §4.2 ledger
 *     verbatim (anchor between code and the docs ledger).
 *   - Asserts `Object.freeze` actually rejects mutation in strict
 *     mode so future "quick fixes" cannot scribble over the
 *     registry at runtime.
 *   - Verifies the FR-band ordering invariant: each successive
 *     `fr_*` boundary is strictly greater than the previous one,
 *     so the cascading `if/else if` ladder in `computeL2` cannot
 *     mis-order branches even if a future edit reshuffles names.
 *   - Verifies the OI/price/L/S/taker bands have the expected
 *     sign + ordering relationships used by the layer.
 *   - Pins the `ENGINE_THRESHOLDS_VERSION` literal so a value
 *     change is impossible without bumping the version.
 *
 * Behavioral parity (computeL2 still emits the same events on the
 * same inputs after the lift) is enforced by:
 *   1. `npm run check` — TypeScript would error on any miswired
 *      reference because every former local constant has been
 *      removed from `layerEngine.ts`.
 *   2. `npm run research:e3a-l2-flow-events-smoke` — the existing
 *      L2 event smoke (9/9), run unchanged after the lift.
 *
 * Run:
 *   npm run research:e6a-thresholds-flow-smoke
 */

import {
	Thresholds,
	FlowThresholds,
	ENGINE_THRESHOLDS_VERSION
} from '../../src/lib/engine/cogochi/thresholds.ts';

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------

const lines: string[] = [];
function record(ok: boolean, name: string, detail = ''): void {
	lines.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  →  ' + detail : ''}`);
}

// 1. Version literal pinned
function checkVersion(): void {
	record(
		ENGINE_THRESHOLDS_VERSION === 'engine-thresholds-v1',
		'ENGINE_THRESHOLDS_VERSION pinned to engine-thresholds-v1',
		`got=${ENGINE_THRESHOLDS_VERSION}`
	);
}

// 2. Top-level barrel exposes flow namespace
function checkBarrel(): void {
	const ok =
		typeof Thresholds === 'object' &&
		Thresholds !== null &&
		Thresholds.flow !== undefined &&
		Thresholds.flow === FlowThresholds;
	record(ok, 'Thresholds barrel exposes flow namespace');
}

// 3. Required keys present on Thresholds.flow
function checkFlowKeys(): void {
	const required: ReadonlyArray<keyof FlowThresholds> = [
		'fr_extreme_negative',
		'fr_negative',
		'fr_weak_negative',
		'fr_neutral_upper',
		'fr_positive',
		'fr_hot',
		'fr_extreme_positive',
		'oi_build_min_pct',
		'price_build_min_pct',
		'ls_extreme_long',
		'ls_long_heavy',
		'ls_short_heavy',
		'ls_extreme_short',
		'taker_aggressive_buy',
		'taker_buy_lean',
		'taker_sell_lean',
		'taker_aggressive_sell',
		'score_clip_min',
		'score_clip_max'
	];
	const missing = required.filter(
		(k) => typeof (FlowThresholds as Record<string, unknown>)[k] !== 'number'
	);
	record(
		missing.length === 0,
		'Thresholds.flow exposes every required L2 key',
		`missing=${missing.length === 0 ? 'none' : missing.join(',')}`
	);
}

// 4. Dissection §4.2 value parity (anchor between code + ledger)
function checkDissectionValues(): void {
	const expected: Record<keyof FlowThresholds, number> = {
		// Lines 1010-1017
		fr_extreme_negative: -0.07,
		fr_negative: -0.025,
		fr_weak_negative: -0.005,
		fr_neutral_upper: 0.005,
		fr_positive: 0.04,
		fr_hot: 0.08,
		fr_extreme_positive: 0.08,
		// Lines 1019-1022
		oi_build_min_pct: 3,
		price_build_min_pct: 0.5,
		// Lines 1026-1029
		ls_extreme_long: 2.2,
		ls_long_heavy: 1.6,
		ls_short_heavy: 0.9,
		ls_extreme_short: 0.6,
		// Lines 1033-1036
		taker_aggressive_buy: 1.25,
		taker_buy_lean: 1.08,
		taker_sell_lean: 0.92,
		taker_aggressive_sell: 0.75,
		// Line 1038 (compat)
		score_clip_min: -55,
		score_clip_max: 55
	};
	const drifted: string[] = [];
	for (const key of Object.keys(expected) as Array<keyof FlowThresholds>) {
		if (FlowThresholds[key] !== expected[key]) {
			drifted.push(`${key}: ${FlowThresholds[key]} ≠ ${expected[key]}`);
		}
	}
	record(
		drifted.length === 0,
		'Thresholds.flow values match dissection §4.2 ledger',
		drifted.length === 0 ? '19/19' : drifted.join(' | ')
	);
}

// 5. Frozen — mutation must throw in strict mode
function checkFrozen(): void {
	let topThrew = false;
	let leafThrew = false;
	try {
		// @ts-expect-error — intentional mutation attempt to verify freeze
		Thresholds.flow = {} as FlowThresholds;
	} catch {
		topThrew = true;
	}
	try {
		// @ts-expect-error — intentional mutation attempt to verify freeze
		FlowThresholds.fr_extreme_negative = 999;
	} catch {
		leafThrew = true;
	}
	const topStillFlow = Thresholds.flow === FlowThresholds;
	const leafStillCorrect = FlowThresholds.fr_extreme_negative === -0.07;
	record(
		topThrew && leafThrew && topStillFlow && leafStillCorrect,
		'Thresholds + Thresholds.flow frozen against mutation',
		`topThrew=${topThrew} leafThrew=${leafThrew}`
	);
}

// 6. FR band ordering invariant — required so the cascading
// if/else ladder in computeL2 stays sound regardless of name
// shuffles in future edits.
function checkFrOrdering(): void {
	const ladder = [
		FlowThresholds.fr_extreme_negative, // -0.07
		FlowThresholds.fr_negative, //         -0.025
		FlowThresholds.fr_weak_negative, //    -0.005
		FlowThresholds.fr_neutral_upper, //     0.005
		FlowThresholds.fr_positive, //          0.04
		FlowThresholds.fr_hot //                0.08
	];
	let strictlyAscending = true;
	for (let i = 1; i < ladder.length; i++) {
		if (!(ladder[i] > ladder[i - 1])) {
			strictlyAscending = false;
			break;
		}
	}
	const extremePositiveAlias = FlowThresholds.fr_extreme_positive === FlowThresholds.fr_hot;
	record(
		strictlyAscending && extremePositiveAlias,
		'FR ladder strictly ascending + extreme_positive aliases hot',
		`ascending=${strictlyAscending} alias=${extremePositiveAlias}`
	);
}

// 7. L/S band ordering invariant
function checkLsOrdering(): void {
	const ok =
		FlowThresholds.ls_extreme_long > FlowThresholds.ls_long_heavy &&
		FlowThresholds.ls_long_heavy > FlowThresholds.ls_short_heavy &&
		FlowThresholds.ls_short_heavy > FlowThresholds.ls_extreme_short &&
		FlowThresholds.ls_extreme_short > 0;
	record(ok, 'L/S band ladder strictly descending and positive');
}

// 8. Taker band ordering invariant
function checkTakerOrdering(): void {
	const ok =
		FlowThresholds.taker_aggressive_buy > FlowThresholds.taker_buy_lean &&
		FlowThresholds.taker_buy_lean > 1 &&
		FlowThresholds.taker_sell_lean < 1 &&
		FlowThresholds.taker_sell_lean > FlowThresholds.taker_aggressive_sell &&
		FlowThresholds.taker_aggressive_sell > 0;
	record(ok, 'Taker band ladder split around 1.0 with strict ordering');
}

// 9. OI/price gates positive (sign asymmetry handled by computeL2)
function checkOiPriceGates(): void {
	const ok =
		FlowThresholds.oi_build_min_pct > 0 &&
		FlowThresholds.price_build_min_pct > 0 &&
		Number.isFinite(FlowThresholds.oi_build_min_pct) &&
		Number.isFinite(FlowThresholds.price_build_min_pct);
	record(ok, 'oi_build_min_pct + price_build_min_pct positive finite');
}

// 10. score_clip pair sign + symmetry
function checkScoreClip(): void {
	const ok =
		FlowThresholds.score_clip_min < 0 &&
		FlowThresholds.score_clip_max > 0 &&
		FlowThresholds.score_clip_max === -FlowThresholds.score_clip_min;
	record(ok, 'score_clip_min/max symmetric around 0');
}

function main(): number {
	console.log('E6a thresholds registry (L2 flow) smoke gate');
	console.log('============================================');

	checkVersion();
	checkBarrel();
	checkFlowKeys();
	checkDissectionValues();
	checkFrozen();
	checkFrOrdering();
	checkLsOrdering();
	checkTakerOrdering();
	checkOiPriceGates();
	checkScoreClip();

	let failed = 0;
	for (const line of lines) {
		console.log(line);
		if (line.startsWith('FAIL')) failed++;
	}
	console.log('--------------------------------------------');
	console.log(
		failed === 0
			? `All ${lines.length} E6a assertions passed.`
			: `${failed} of ${lines.length} E6a assertions FAILED.`
	);
	return failed === 0 ? 0 : 1;
}

process.exit(main());
