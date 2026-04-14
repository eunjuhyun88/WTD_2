/**
 * @deprecated — superseded by `temporalSplit.ts` (R4.1, 2026-04-11).
 *
 * The legacy index-count walk-forward splitter had four concrete leakage
 * holes documented during the R4.1 migration and preserved in the
 * canonical protocol / migration notes:
 *
 *   1. Ignored `outcome.resolved_at` — sort key was `created_at`, so
 *      slow-resolving labels could enter later "train" folds at times the
 *      label did not yet exist.
 *   2. No purge step — train rows resolving inside the fold cutoff
 *      leaked partially-observable labels.
 *   3. No embargo — test[0] started immediately after train[-1], so
 *      feature lookback windows bridged the train/test boundary.
 *   4. Integer-count windows — conflated regime density (200 rows in a
 *      quiet week vs. a volatile week are not comparable fold sizes).
 *
 * This file is kept only as a failing redirect. Any import of the old
 * symbol throws `R4_1_MIGRATION_ERROR` at call time, pointing the
 * developer at the replacement in `temporalSplit.ts`. The throw surface
 * guarantees that no downstream caller can accidentally call the leaking
 * splitter after the migration window.
 */

const MIGRATION_MESSAGE =
	'walkForward/* is removed as of R4.1 (2026-04-11). ' +
	"Use `temporalSplit` from '$lib/research' (or " +
	"'./temporalSplit' if inside `$lib/research/evaluation`). " +
	'See research/evals/rq-b-baseline-protocol.md and ' +
	'research/notes/local-research-loop.md for the current canonical path.';

/** @deprecated — throws. Use `temporalSplit` from `./temporalSplit`. */
export function walkForward(): never {
	throw new Error(MIGRATION_MESSAGE);
}

/** @deprecated — throws. Use `canProduceAnyFold` from `./temporalSplit`. */
export function countFolds(): never {
	throw new Error(MIGRATION_MESSAGE);
}

/** @deprecated — no longer has a runtime default. Use `DEFAULT_TEMPORAL_SPLIT`. */
export const DEFAULT_WALK_FORWARD = new Proxy(
	{},
	{
		get() {
			throw new Error(MIGRATION_MESSAGE);
		}
	}
) as Record<string, never>;

/** @deprecated — type-only, preserved for source-level migration traces. */
export type WalkForwardConfig = never;
