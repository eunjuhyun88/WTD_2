/**
 * `createDbDatasetSource` — Postgres-backed `DatasetSource`. E5 of
 * the harness engine integration plan.
 *
 * Reads v2 decision trajectories from the `decision_trajectories`
 * table (extended in E4 with `verdict_block JSONB` + `schema_version
 * TEXT`) and exposes them through the same `DatasetSource` boundary
 * that `createSyntheticSource` (R4.5) uses, so any experiment can
 * swap one for the other without touching the runner.
 *
 * Design rules:
 *   - **DI seam, same as E4.** Caller injects a `QueryFn`. The source
 *     never imports `$lib/server/db` directly so the smoke can run
 *     under Node `--experimental-strip-types` against an in-memory
 *     stub. Server callers wire `pg.Pool.query` (or the `query`
 *     helper from `$lib/server/db`) at the call site.
 *   - **Reuse the E4 parser.** Each row goes through
 *     `parseTrajectoryRowV2` which is the canonical zod-validated
 *     reader for the v2 column shape. No row-shaping logic is
 *     duplicated here.
 *   - **Filter by `verdict_block IS NOT NULL AND outcome_features
 *     IS NOT NULL`** so legacy passport rows, unresolved v2 rows,
 *     and any other neighbour shapes never enter the research
 *     pipeline.
 *   - **Bounded by an explicit `limit`.** Required argument — there
 *     is no "load everything" mode, because the runner pulls the
 *     entire array into memory and the temporal splitter is O(N).
 *   - **Stable provenance** in `describe()` so the experiment report
 *     records exactly which filter window was queried.
 *   - **Readonly result.** The function returns a fresh array on
 *     every `load()` call, but the runner treats the array as
 *     immutable per `DatasetSource` contract.
 *
 * Reference:
 *   docs/exec-plans/active/harness-engine-integration-plan-2026-04-11.md §3 E5
 *   src/lib/server/journal/trajectoryWriter.ts (E4 parser + select columns)
 *   src/lib/research/pipeline/types.ts (DatasetSource interface)
 */

import {
	parseTrajectoryRowV2,
	TRAJECTORY_V2_SELECT_COLUMNS,
	type QueryFn,
	type TrajectoryRowV2
} from '../../server/journal/trajectoryWriter.ts';
import type { DatasetSource } from '../pipeline/types.ts';

// ---------------------------------------------------------------------------
// Config + error types
// ---------------------------------------------------------------------------

export interface DbDatasetSourceConfig {
	/**
	 * Injected query function. In production this is `pg.Pool.query`
	 * (or the `query` helper from `$lib/server/db`); in tests it is an
	 * in-memory stub matching the same `QueryFn` shape that the E4
	 * trajectory writer accepts.
	 */
	readonly query: QueryFn;

	/**
	 * Maximum number of rows to load. Required — the splitter is O(N)
	 * so the source must bound input size explicitly. Hard-capped at
	 * `MAX_LIMIT` to keep this layer from accidentally pulling the
	 * entire table.
	 */
	readonly limit: number;

	/**
	 * Optional symbol filter. When set, only rows whose
	 * `context_features->>'symbol'` matches are returned. The v2
	 * writer stores `symbol` inside `context_features` (E4 column
	 * reuse), so this is the canonical place to filter on it.
	 */
	readonly symbol?: string;

	/** Optional ISO-8601 lower bound on `created_at`. */
	readonly since?: string;

	/** Optional ISO-8601 upper bound on `created_at`. */
	readonly until?: string;

	/**
	 * Optional override of the source `id` and `describe()` text.
	 * Experiments use this to make the report's source-description
	 * line read like the experiment id rather than the generic
	 * default.
	 */
	readonly label?: string;
}

export class DbDatasetSourceConfigError extends Error {
	constructor(message: string) {
		super(`DbDatasetSourceConfigError: ${message}`);
		this.name = 'DbDatasetSourceConfigError';
	}
}

/** Hard upper bound on `limit` — keeps memory and runtime predictable. */
export const DB_DATASET_SOURCE_MAX_LIMIT = 50_000;

// ---------------------------------------------------------------------------
// Source factory
// ---------------------------------------------------------------------------

interface PreparedSelect {
	readonly sql: string;
	readonly params: readonly unknown[];
}

/**
 * Pure helper that builds the parameterised SELECT for a given
 * config. Exported so the smoke can assert SQL/param shape without
 * actually running the query.
 */
export function prepareDbSelectV2(config: DbDatasetSourceConfig): PreparedSelect {
	if (typeof config.query !== 'function') {
		throw new DbDatasetSourceConfigError('query must be a function');
	}
	if (
		!Number.isInteger(config.limit) ||
		config.limit < 1 ||
		config.limit > DB_DATASET_SOURCE_MAX_LIMIT
	) {
		throw new DbDatasetSourceConfigError(
			`limit must be an integer in [1, ${DB_DATASET_SOURCE_MAX_LIMIT}], got ${String(
				config.limit
			)}`
		);
	}
	if (config.symbol !== undefined && (typeof config.symbol !== 'string' || !config.symbol)) {
		throw new DbDatasetSourceConfigError(
			`symbol must be a non-empty string when provided, got ${String(config.symbol)}`
		);
	}
	for (const field of ['since', 'until'] as const) {
		const value = config[field];
		if (value === undefined) continue;
		if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
			throw new DbDatasetSourceConfigError(
				`${field} must be an ISO-8601 timestamp string when provided, got ${String(value)}`
			);
		}
	}

	const params: unknown[] = [];
	const conds: string[] = ['verdict_block IS NOT NULL', 'outcome_features IS NOT NULL'];

	if (config.symbol) {
		params.push(config.symbol);
		conds.push(`(context_features->>'symbol') = $${params.length}`);
	}
	if (config.since) {
		params.push(config.since);
		conds.push(`created_at >= $${params.length}::timestamptz`);
	}
	if (config.until) {
		params.push(config.until);
		conds.push(`created_at <= $${params.length}::timestamptz`);
	}

	params.push(config.limit);
	const limitParam = `$${params.length}`;

	const sql = `
		SELECT ${TRAJECTORY_V2_SELECT_COLUMNS}
		FROM decision_trajectories
		WHERE ${conds.join(' AND ')}
		ORDER BY created_at ASC
		LIMIT ${limitParam}
	`;

	return { sql, params };
}

/**
 * Build a `DatasetSource` that reads v2 decision trajectories from
 * Postgres on every `load()` call. The query is bounded, validated,
 * and zod-parsed; failures throw out of the source so the runner's
 * `assertTrajectoriesWellFormed` gate can never see partial data.
 */
export function createDbDatasetSource(config: DbDatasetSourceConfig): DatasetSource {
	const prepared = prepareDbSelectV2(config);

	const id =
		config.label ??
		`db.decision_trajectories.limit-${config.limit}` +
			(config.symbol ? `.symbol-${config.symbol}` : '');

	const describeText =
		config.label ??
		`decision_trajectories(limit=${config.limit}` +
			(config.symbol ? `, symbol=${config.symbol}` : '') +
			(config.since ? `, since=${config.since}` : '') +
			(config.until ? `, until=${config.until}` : '') +
			`)`;

	return {
		id,
		describe: () => describeText,
		load: async () => {
			const result = await config.query<TrajectoryRowV2>(prepared.sql, prepared.params);
			const out = new Array(result.rows.length);
			for (let i = 0; i < result.rows.length; i++) {
				out[i] = parseTrajectoryRowV2(result.rows[i] as TrajectoryRowV2);
			}
			return out;
		}
	};
}
