/**
 * E5 DB dataset source smoke test.
 *
 * Verifies `createDbDatasetSource` end-to-end without needing a live
 * Postgres. The source is designed around the same `QueryFn` DI
 * seam introduced in E4, so the smoke wires up an in-memory stub
 * that mimics the Postgres JSONB → JS-object conversion `pg`
 * performs by default.
 *
 * Assertions (12):
 *   1. `prepareDbSelectV2` produces a SELECT containing the v2
 *      column list and the canonical `verdict_block IS NOT NULL`
 *      filter.
 *   2. Symbol filter adds the `(context_features->>'symbol')`
 *      predicate at the next placeholder.
 *   3. since/until filters add `created_at` bounds at successive
 *      placeholders.
 *   4. limit always lands at the final placeholder.
 *   5. Config validation rejects non-integer / out-of-range limits.
 *   6. Config validation rejects an empty symbol string.
 *   7. Config validation rejects an unparseable `since` string.
 *   8. `load()` returns zod-parsed `DecisionTrajectory[]` for every
 *      seeded row.
 *   9. The source preserves row order (ORDER BY created_at ASC).
 *  10. `load()` filters out a row whose `verdict_block` is null
 *      (the stub honours the SQL filter the same way Postgres does).
 *  11. `describe()` carries the configured filter parameters.
 *  12. Empty result set returns `[]` without throwing — the runner's
 *      `assertTrajectoriesWellFormed` is what raises on empty input,
 *      not the source.
 *
 * Run:
 *   npm run research:e5-db-source-smoke
 */

import {
	createDbDatasetSource,
	prepareDbSelectV2,
	DbDatasetSourceConfigError,
	DB_DATASET_SOURCE_MAX_LIMIT
} from '../../src/lib/research/source/db.ts';
import {
	prepareTrajectoryInsertV2,
	type QueryFn,
	type TrajectoryRowV2
} from '../../src/lib/server/journal/trajectoryWriter.ts';
import {
	DecisionTrajectorySchemaVersion,
	type DecisionTrajectory
} from '../../src/lib/contracts/trajectory.ts';
import {
	VerdictBlockSchemaVersion,
	parseVerdictBlock
} from '../../src/lib/contracts/verdict.ts';
import {
	VerdictBias,
	VerdictUrgency,
	StructureStateId
} from '../../src/lib/contracts/ids.ts';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function buildTrajectory(overrides: {
	id: string;
	traceId: string;
	createdAt: string;
	symbol?: string;
	pnlBps?: number;
}): DecisionTrajectory {
	const symbol = overrides.symbol ?? 'BTCUSDT';
	const verdict = parseVerdictBlock({
		schema_version: VerdictBlockSchemaVersion,
		trace_id: overrides.traceId,
		symbol,
		primary_timeframe: '4h',
		bias: VerdictBias.STRONG_BULL,
		structure_state: StructureStateId.ACC_PHASE_C,
		confidence: 0.7,
		urgency: VerdictUrgency.HIGH,
		top_reasons: [
			{
				text: 'fixture top reason',
				event_ids: [],
				direction: 'bull',
				severity: 'medium'
			}
		],
		counter_reasons: [],
		invalidation: {
			price_level: 50_000,
			direction: 'below',
			breaking_events: [],
			note: null
		},
		execution: {
			entry_zone: null,
			stop: null,
			targets: [],
			rr_reference: null
		},
		data_freshness: {
			as_of: overrides.createdAt,
			max_raw_age_ms: 0,
			stale_sources: [],
			is_stale: false
		},
		legacy_alpha_score: null
	});
	return {
		schema_version: DecisionTrajectorySchemaVersion,
		id: overrides.id,
		trace_id: overrides.traceId,
		created_at: overrides.createdAt,
		symbol,
		primary_timeframe: '4h',
		regime: 'trend',
		verdict_block: verdict,
		decision: {
			actor: { kind: 'agent', id: 'fixture-agent', policy_version: null },
			action: 'open_long',
			size_pct: 1,
			leverage: 1,
			stop_price: null,
			tp_prices: [],
			note: null
		},
		outcome: {
			resolved: true,
			resolved_at: overrides.createdAt,
			pnl_bps: overrides.pnlBps ?? 10,
			max_favorable_bps: 20,
			max_adverse_bps: 5,
			tp_hit_index: null,
			stop_hit: null,
			structure_state_after: null,
			utility_score: null,
			rule_violation_count: 0,
			p0_violation: false
		},
		feature_completeness: 1
	};
}

// ---------------------------------------------------------------------------
// In-memory stub. Models the v2 columns + the WHERE filter so the
// SELECT path returns the same rows the prepared SQL would return
// against a real Postgres.
// ---------------------------------------------------------------------------

interface StubRow extends TrajectoryRowV2 {
	// Mark some rows as "missing verdict_block" so the filter test has
	// data to drop. The stub keeps these in the table but excludes
	// them from any SELECT that filters on `verdict_block IS NOT NULL`.
	_verdictNull?: boolean;
	_outcomeNull?: boolean;
}

function createStub(rows: StubRow[]): {
	query: QueryFn;
	calls: { sql: string; params: readonly unknown[] }[];
} {
	const calls: { sql: string; params: readonly unknown[] }[] = [];
	const query: QueryFn = async (sql, params = []) => {
		calls.push({ sql, params });
		const trimmed = sql.trim().toUpperCase();
		if (!trimmed.startsWith('SELECT')) {
			throw new Error(`stub only handles SELECT, got ${sql.slice(0, 30)}`);
		}

		// Honour `verdict_block IS NOT NULL AND outcome_features IS NOT NULL`
		let filtered = rows.filter((r) => !r._verdictNull && !r._outcomeNull);

		// Honour optional symbol filter — placeholder rule: any param of
		// type string that's not an ISO timestamp and not a number-as-string
		// is treated as the symbol filter for stub purposes.
		const stringParams = (params as unknown[]).filter(
			(p): p is string =>
				typeof p === 'string' &&
				!/^\d{4}-\d{2}-\d{2}T/.test(p) &&
				Number.isNaN(Number(p))
		);
		if (stringParams.length > 0) {
			const symbolFilter = stringParams[0];
			filtered = filtered.filter((r) => {
				const ctx = r.context_features as Record<string, unknown> | null;
				return ctx !== null && ctx.symbol === symbolFilter;
			});
		}

		// Honour ISO-bound filters (since/until). Lower bound first, upper bound second.
		const isoParams = (params as unknown[]).filter(
			(p): p is string => typeof p === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(p)
		);
		if (isoParams.length >= 1) {
			filtered = filtered.filter((r) => String(r.created_at) >= isoParams[0]);
		}
		if (isoParams.length >= 2) {
			filtered = filtered.filter((r) => String(r.created_at) <= isoParams[1]);
		}

		// ORDER BY created_at ASC
		filtered = filtered
			.slice()
			.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));

		// LIMIT — last numeric parameter
		const numericParams = (params as unknown[]).filter(
			(p): p is number => typeof p === 'number'
		);
		if (numericParams.length > 0) {
			filtered = filtered.slice(0, numericParams[numericParams.length - 1]);
		}

		// @ts-expect-error stub returns a result-like
		return { rows: filtered };
	};
	return { query, calls };
}

// Convert a (validated) DecisionTrajectory into the same row shape
// the real `pg` driver would deliver from a SELECT against the v2
// columns. Reuses `prepareTrajectoryInsertV2` for round-trip
// fidelity with the writer.
function trajectoryToRow(traj: DecisionTrajectory): StubRow {
	const { values } = prepareTrajectoryInsertV2(traj);
	// values: [trajectory_id, trace_id, contextJson, decisionJson,
	//          outcomeJson, utility, verdictJson, schemaVersion, createdAt]
	return {
		trajectory_id: String(values[0]),
		trace_id: String(values[1]),
		created_at: String(values[8]),
		context_features: JSON.parse(String(values[2])),
		decision_features: JSON.parse(String(values[3])),
		outcome_features: JSON.parse(String(values[4])),
		verdict_block: JSON.parse(String(values[6])),
		schema_version: String(values[7])
	};
}

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------

const lines: string[] = [];
function record(ok: boolean, name: string, detail = ''): void {
	lines.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  →  ' + detail : ''}`);
}

const baseQuery: QueryFn = async () => ({ rows: [] });

// 1. Base SELECT shape
function checkBaseSelect(): void {
	const { sql, params } = prepareDbSelectV2({ query: baseQuery, limit: 100 });
	const ok =
		sql.includes('SELECT') &&
		sql.includes('FROM decision_trajectories') &&
		sql.includes('verdict_block IS NOT NULL') &&
		sql.includes('outcome_features IS NOT NULL') &&
		sql.includes('ORDER BY created_at ASC') &&
		sql.includes('trajectory_id') &&
		sql.includes('schema_version') &&
		params.length === 1 &&
		params[0] === 100;
	record(ok, 'prepareDbSelectV2: base SELECT shape + filter + limit param');
}

// 2. Symbol filter placeholder
function checkSymbolFilter(): void {
	const { sql, params } = prepareDbSelectV2({
		query: baseQuery,
		limit: 50,
		symbol: 'BTCUSDT'
	});
	const ok =
		sql.includes("(context_features->>'symbol') = $1") &&
		params[0] === 'BTCUSDT' &&
		params[1] === 50;
	record(ok, 'symbol filter: predicate at $1, limit at $2');
}

// 3. since/until filter placeholders
function checkBoundFilters(): void {
	const { sql, params } = prepareDbSelectV2({
		query: baseQuery,
		limit: 25,
		since: '2026-01-01T00:00:00Z',
		until: '2026-02-01T00:00:00Z'
	});
	const ok =
		sql.includes('created_at >= $1::timestamptz') &&
		sql.includes('created_at <= $2::timestamptz') &&
		params.length === 3 &&
		params[2] === 25;
	record(ok, 'since+until: bounds at $1/$2, limit at $3');
}

// 4. limit always lands at the final placeholder
function checkLimitFinal(): void {
	const { sql, params } = prepareDbSelectV2({
		query: baseQuery,
		limit: 7,
		symbol: 'ETHUSDT',
		since: '2026-03-01T00:00:00Z'
	});
	const ok = sql.endsWith(`LIMIT $${params.length}\n\t`) || sql.includes(`LIMIT $${params.length}`);
	record(ok, 'limit always lands at final placeholder', `params=${params.length}`);
}

// 5. limit validation
function checkLimitValidation(): void {
	let threwBelow = false;
	let threwAbove = false;
	let threwFloat = false;
	try {
		prepareDbSelectV2({ query: baseQuery, limit: 0 });
	} catch (err) {
		threwBelow = err instanceof DbDatasetSourceConfigError;
	}
	try {
		prepareDbSelectV2({ query: baseQuery, limit: DB_DATASET_SOURCE_MAX_LIMIT + 1 });
	} catch (err) {
		threwAbove = err instanceof DbDatasetSourceConfigError;
	}
	try {
		prepareDbSelectV2({ query: baseQuery, limit: 3.5 });
	} catch (err) {
		threwFloat = err instanceof DbDatasetSourceConfigError;
	}
	record(threwBelow && threwAbove && threwFloat, 'limit validation rejects 0 / >max / float');
}

// 6. Empty symbol rejected
function checkEmptySymbol(): void {
	let threw = false;
	try {
		prepareDbSelectV2({ query: baseQuery, limit: 10, symbol: '' });
	} catch (err) {
		threw = err instanceof DbDatasetSourceConfigError;
	}
	record(threw, 'empty symbol rejected');
}

// 7. Bad since rejected
function checkBadSince(): void {
	let threw = false;
	try {
		prepareDbSelectV2({ query: baseQuery, limit: 10, since: 'not-a-date' });
	} catch (err) {
		threw = err instanceof DbDatasetSourceConfigError;
	}
	record(threw, 'unparseable since rejected');
}

// 8. load() returns zod-parsed trajectories
async function checkLoadReturnsTrajectories(): Promise<void> {
	const seeded = [
		buildTrajectory({
			id: '11111111-2222-4333-8444-555555555555',
			traceId: 't1',
			createdAt: '2026-01-01T00:00:00.000Z'
		}),
		buildTrajectory({
			id: '22222222-3333-4444-8555-666666666666',
			traceId: 't2',
			createdAt: '2026-01-02T00:00:00.000Z',
			pnlBps: -8
		})
	];
	const stub = createStub(seeded.map(trajectoryToRow));
	const source = createDbDatasetSource({ query: stub.query, limit: 10 });
	const loaded = await source.load();
	const ok =
		loaded.length === 2 &&
		loaded[0].schema_version === DecisionTrajectorySchemaVersion &&
		loaded[0].id === seeded[0].id &&
		loaded[1].id === seeded[1].id;
	record(ok, 'load(): returns zod-parsed trajectories', `n=${loaded.length}`);
}

// 9. ORDER BY created_at ASC preserved through round-trip
async function checkOrderPreserved(): Promise<void> {
	const seeded = [
		buildTrajectory({
			id: '00000000-0000-4000-8000-000000000003',
			traceId: 'late',
			createdAt: '2026-03-01T00:00:00.000Z'
		}),
		buildTrajectory({
			id: '00000000-0000-4000-8000-000000000001',
			traceId: 'early',
			createdAt: '2026-01-01T00:00:00.000Z'
		}),
		buildTrajectory({
			id: '00000000-0000-4000-8000-000000000002',
			traceId: 'mid',
			createdAt: '2026-02-01T00:00:00.000Z'
		})
	];
	const stub = createStub(seeded.map(trajectoryToRow));
	const source = createDbDatasetSource({ query: stub.query, limit: 10 });
	const loaded = await source.load();
	const ok =
		loaded.length === 3 &&
		loaded[0].trace_id === 'early' &&
		loaded[1].trace_id === 'mid' &&
		loaded[2].trace_id === 'late';
	record(ok, 'load(): ORDER BY created_at ASC preserved');
}

// 10. verdict_block-null rows filtered out
async function checkVerdictNullFiltered(): Promise<void> {
	const valid = trajectoryToRow(
		buildTrajectory({
			id: '99999999-0000-4000-8000-000000000001',
			traceId: 'real',
			createdAt: '2026-01-01T00:00:00.000Z'
		})
	);
	const ghost: StubRow = {
		...trajectoryToRow(
			buildTrajectory({
				id: '99999999-0000-4000-8000-000000000002',
				traceId: 'ghost',
				createdAt: '2026-01-02T00:00:00.000Z'
			})
		),
		_verdictNull: true
	};
	const stub = createStub([valid, ghost]);
	const source = createDbDatasetSource({ query: stub.query, limit: 10 });
	const loaded = await source.load();
	record(
		loaded.length === 1 && loaded[0].trace_id === 'real',
		'verdict_block IS NULL row filtered out',
		`got=${loaded.length}`
	);
}

// 11. describe() includes filter params
function checkDescribe(): void {
	const source = createDbDatasetSource({
		query: baseQuery,
		limit: 42,
		symbol: 'SOLUSDT',
		since: '2026-01-01T00:00:00Z'
	});
	const text = source.describe();
	const ok =
		text.includes('decision_trajectories') &&
		text.includes('limit=42') &&
		text.includes('symbol=SOLUSDT') &&
		text.includes('since=2026-01-01T00:00:00Z');
	record(ok, 'describe() carries filter params', text.slice(0, 80));
}

// 12. Empty result set returns []
async function checkEmptyResult(): Promise<void> {
	const stub = createStub([]);
	const source = createDbDatasetSource({ query: stub.query, limit: 10 });
	const loaded = await source.load();
	record(Array.isArray(loaded) && loaded.length === 0, 'empty SELECT result returns []');
}

async function main(): Promise<number> {
	console.log('E5 DB dataset source smoke gate');
	console.log('================================');

	checkBaseSelect();
	checkSymbolFilter();
	checkBoundFilters();
	checkLimitFinal();
	checkLimitValidation();
	checkEmptySymbol();
	checkBadSince();
	await checkLoadReturnsTrajectories();
	await checkOrderPreserved();
	await checkVerdictNullFiltered();
	checkDescribe();
	await checkEmptyResult();

	let failed = 0;
	for (const line of lines) {
		console.log(line);
		if (line.startsWith('FAIL')) failed++;
	}
	console.log('--------------------------------');
	console.log(
		failed === 0
			? `All ${lines.length} E5 assertions passed.`
			: `${failed} of ${lines.length} E5 assertions FAILED.`
	);
	return failed === 0 ? 0 : 1;
}

main().then((code) => process.exit(code));
