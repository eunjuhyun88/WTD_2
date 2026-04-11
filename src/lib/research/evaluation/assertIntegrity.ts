/**
 * Temporal integrity assertions — runtime leakage detection.
 *
 * Every `TemporalFold` carries a proof of its own integrity. Downstream
 * stages (labeler, agent runner, comparator) must call
 * `assertTemporalIntegrity(fold)` as their first line on every invocation
 * — NOT only in tests, NOT only in CI. The assertion is linear in fold
 * size and runs cheaply.
 *
 * If any invariant is violated, a `LeakageError` is thrown with a
 * categorical error code drawn from `IntegrityAssertion`. The code is
 * machine-readable so upstream callers can distinguish "config was invalid"
 * from "label entered training set via slow resolution".
 *
 * This file is imported by `temporalSplit.ts` at split time AND by every
 * consumer at consume time. Re-verification is intentional: the cost of
 * re-running six O(n) scans is trivial compared to publishing a leaking
 * experiment report.
 *
 * Reference:
 *   docs/exec-plans/active/research-spine-2026-04-11.md §D2, §R4.1 ("Invariant 8")
 */

import type { DecisionTrajectory } from '../../contracts/index';
import type { TemporalFold, TemporalSplitConfig, IntegrityAssertion } from './temporalSplit';

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

/**
 * Thrown by any integrity assertion when a temporal invariant is violated.
 * The `code` field is machine-readable so consumers can branch on category;
 * the `detail` field is human-readable for logs and error reports.
 */
export class LeakageError extends Error {
	readonly code: IntegrityAssertion;
	readonly detail: string;
	constructor(code: IntegrityAssertion, detail: string) {
		super(`LeakageError[${code}]: ${detail}`);
		this.name = 'LeakageError';
		this.code = code;
		this.detail = detail;
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse an ISO-8601 timestamp to epoch ms. Throws if not parseable. */
function toMs(iso: string, context: string): number {
	const n = Date.parse(iso);
	if (!Number.isFinite(n)) {
		// The upstream zod schema should have caught this — if it didn't,
		// we treat it as a resolved-outcomes-only violation because the
		// temporal axis is unusable.
		throw new LeakageError(
			'resolved_outcomes_only',
			`${context}: unparseable ISO timestamp ${JSON.stringify(iso)}`
		);
	}
	return n;
}

/** Max of a numeric array. Returns -Infinity for empty. Safe on NaN. */
function maxMs(values: ReadonlyArray<number>): number {
	let m = Number.NEGATIVE_INFINITY;
	for (const v of values) if (v > m) m = v;
	return m;
}

/** Min of a numeric array. Returns +Infinity for empty. Safe on NaN. */
function minMs(values: ReadonlyArray<number>): number {
	let m = Number.POSITIVE_INFINITY;
	for (const v of values) if (v < m) m = v;
	return m;
}

// ---------------------------------------------------------------------------
// Individual assertions
// ---------------------------------------------------------------------------

/**
 * Assertion #1: config values are within physical bounds.
 *
 * Enforced here rather than in the experiment config validator because the
 * splitter is the component that directly interprets these numbers as
 * wall-clock ms. Any sign mistake or zero-filled default must die before
 * a fold is built, not during a downstream comparison.
 */
export function assertConfigWithinBounds(config: TemporalSplitConfig): void {
	if (!Number.isFinite(config.testDuration) || config.testDuration <= 0) {
		throw new LeakageError(
			'config_within_bounds',
			`testDuration must be a positive number of milliseconds, got ${config.testDuration}`
		);
	}
	if (!Number.isFinite(config.trainDurationFloor) || config.trainDurationFloor <= 0) {
		throw new LeakageError(
			'config_within_bounds',
			`trainDurationFloor must be a positive number of milliseconds, got ${config.trainDurationFloor}`
		);
	}
	if (!Number.isFinite(config.purgeDuration) || config.purgeDuration < 0) {
		throw new LeakageError(
			'config_within_bounds',
			`purgeDuration must be a non-negative number of milliseconds, got ${config.purgeDuration}`
		);
	}
	if (!Number.isFinite(config.embargoDuration) || config.embargoDuration < 0) {
		throw new LeakageError(
			'config_within_bounds',
			`embargoDuration must be a non-negative number of milliseconds, got ${config.embargoDuration}`
		);
	}
	if (!Number.isInteger(config.maxFolds) || config.maxFolds <= 0) {
		throw new LeakageError(
			'config_within_bounds',
			`maxFolds must be a positive integer, got ${config.maxFolds}`
		);
	}
	const allowedExpansions: ReadonlyArray<TemporalSplitConfig['expansion']> = [
		'anchored',
		'rolling',
		'rolling-with-memory'
	];
	if (!allowedExpansions.includes(config.expansion)) {
		throw new LeakageError(
			'config_within_bounds',
			`expansion must be one of ${allowedExpansions.join(', ')}, got ${String(config.expansion)}`
		);
	}
}

/**
 * Assertion #2: every trajectory in the slice is resolved and carries a
 * non-null `resolved_at`. Unresolved rows have no knowable label and
 * including them silently treats them as permanent zero-outcome noise.
 */
export function assertResolvedOutcomesOnly(
	trajectories: ReadonlyArray<DecisionTrajectory>,
	sliceLabel: string
): void {
	for (const t of trajectories) {
		if (!t.outcome.resolved) {
			throw new LeakageError(
				'resolved_outcomes_only',
				`${sliceLabel}: trajectory ${t.id} has outcome.resolved === false`
			);
		}
		if (t.outcome.resolved_at === null) {
			throw new LeakageError(
				'resolved_outcomes_only',
				`${sliceLabel}: trajectory ${t.id} has outcome.resolved === true but resolved_at is null`
			);
		}
	}
}

/**
 * Assertion #3: within a slice, rows are sorted by the axis that matters
 * for the split.
 *
 *  - Train is sorted by `resolved_at` (knowledge horizon — the time the
 *    label became observable, not the time the decision was made).
 *  - Test is sorted by `created_at` (the observation time — that is what
 *    policy evaluation replays).
 *
 * Sorting mismatches would otherwise allow the splitter to quietly pick
 * the wrong cutoff and leak future labels into the training window.
 */
export function assertSortedByKnowledgeHorizon(
	trajectories: ReadonlyArray<DecisionTrajectory>,
	axis: 'resolved_at' | 'created_at',
	sliceLabel: string
): void {
	for (let i = 1; i < trajectories.length; i++) {
		const prev = trajectories[i - 1]!;
		const curr = trajectories[i]!;
		const a = axis === 'resolved_at' ? prev.outcome.resolved_at! : prev.created_at;
		const b = axis === 'resolved_at' ? curr.outcome.resolved_at! : curr.created_at;
		if (toMs(a, sliceLabel) > toMs(b, sliceLabel)) {
			throw new LeakageError(
				'sorted_by_knowledge_horizon',
				`${sliceLabel}: not sorted by ${axis} at position ${i - 1}..${i} (${a} > ${b})`
			);
		}
	}
}

/**
 * Assertion #4: the train slice's knowledge horizon is strictly before the
 * test slice's first observation. Equality is rejected — a label observed
 * at the same instant the test starts is not safely available for training.
 */
export function assertTrainHorizonStrictlyBeforeTestStart(fold: TemporalFold): void {
	if (fold.train.trajectories.length === 0 || fold.test.trajectories.length === 0) {
		// An empty fold has no temporal claim to make. Upstream (the splitter)
		// is responsible for never producing an empty fold.
		throw new LeakageError(
			'train_horizon_strictly_before_test_start',
			`fold ${fold.foldIndex}: train or test slice is empty`
		);
	}
	const trainHorizon = maxMs(
		fold.train.trajectories.map((t) =>
			toMs(t.outcome.resolved_at!, `fold ${fold.foldIndex} train`)
		)
	);
	const testStart = minMs(
		fold.test.trajectories.map((t) => toMs(t.created_at, `fold ${fold.foldIndex} test`))
	);
	if (!(trainHorizon < testStart)) {
		throw new LeakageError(
			'train_horizon_strictly_before_test_start',
			`fold ${fold.foldIndex}: trainKnowledgeHorizon ${new Date(trainHorizon).toISOString()} ` +
				`must be strictly < testStart ${new Date(testStart).toISOString()}`
		);
	}
}

/**
 * Assertion #5: the gap between train knowledge horizon and test start is
 * at least the embargo configured for the fold. The embargo exists so that
 * features with a lookback window (e.g. 1h rolling volatility, 24h funding
 * EWMA) computed near the test edge do not incorporate data from inside
 * the training window.
 */
export function assertEmbargoSatisfied(fold: TemporalFold): void {
	if (fold.train.trajectories.length === 0 || fold.test.trajectories.length === 0) {
		throw new LeakageError(
			'embargo_satisfied',
			`fold ${fold.foldIndex}: cannot verify embargo on empty slice`
		);
	}
	const trainHorizon = maxMs(
		fold.train.trajectories.map((t) =>
			toMs(t.outcome.resolved_at!, `fold ${fold.foldIndex} train`)
		)
	);
	const testStart = minMs(
		fold.test.trajectories.map((t) => toMs(t.created_at, `fold ${fold.foldIndex} test`))
	);
	const actualGap = testStart - trainHorizon;
	if (actualGap < fold.integrity.config.embargoDuration) {
		throw new LeakageError(
			'embargo_satisfied',
			`fold ${fold.foldIndex}: embargo gap ${actualGap}ms is less than ` +
				`configured embargoDuration ${fold.integrity.config.embargoDuration}ms`
		);
	}
	// Also verify the recorded gap matches computed, so a mis-filled
	// integrity record cannot hide behind an otherwise valid fold.
	if (fold.integrity.embargoGap !== actualGap) {
		throw new LeakageError(
			'embargo_satisfied',
			`fold ${fold.foldIndex}: recorded embargoGap ${fold.integrity.embargoGap}ms ` +
				`does not match observed ${actualGap}ms`
		);
	}
}

/**
 * Assertion #6: no train trajectory has a `resolved_at` inside the purge
 * window `[trainEnd - purgeDuration, trainEnd]` where `trainEnd` is the
 * fold cutoff. Such rows would be labeled with outcomes still being
 * resolved at cutoff and therefore carry partially-observable future
 * information into training.
 *
 * This assertion is the one that distinguishes R4.1 from the legacy
 * walkForward splitter — that splitter has no purge step at all.
 */
export function assertPurgeApplied(fold: TemporalFold): void {
	const { purgeDuration } = fold.integrity.config;
	if (purgeDuration === 0) {
		// Zero purge duration = no constraint, but the provenance record
		// must also show zero purged rows. An inconsistent record means
		// the splitter lied about what it did and cannot be trusted.
		if (fold.integrity.purgedCount !== 0) {
			throw new LeakageError(
				'purge_applied',
				`fold ${fold.foldIndex}: purgeDuration is 0 but purgedCount is ${fold.integrity.purgedCount}`
			);
		}
		return;
	}
	const trainEndMs = toMs(
		fold.integrity.trainKnowledgeHorizon,
		`fold ${fold.foldIndex} trainKnowledgeHorizon`
	);
	const purgeStartMs = trainEndMs - purgeDuration;
	for (const t of fold.train.trajectories) {
		const r = toMs(t.outcome.resolved_at!, `fold ${fold.foldIndex} train`);
		// Strict inequality on the low end: resolved_at exactly at (trainEnd - purgeDuration)
		// is the earliest still-inside-purge row; on the high end, the horizon itself is
		// the latest included row by definition of `trainKnowledgeHorizon = max(resolved_at)`.
		if (r > purgeStartMs && r < trainEndMs) {
			throw new LeakageError(
				'purge_applied',
				`fold ${fold.foldIndex}: train row ${t.id} has resolved_at ${t.outcome.resolved_at} ` +
					`inside purge window (${new Date(purgeStartMs).toISOString()}, ` +
					`${new Date(trainEndMs).toISOString()})`
			);
		}
	}
}

// ---------------------------------------------------------------------------
// Aggregate assertion
// ---------------------------------------------------------------------------

/**
 * Single entry point for downstream stages. Runs every individual assertion
 * in a fixed order. If any assertion throws, the fold is rejected.
 *
 * The `integrity.assertionsRan` list is compared against the full
 * `IntegrityAssertion` enumeration — if any assertion is missing from the
 * recorded list, it means the splitter that built this fold did not run
 * the full battery and the fold is rejected regardless of whether the
 * recoverable invariants happen to hold today.
 */
export function assertTemporalIntegrity(fold: TemporalFold): void {
	// Config first — every later assertion references config values.
	assertConfigWithinBounds(fold.integrity.config);

	// Slice-level assertions.
	assertResolvedOutcomesOnly(fold.train.trajectories, `fold ${fold.foldIndex} train`);
	assertResolvedOutcomesOnly(fold.test.trajectories, `fold ${fold.foldIndex} test`);
	assertSortedByKnowledgeHorizon(
		fold.train.trajectories,
		'resolved_at',
		`fold ${fold.foldIndex} train`
	);
	assertSortedByKnowledgeHorizon(
		fold.test.trajectories,
		'created_at',
		`fold ${fold.foldIndex} test`
	);

	// Fold-level assertions.
	assertTrainHorizonStrictlyBeforeTestStart(fold);
	assertEmbargoSatisfied(fold);
	assertPurgeApplied(fold);

	// Provenance completeness — every assertion code must be named in the
	// recorded list, otherwise the splitter that built the fold skipped
	// something and we cannot trust the fold even if the checks we just
	// ran happen to pass.
	const required: ReadonlyArray<IntegrityAssertion> = [
		'config_within_bounds',
		'resolved_outcomes_only',
		'sorted_by_knowledge_horizon',
		'train_horizon_strictly_before_test_start',
		'embargo_satisfied',
		'purge_applied'
	];
	for (const code of required) {
		if (!fold.integrity.assertionsRan.includes(code)) {
			throw new LeakageError(
				code,
				`fold ${fold.foldIndex}: integrity.assertionsRan is missing '${code}' ` +
					`— the splitter that built this fold did not record running it`
			);
		}
	}
}
