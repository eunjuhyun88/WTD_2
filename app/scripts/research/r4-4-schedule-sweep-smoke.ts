/**
 * R4.4 schedule + weight sweep smoke test.
 *
 * Acceptance for the current schedule/weight-sweep gate in
 * `research/evals/rq-b-baseline-protocol.md`:
 *
 *   - Each schedule and each sweep produces a typed iterator of cells
 *     with recorded provenance (seed, version, parent strategy).
 *
 * Assertions grouped by primitive:
 *
 *   1. GeometricSchedule — 50..800 x2 → 5 cells {50,100,200,400,800}
 *   2. LinearSchedule — 100..400 +100 → 4 cells {100,200,300,400}
 *   3. EarlyStopSchedule — bounded to 3 cells, strategy label includes tag
 *   4. Schedule config errors — negative step, bad factor, bad maxCells
 *   5. FullFactorialSweep — 2x2x2x2x2 = 32 cells, deterministic order,
 *      every cell carries its weights inline
 *   6. LatinHypercubeSweep(n) — exactly n cells, deterministic on same
 *      seed, different on different seed, every sample inside its range
 *   7. EscalatingSweep — iterate() yields phase1 only; iteratePhase2()
 *      yields phase2 cells with `#phase2` in the strategy label
 *   8. Sweep config errors — empty grid, malformed range, bad sample count
 *
 * Run:
 *   npm run research:r4-4-smoke
 */

import {
	createGeometricSchedule,
	createLinearSchedule,
	createEarlyStopSchedule,
	ScheduleConfigError,
	SCHEDULE_VERSION
} from '../../src/lib/research/schedule.ts';
import type { ScheduleCell } from '../../src/lib/research/schedule.ts';
import {
	createFullFactorialSweep,
	createLatinHypercubeSweep,
	createEscalatingSweep,
	WeightSweepConfigError,
	WEIGHT_SWEEP_VERSION
} from '../../src/lib/research/weightSweep.ts';
import type {
	WeightSweepCell,
	FullFactorialGrid,
	LatinHypercubeRanges
} from '../../src/lib/research/weightSweep.ts';

// ---------------------------------------------------------------------------
// Assertion helper
// ---------------------------------------------------------------------------

const lines: string[] = [];

function record(ok: boolean, name: string, detail: string): void {
	lines.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  →  ' + detail : ''}`);
}

function expectScheduleError(fn: () => unknown, name: string): void {
	try {
		fn();
		record(false, name, 'no error thrown');
	} catch (err) {
		if (err instanceof ScheduleConfigError) record(true, name, err.message);
		else record(false, name, `wrong error: ${(err as Error).name}`);
	}
}

function expectSweepError(fn: () => unknown, name: string): void {
	try {
		fn();
		record(false, name, 'no error thrown');
	} catch (err) {
		if (err instanceof WeightSweepConfigError) record(true, name, err.message);
		else record(false, name, `wrong error: ${(err as Error).name}`);
	}
}

// ---------------------------------------------------------------------------
// 1. GeometricSchedule
// ---------------------------------------------------------------------------

function checkGeometric(): void {
	const geo = createGeometricSchedule({ from: 50, to: 800, factor: 2 });
	const cells: ScheduleCell[] = Array.from(geo.iterate(42));
	const sizes = cells.map((c) => c.sampleSize);
	const expected = [50, 100, 200, 400, 800];
	const sizesOk =
		sizes.length === expected.length && sizes.every((v, i) => v === expected[i]);
	record(sizesOk, 'geometric: 50..800x2 yields [50,100,200,400,800]', `got=${sizes.join(',')}`);

	const provenanceOk =
		cells.every((c, i) => c.sequenceIndex === i) &&
		cells.every((c) => c.version === SCHEDULE_VERSION) &&
		cells.every((c) => c.strategy === 'geometric(50..800x2)') &&
		cells.every((c) => c.seed === 42);
	record(provenanceOk, 'geometric: provenance (seq/version/strategy/seed) carried', `strategy=${cells[0]?.strategy}`);

	// Re-iterate is deterministic and repeatable
	const again = Array.from(geo.iterate(42)).map((c) => c.sampleSize);
	const repeatable = again.length === sizes.length && again.every((v, i) => v === sizes[i]);
	record(repeatable, 'geometric: iterate() is repeatable on the same seed', `again=${again.join(',')}`);
}

// ---------------------------------------------------------------------------
// 2. LinearSchedule
// ---------------------------------------------------------------------------

function checkLinear(): void {
	const lin = createLinearSchedule({ from: 100, to: 400, step: 100 });
	const sizes = Array.from(lin.iterate(7)).map((c) => c.sampleSize);
	const expected = [100, 200, 300, 400];
	const ok = sizes.length === expected.length && sizes.every((v, i) => v === expected[i]);
	record(ok, 'linear: 100..400+100 yields [100,200,300,400]', `got=${sizes.join(',')}`);
}

// ---------------------------------------------------------------------------
// 3. EarlyStopSchedule
// ---------------------------------------------------------------------------

function checkEarlyStop(): void {
	const base = createGeometricSchedule({ from: 10, to: 10000, factor: 2 });
	const bounded = createEarlyStopSchedule(base, {
		stopCondition: 'ci-excludes-zero',
		maxCells: 3
	});
	const cells = Array.from(bounded.iterate(99));
	const sizeOk = cells.length === 3;
	const labelOk =
		bounded.strategy === 'early-stop(geometric(10..10000x2)|ci-excludes-zero)' &&
		cells.every((c) => c.strategy === bounded.strategy);
	const kindOk = bounded.kind === 'early-stop';
	record(
		sizeOk && labelOk && kindOk,
		'early-stop: bounds base to maxCells and tags strategy label',
		`count=${cells.length} label=${bounded.strategy}`
	);

	// Sample sizes preserved from the base sequence
	const sampleOk =
		cells[0]!.sampleSize === 10 &&
		cells[1]!.sampleSize === 20 &&
		cells[2]!.sampleSize === 40;
	record(sampleOk, 'early-stop: sample sizes inherited from base', `sizes=${cells.map((c) => c.sampleSize).join(',')}`);
}

// ---------------------------------------------------------------------------
// 4. Schedule config errors
// ---------------------------------------------------------------------------

function checkScheduleErrors(): void {
	expectScheduleError(
		() => createGeometricSchedule({ from: 0, to: 100, factor: 2 }),
		'geometric: rejects from < 1'
	);
	expectScheduleError(
		() => createGeometricSchedule({ from: 50, to: 10, factor: 2 }),
		'geometric: rejects to < from'
	);
	expectScheduleError(
		() => createGeometricSchedule({ from: 50, to: 100, factor: 1 }),
		'geometric: rejects factor <= 1'
	);
	expectScheduleError(
		() => createLinearSchedule({ from: 10, to: 100, step: 0 }),
		'linear: rejects step = 0'
	);
	expectScheduleError(
		() => createEarlyStopSchedule(createLinearSchedule({ from: 1, to: 5, step: 1 }), {
			stopCondition: 'max-cells-reached',
			maxCells: 0
		}),
		'early-stop: rejects maxCells = 0'
	);
}

// ---------------------------------------------------------------------------
// 5. FullFactorialSweep
// ---------------------------------------------------------------------------

function checkFullFactorial(): void {
	const grid: FullFactorialGrid = {
		pnl: [1, 2],
		drawdown: [1, 2],
		violation: [1, 2],
		directionHit: [1, 2],
		slippage: [1, 2]
	};
	const sweep = createFullFactorialSweep(grid);
	const cells: WeightSweepCell[] = Array.from(sweep.iterate(42));

	const sizeOk = cells.length === 32;
	record(sizeOk, 'full-factorial: 2^5 grid yields 32 cells', `count=${cells.length}`);

	// Every cell carries weights inline.
	const weightsOk = cells.every(
		(c) =>
			c.weights.pnl === 1 || c.weights.pnl === 2
	) &&
		cells.every((c) => c.version === WEIGHT_SWEEP_VERSION) &&
		cells.every((c) => c.seed === 42) &&
		cells.every((c, i) => c.sequenceIndex === i);
	record(weightsOk, 'full-factorial: every cell carries weights + provenance', `strategy=${cells[0]?.strategy}`);

	// Lexicographic ordering: first cell all-1, last cell all-2, cell #1 differs only in slippage.
	const first = cells[0]!.weights;
	const second = cells[1]!.weights;
	const last = cells[cells.length - 1]!.weights;
	const lexOk =
		first.pnl === 1 &&
		first.drawdown === 1 &&
		first.violation === 1 &&
		first.directionHit === 1 &&
		first.slippage === 1 &&
		second.slippage === 2 &&
		second.pnl === 1 &&
		last.pnl === 2 &&
		last.slippage === 2;
	record(lexOk, 'full-factorial: deterministic lexicographic ordering', `first=${JSON.stringify(first)}`);
}

// ---------------------------------------------------------------------------
// 6. LatinHypercubeSweep
// ---------------------------------------------------------------------------

function checkLatinHypercube(): void {
	const ranges: LatinHypercubeRanges = {
		pnl: [1, 2],
		drawdown: [1, 2],
		violation: [1, 2],
		directionHit: [0, 1],
		slippage: [0, 1]
	};
	const lhs = createLatinHypercubeSweep(ranges, 8);
	const a = Array.from(lhs.iterate(42));
	const b = Array.from(lhs.iterate(42));
	const c = Array.from(lhs.iterate(99));

	const sizeOk = a.length === 8;
	record(sizeOk, 'latin-hypercube: n=8 yields 8 cells', `count=${a.length}`);

	// Determinism: same seed → same weights; different seed → at least one diff
	const sameSeedEq = a.every(
		(cell, i) =>
			cell.weights.pnl === b[i]!.weights.pnl &&
			cell.weights.drawdown === b[i]!.weights.drawdown &&
			cell.weights.violation === b[i]!.weights.violation &&
			cell.weights.directionHit === b[i]!.weights.directionHit &&
			cell.weights.slippage === b[i]!.weights.slippage
	);
	record(sameSeedEq, 'latin-hypercube: deterministic on same seed', `len=${a.length}`);

	let differs = false;
	for (let i = 0; i < a.length; i++) {
		if (a[i]!.weights.pnl !== c[i]!.weights.pnl) {
			differs = true;
			break;
		}
	}
	record(differs, 'latin-hypercube: sequence differs across seeds', `seed-diff=${differs}`);

	// Every sample is inside its declared range.
	const inRange = a.every(
		(cell) =>
			cell.weights.pnl >= 1 &&
			cell.weights.pnl <= 2 &&
			cell.weights.drawdown >= 1 &&
			cell.weights.drawdown <= 2 &&
			cell.weights.violation >= 1 &&
			cell.weights.violation <= 2 &&
			cell.weights.directionHit >= 0 &&
			cell.weights.directionHit <= 1 &&
			cell.weights.slippage >= 0 &&
			cell.weights.slippage <= 1
	);
	record(inRange, 'latin-hypercube: every sample lies inside its range', '');

	// Stratification: each stratum should be hit exactly once per dimension.
	// With strata [0, 1/8), [1/8, 2/8), ..., [7/8, 1): map each weight back
	// to its original unit-interval normalization and check coverage.
	const strataHit: number[] = new Array(8).fill(0);
	for (const cell of a) {
		const u = cell.weights.directionHit; // range [0,1] maps to u directly
		const stratum = Math.min(7, Math.floor(u * 8));
		strataHit[stratum]! += 1;
	}
	const stratified = strataHit.every((count) => count === 1);
	record(
		stratified,
		'latin-hypercube: each stratum hit exactly once per dimension',
		`hits=${strataHit.join(',')}`
	);
}

// ---------------------------------------------------------------------------
// 7. EscalatingSweep
// ---------------------------------------------------------------------------

function checkEscalating(): void {
	const phase1 = createFullFactorialSweep({
		pnl: [1, 2],
		drawdown: [1],
		violation: [1],
		directionHit: [1],
		slippage: [1]
	});
	const phase2 = createFullFactorialSweep({
		pnl: [1, 2, 3, 4],
		drawdown: [1],
		violation: [1],
		directionHit: [1],
		slippage: [1]
	});
	const escalating = createEscalatingSweep(phase1, phase2);

	const p1Cells = Array.from(escalating.iterate(42));
	const p2Cells = Array.from(escalating.iteratePhase2(42));

	const countsOk = p1Cells.length === 2 && p2Cells.length === 4;
	record(countsOk, 'escalating: iterate() = phase1 (2), iteratePhase2() = phase2 (4)', `p1=${p1Cells.length} p2=${p2Cells.length}`);

	const p1Tagged = p1Cells.every((c) => c.strategy.includes('#phase1:'));
	const p2Tagged = p2Cells.every((c) => c.strategy.includes('#phase2:'));
	record(p1Tagged && p2Tagged, 'escalating: cells tagged with phase in strategy label', `p1[0]=${p1Cells[0]?.strategy}`);

	const kindOk = escalating.kind === 'escalating';
	const topTag = escalating.strategy.startsWith('escalating(');
	record(kindOk && topTag, 'escalating: top-level kind + strategy label', `strategy=${escalating.strategy}`);
}

// ---------------------------------------------------------------------------
// 8. Sweep config errors
// ---------------------------------------------------------------------------

function checkSweepErrors(): void {
	expectSweepError(
		() =>
			createFullFactorialSweep({
				pnl: [],
				drawdown: [1],
				violation: [1],
				directionHit: [1],
				slippage: [1]
			}),
		'full-factorial: rejects empty dimension'
	);
	expectSweepError(
		() =>
			createFullFactorialSweep({
				pnl: [1, Number.NaN],
				drawdown: [1],
				violation: [1],
				directionHit: [1],
				slippage: [1]
			}),
		'full-factorial: rejects NaN in grid'
	);
	expectSweepError(
		() =>
			createLatinHypercubeSweep(
				{
					pnl: [1, 2],
					drawdown: [1, 2],
					violation: [1, 2],
					directionHit: [1, 2],
					slippage: [1, 2]
				},
				0
			),
		'latin-hypercube: rejects sampleCount = 0'
	);
	expectSweepError(
		() =>
			createLatinHypercubeSweep(
				{
					pnl: [5, 1], // hi < lo
					drawdown: [1, 2],
					violation: [1, 2],
					directionHit: [1, 2],
					slippage: [1, 2]
				},
				4
			),
		'latin-hypercube: rejects hi < lo range'
	);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): number {
	console.log('R4.4 schedule + sweep smoke gate');
	console.log('=================================');

	checkGeometric();
	checkLinear();
	checkEarlyStop();
	checkScheduleErrors();
	checkFullFactorial();
	checkLatinHypercube();
	checkEscalating();
	checkSweepErrors();

	let failed = 0;
	for (const line of lines) {
		console.log(line);
		if (line.startsWith('FAIL')) failed++;
	}
	console.log('---------------------------------');
	console.log(
		failed === 0
			? `All ${lines.length} R4.4 assertions passed.`
			: `${failed} of ${lines.length} R4.4 assertions FAILED.`
	);
	return failed === 0 ? 0 : 1;
}

process.exit(main());
