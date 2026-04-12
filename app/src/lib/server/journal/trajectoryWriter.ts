/**
 * `trajectoryWriter` — harness engine E4 decision-journal writer.
 *
 * This is the first writer anywhere in the codebase that persists a
 * zod-validated `DecisionTrajectory` (the v2 shape from
 * `src/lib/contracts/trajectory.ts`). It extends the existing
 * `decision_trajectories` table via the new `verdict_block` JSONB
 * column and the row-level `schema_version` TEXT column added by
 * migration `db/migrations/0011_verdict_block_jsonb.sql` (mirror:
 * `supabase/migrations/014_verdict_block_jsonb.sql`).
 *
 * Design rules:
 *   - **Pure core, impure edges.** All shape logic (insert param
 *     marshalling, read-back parsing) lives in exported pure
 *     functions so the E4 smoke can exercise a full round-trip
 *     without a live Postgres. The async writer/reader accept a
 *     `QueryFn` via dependency injection so server routes pass in
 *     `query` from `$lib/server/db` while tests pass an in-memory
 *     stub.
 *   - **Zod validation at the boundary.** Every write runs through
 *     `DecisionTrajectorySchema.parse`. Every read runs the row
 *     back through the same schema. Bad shapes fail loudly here,
 *     not deep inside the ORPO pair builder or the research spine.
 *   - **Additive only.** Does not touch `passportMlPipeline.ts` and
 *     does not assume the passport envelope fields (`user_id`,
 *     `source_event_id`, `inference_id`) are present. v2 rows
 *     leave those NULL; the migration relaxed their NOT NULL
 *     constraints.
 *   - **Legacy column reuse.** The v2 writer stores the nested
 *     `decision` object inside the existing `decision_features`
 *     column and the `outcome` object inside `outcome_features`.
 *     Market context (symbol / timeframe / regime / completeness /
 *     envelope schema version) goes into `context_features`. Only
 *     the nested `VerdictBlock` and the row-level schema version
 *     live in the new columns. This keeps the passport ORPO reader
 *     (`pairBuilder.ts`) compatible because it already filters by
 *     `user_id` and v2 rows have `user_id IS NULL`.
 *
 * References:
 *   docs/exec-plans/active/harness-engine-integration-plan-2026-04-11.md §3 E4
 *   docs/exec-plans/active/alpha-terminal-harness-engine-spec-2026-04-09.md §8
 *   src/lib/contracts/trajectory.ts
 */

import {
	DecisionTrajectorySchema,
	DecisionTrajectorySchemaVersion,
	type DecisionTrajectory
} from '../../contracts/trajectory.ts';

// ---------------------------------------------------------------------------
// Dependency injection shape — mirrors the subset of `pg.Pool.query` / the
// `query` helper in `$lib/server/db` that this writer actually uses.
// ---------------------------------------------------------------------------

export interface QueryResultLike<T> {
	rows: T[];
}

export type QueryFn = <T = Record<string, unknown>>(
	sql: string,
	params?: readonly unknown[]
) => Promise<QueryResultLike<T>>;

export interface TrajectoryWriterDeps {
	query: QueryFn;
}

// ---------------------------------------------------------------------------
// Pure helpers — insert shape
// ---------------------------------------------------------------------------

/** Parameterised INSERT statement. */
export interface TrajectoryInsert {
	sql: string;
	values: readonly unknown[];
}

/**
 * `ContextFeaturesV2` is the shape of the `context_features` JSONB
 * column as written by the v2 writer. Passport rows keep their own
 * free-form shape; the two are distinguished by the presence of the
 * sibling `verdict_block` column.
 */
export interface ContextFeaturesV2 {
	readonly symbol: string;
	readonly primary_timeframe: string;
	readonly regime: string;
	readonly feature_completeness: number;
	readonly envelope_schema_version: string;
}

/**
 * Build the INSERT SQL + values array for a v2 decision trajectory
 * row. Pure function — no I/O, no clock, no randomness. Re-parses
 * the row through zod so callers can rely on the writer as the
 * validation boundary.
 */
export function prepareTrajectoryInsertV2(row: DecisionTrajectory): TrajectoryInsert {
	const parsed = DecisionTrajectorySchema.parse(row);
	const context: ContextFeaturesV2 = {
		symbol: parsed.symbol,
		primary_timeframe: parsed.primary_timeframe,
		regime: parsed.regime,
		feature_completeness: parsed.feature_completeness,
		envelope_schema_version: parsed.schema_version
	};

	const utilityScore = parsed.outcome.utility_score;

	const values: readonly unknown[] = [
		parsed.id, // $1 trajectory_id
		parsed.trace_id, // $2 trace_id
		JSON.stringify(context), // $3 context_features
		JSON.stringify(parsed.decision), // $4 decision_features
		JSON.stringify(parsed.outcome), // $5 outcome_features
		Number.isFinite(utilityScore) ? utilityScore : null, // $6 utility_score
		JSON.stringify(parsed.verdict_block), // $7 verdict_block
		parsed.schema_version, // $8 schema_version
		parsed.created_at // $9 created_at
	];

	// Column order is explicit so the SQL is stable across refactors
	// and greppable from the smoke. `label_quality` is hard-coded to
	// 'pending' because v2 rows start unresolved; the outcome resolver
	// will flip them later. Passport-envelope columns (user_id,
	// source_event_id, inference_id) are intentionally omitted so they
	// default to NULL.
	const sql = `
		INSERT INTO decision_trajectories (
			trajectory_id,
			trace_id,
			context_features,
			decision_features,
			outcome_features,
			utility_score,
			verdict_block,
			schema_version,
			created_at,
			label_quality
		)
		VALUES (
			$1::uuid,
			$2::text,
			$3::jsonb,
			$4::jsonb,
			$5::jsonb,
			$6::numeric,
			$7::jsonb,
			$8::text,
			$9::timestamptz,
			'pending'
		)
	`;

	return { sql, values };
}

// ---------------------------------------------------------------------------
// Pure helpers — read shape
// ---------------------------------------------------------------------------

/** Raw row shape a v2 read-back query produces. */
export interface TrajectoryRowV2 {
	trajectory_id: string;
	trace_id: string;
	created_at: Date | string;
	context_features: unknown;
	decision_features: unknown;
	outcome_features: unknown;
	verdict_block: unknown;
	schema_version: string | null;
}

/**
 * `SELECT` projection used by the read-back helper. Kept as a module
 * constant so the smoke can assert the exact column list and the
 * research spine E5 DB source can reuse it verbatim.
 */
export const TRAJECTORY_V2_SELECT_COLUMNS = `
	trajectory_id,
	trace_id,
	created_at,
	context_features,
	decision_features,
	outcome_features,
	verdict_block,
	schema_version
`;

function toIsoTimestamp(value: Date | string): string {
	if (value instanceof Date) {
		return value.toISOString();
	}
	// pg may return a string if the connection configures timestamptz
	// parsing off. Accept both and let zod catch truly bad values.
	return String(value);
}

function asObject(value: unknown): Record<string, unknown> | null {
	if (value === null || value === undefined) return null;
	if (typeof value !== 'object') return null;
	if (Array.isArray(value)) return null;
	return value as Record<string, unknown>;
}

/**
 * Map a raw DB row back into a validated `DecisionTrajectory`. Pure
 * function — takes only the row, returns a parsed object, throws on
 * schema mismatch. The E5 research spine DB source will call this on
 * every row it yields.
 */
export function parseTrajectoryRowV2(row: TrajectoryRowV2): DecisionTrajectory {
	const context = asObject(row.context_features) ?? {};
	const symbol = typeof context.symbol === 'string' ? context.symbol : undefined;
	const primaryTimeframe =
		typeof context.primary_timeframe === 'string' ? context.primary_timeframe : undefined;
	const regime = typeof context.regime === 'string' ? context.regime : undefined;
	const featureCompleteness =
		typeof context.feature_completeness === 'number' ? context.feature_completeness : undefined;
	const envelopeSchemaVersion =
		typeof context.envelope_schema_version === 'string' ? context.envelope_schema_version : undefined;

	const envelope = {
		schema_version: row.schema_version ?? envelopeSchemaVersion ?? DecisionTrajectorySchemaVersion,
		id: row.trajectory_id,
		trace_id: row.trace_id,
		created_at: toIsoTimestamp(row.created_at),
		symbol,
		primary_timeframe: primaryTimeframe,
		regime,
		verdict_block: row.verdict_block,
		decision: row.decision_features,
		outcome: row.outcome_features,
		feature_completeness: featureCompleteness
	};

	return DecisionTrajectorySchema.parse(envelope);
}

// ---------------------------------------------------------------------------
// Async edges — thin wrappers around the injected query function
// ---------------------------------------------------------------------------

/**
 * Persist a v2 decision trajectory. Validates via zod, builds the
 * INSERT, hands it to the injected query function. Returns void.
 *
 * @example
 *   import { query } from '$lib/server/db';
 *   import { writeDecisionTrajectoryV2 } from '$lib/server/journal/trajectoryWriter';
 *   await writeDecisionTrajectoryV2(row, { query });
 */
export async function writeDecisionTrajectoryV2(
	row: DecisionTrajectory,
	deps: TrajectoryWriterDeps
): Promise<void> {
	const { sql, values } = prepareTrajectoryInsertV2(row);
	await deps.query(sql, values);
}

/**
 * Read back a v2 decision trajectory by `trajectory_id`. Filters on
 * `verdict_block IS NOT NULL` so legacy passport rows with the same
 * primary key space are never returned as v2 rows. Returns `null`
 * when no matching row exists.
 */
export async function readDecisionTrajectoryV2ById(
	id: string,
	deps: TrajectoryWriterDeps
): Promise<DecisionTrajectory | null> {
	const result = await deps.query<TrajectoryRowV2>(
		`
			SELECT ${TRAJECTORY_V2_SELECT_COLUMNS}
			FROM decision_trajectories
			WHERE trajectory_id = $1::uuid
			  AND verdict_block IS NOT NULL
			LIMIT 1
		`,
		[id]
	);
	if (result.rows.length === 0) return null;
	return parseTrajectoryRowV2(result.rows[0]);
}
