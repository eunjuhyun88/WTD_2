/**
 * E4 decision-journal writer smoke test.
 *
 * Verifies the `trajectoryWriter` module end-to-end without needing a
 * live Postgres. The writer is designed around a `QueryFn` that the
 * smoke fills with an in-memory stub; that stub captures the SQL and
 * parameters, simulates the round-trip through `JSONB` columns, and
 * returns rows on SELECT — which is exactly what the migration will
 * do once applied to a real database.
 *
 * Assertions (10):
 *   1. `prepareTrajectoryInsertV2` produces the expected parameter
 *      positions and column list.
 *   2. Zod validation rejects a row missing `trace_id` before any
 *      SQL is generated.
 *   3. `writeDecisionTrajectoryV2` invokes the query function with
 *      the prepared SQL + values exactly once.
 *   4. `readDecisionTrajectoryV2ById` SELECT targets the v2 filter
 *      (`verdict_block IS NOT NULL`).
 *   5. Full round-trip: insert → select → parse → shape-equal to
 *      the original row.
 *   6. Read-back returns `null` when no row is present.
 *   7. Round-trip preserves `verdict_block.trace_id`.
 *   8. Round-trip preserves `outcome.resolved = false` unresolved
 *      shape.
 *   9. Round-trip preserves `feature_completeness`.
 *  10. Round-trip preserves `decision.action` and `decision.size_pct`.
 *
 * Run:
 *   npm run research:e4-trajectory-writer-smoke
 */

import {
	DecisionTrajectorySchema,
	DecisionTrajectorySchemaVersion,
	type DecisionTrajectory
} from '../../src/lib/contracts/trajectory.ts';
import {
	VerdictBlockSchemaVersion,
	parseVerdictBlock,
	type VerdictBlock
} from '../../src/lib/contracts/verdict.ts';
import {
	VerdictBias,
	VerdictUrgency,
	StructureStateId
} from '../../src/lib/contracts/ids.ts';
import {
	prepareTrajectoryInsertV2,
	parseTrajectoryRowV2,
	writeDecisionTrajectoryV2,
	readDecisionTrajectoryV2ById,
	TRAJECTORY_V2_SELECT_COLUMNS,
	type QueryFn,
	type TrajectoryRowV2
} from '../../src/lib/server/journal/trajectoryWriter.ts';

// ---------------------------------------------------------------------------
// Fixtures — hand-crafted, minimal, zod-validated at construction
// ---------------------------------------------------------------------------

function buildVerdict(): VerdictBlock {
	return parseVerdictBlock({
		schema_version: VerdictBlockSchemaVersion,
		trace_id: 'e4-smoke-trace',
		symbol: 'BTCUSDT',
		primary_timeframe: '4h',
		bias: VerdictBias.STRONG_BULL,
		structure_state: StructureStateId.ACC_PHASE_C,
		confidence: 0.78,
		urgency: VerdictUrgency.HIGH,
		top_reasons: [
			{
				text: 'Funding flipped deeply negative into price uptrend',
				event_ids: ['event.flow.fr_extreme_negative'],
				direction: 'bull',
				severity: 'high'
			},
			{
				text: 'Wyckoff accumulation spring confirmed',
				event_ids: [],
				direction: 'bull',
				severity: 'medium'
			}
		],
		counter_reasons: [],
		invalidation: {
			price_level: 58_000,
			direction: 'below',
			breaking_events: [],
			note: 'below spring low'
		},
		execution: {
			entry_zone: { low: 60_500, high: 61_200, note: null },
			stop: 58_000,
			targets: [63_000, 66_000],
			rr_reference: 2.5
		},
		data_freshness: {
			as_of: '2026-04-11T12:00:00.000Z',
			max_raw_age_ms: 30_000,
			stale_sources: [],
			is_stale: false
		},
		legacy_alpha_score: 72
	});
}

function buildTrajectory(overrides: Partial<DecisionTrajectory> = {}): DecisionTrajectory {
	const verdict = buildVerdict();
	const base: DecisionTrajectory = {
		schema_version: DecisionTrajectorySchemaVersion,
		id: '11111111-2222-4333-8444-555555555555',
		trace_id: 'e4-smoke-trace',
		created_at: '2026-04-11T12:00:00.000Z',
		symbol: 'BTCUSDT',
		primary_timeframe: '4h',
		regime: 'trend',
		verdict_block: verdict,
		decision: {
			actor: { kind: 'agent', id: 'agent-e4', policy_version: 'policy-v1' },
			action: 'open_long',
			size_pct: 10,
			leverage: 3,
			stop_price: 58_000,
			tp_prices: [63_000, 66_000],
			note: 'E4 smoke entry'
		},
		outcome: {
			resolved: false,
			resolved_at: null,
			pnl_bps: null,
			max_favorable_bps: null,
			max_adverse_bps: null,
			tp_hit_index: null,
			stop_hit: null,
			structure_state_after: null,
			utility_score: null,
			rule_violation_count: null,
			p0_violation: null
		},
		feature_completeness: 0.82
	};
	// Re-parse to fail fast if the fixture drifts from the schema.
	return DecisionTrajectorySchema.parse({ ...base, ...overrides });
}

// ---------------------------------------------------------------------------
// In-memory Postgres stub
// ---------------------------------------------------------------------------
//
// The stub models the single `decision_trajectories` row by capturing
// every INSERT and serving SELECT-by-id. JSONB values are stringified
// on insert (matching what the real writer sends) and re-parsed on
// SELECT (matching what `pg` does with JSONB columns by default).

interface StubCall {
	sql: string;
	params: readonly unknown[];
}

interface StubTable {
	rows: Map<string, TrajectoryRowV2>;
}

function createStub(): {
	query: QueryFn;
	calls: StubCall[];
	table: StubTable;
} {
	const calls: StubCall[] = [];
	const table: StubTable = { rows: new Map() };

	const query: QueryFn = async (sql, params = []) => {
		calls.push({ sql, params });
		const trimmed = sql.trim().toUpperCase();
		if (trimmed.startsWith('INSERT INTO DECISION_TRAJECTORIES')) {
			// Column order produced by prepareTrajectoryInsertV2:
			// $1 trajectory_id, $2 trace_id, $3 context_features,
			// $4 decision_features, $5 outcome_features, $6 utility_score,
			// $7 verdict_block, $8 schema_version, $9 created_at
			const [
				trajectoryId,
				traceId,
				contextJson,
				decisionJson,
				outcomeJson,
				_utilityScore,
				verdictJson,
				schemaVersion,
				createdAt
			] = params;

			const row: TrajectoryRowV2 = {
				trajectory_id: String(trajectoryId),
				trace_id: String(traceId),
				created_at: String(createdAt),
				// `pg` returns JSONB as parsed JS values. The writer stringifies
				// on insert; the stub mirrors pg's inverse on select.
				context_features: JSON.parse(String(contextJson)),
				decision_features: JSON.parse(String(decisionJson)),
				outcome_features: JSON.parse(String(outcomeJson)),
				verdict_block: JSON.parse(String(verdictJson)),
				schema_version: schemaVersion == null ? null : String(schemaVersion)
			};
			table.rows.set(row.trajectory_id, row);
			// @ts-expect-error — stubbed query returns a result-like shape
			return { rows: [] };
		}
		if (trimmed.startsWith('SELECT')) {
			const id = String(params[0] ?? '');
			const row = table.rows.get(id);
			// @ts-expect-error — stubbed query returns a result-like shape
			return { rows: row ? [row] : [] };
		}
		throw new Error(`stub received unexpected SQL: ${sql.slice(0, 40)}...`);
	};

	return { query, calls, table };
}

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------

const lines: string[] = [];

function record(ok: boolean, name: string, detail = ''): void {
	lines.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  →  ' + detail : ''}`);
}

// 1. Insert parameter shape
function checkInsertShape(): void {
	const row = buildTrajectory();
	const { sql, values } = prepareTrajectoryInsertV2(row);
	const ok =
		sql.includes('INSERT INTO decision_trajectories') &&
		sql.includes('verdict_block') &&
		sql.includes('schema_version') &&
		sql.includes('$1::uuid') &&
		sql.includes('$9::timestamptz') &&
		values.length === 9 &&
		values[0] === row.id &&
		values[1] === row.trace_id &&
		typeof values[2] === 'string' && // stringified context
		typeof values[6] === 'string' && // stringified verdict_block
		values[7] === row.schema_version &&
		values[8] === row.created_at;
	record(ok, 'prepareTrajectoryInsertV2: shape + param positions', `values=${values.length}`);
}

// 2. Zod rejects a bad row before SQL generation
function checkZodRejection(): void {
	try {
		prepareTrajectoryInsertV2({
			...buildTrajectory(),
			// @ts-expect-error — intentionally invalid
			trace_id: ''
		});
		record(false, 'zod rejects empty trace_id', 'did not throw');
	} catch (err) {
		record(true, 'zod rejects empty trace_id', (err as Error).message.slice(0, 60));
	}
}

// 3. Writer dispatches exactly one query call on insert
async function checkWriterDispatch(): Promise<void> {
	const stub = createStub();
	const row = buildTrajectory();
	await writeDecisionTrajectoryV2(row, { query: stub.query });
	const ok =
		stub.calls.length === 1 &&
		stub.calls[0].sql.includes('INSERT INTO decision_trajectories') &&
		stub.calls[0].params.length === 9;
	record(ok, 'writeDecisionTrajectoryV2: single INSERT dispatch', `calls=${stub.calls.length}`);
}

// 4. Reader SELECT filters on verdict_block IS NOT NULL
async function checkReaderFilter(): Promise<void> {
	const stub = createStub();
	await readDecisionTrajectoryV2ById('11111111-2222-4333-8444-555555555555', {
		query: stub.query
	});
	const selectCall = stub.calls.find((c) => c.sql.trim().toUpperCase().startsWith('SELECT'));
	const ok =
		selectCall !== undefined &&
		selectCall.sql.includes('verdict_block IS NOT NULL') &&
		selectCall.sql.includes('trajectory_id') &&
		selectCall.sql.includes('schema_version');
	record(ok, 'readDecisionTrajectoryV2ById: filters verdict_block IS NOT NULL');
}

// 5. Full round-trip (insert → select → parse shape-equal)
async function checkRoundTrip(): Promise<void> {
	const stub = createStub();
	const original = buildTrajectory();
	await writeDecisionTrajectoryV2(original, { query: stub.query });
	const loaded = await readDecisionTrajectoryV2ById(original.id, { query: stub.query });
	const ok =
		loaded !== null &&
		loaded.id === original.id &&
		loaded.trace_id === original.trace_id &&
		loaded.schema_version === original.schema_version &&
		loaded.symbol === original.symbol &&
		loaded.primary_timeframe === original.primary_timeframe &&
		loaded.regime === original.regime &&
		loaded.feature_completeness === original.feature_completeness;
	record(ok, 'round-trip: insert → select → parse envelope-equal');
}

// 6. Missing row → null
async function checkMissingRowNull(): Promise<void> {
	const stub = createStub();
	const result = await readDecisionTrajectoryV2ById('99999999-0000-4000-8000-000000000000', {
		query: stub.query
	});
	record(result === null, 'readDecisionTrajectoryV2ById: missing row → null');
}

// 7. verdict_block.trace_id preserved
async function checkVerdictPreserved(): Promise<void> {
	const stub = createStub();
	const original = buildTrajectory();
	await writeDecisionTrajectoryV2(original, { query: stub.query });
	const loaded = await readDecisionTrajectoryV2ById(original.id, { query: stub.query });
	const ok =
		loaded !== null &&
		loaded.verdict_block.trace_id === original.verdict_block.trace_id &&
		loaded.verdict_block.bias === original.verdict_block.bias &&
		loaded.verdict_block.structure_state === original.verdict_block.structure_state &&
		loaded.verdict_block.confidence === original.verdict_block.confidence;
	record(ok, 'round-trip: verdict_block nested fields preserved');
}

// 8. Unresolved outcome shape preserved
async function checkOutcomeUnresolved(): Promise<void> {
	const stub = createStub();
	const original = buildTrajectory();
	await writeDecisionTrajectoryV2(original, { query: stub.query });
	const loaded = await readDecisionTrajectoryV2ById(original.id, { query: stub.query });
	const ok =
		loaded !== null &&
		loaded.outcome.resolved === false &&
		loaded.outcome.resolved_at === null &&
		loaded.outcome.pnl_bps === null &&
		loaded.outcome.utility_score === null;
	record(ok, 'round-trip: unresolved outcome shape preserved');
}

// 9. Feature completeness preserved
async function checkFeatureCompleteness(): Promise<void> {
	const stub = createStub();
	const original = buildTrajectory({ feature_completeness: 0.37 });
	await writeDecisionTrajectoryV2(original, { query: stub.query });
	const loaded = await readDecisionTrajectoryV2ById(original.id, { query: stub.query });
	record(
		loaded !== null && loaded.feature_completeness === 0.37,
		'round-trip: feature_completeness preserved',
		`loaded=${loaded?.feature_completeness}`
	);
}

// 10. Decision fields preserved
async function checkDecisionPreserved(): Promise<void> {
	const stub = createStub();
	const original = buildTrajectory();
	await writeDecisionTrajectoryV2(original, { query: stub.query });
	const loaded = await readDecisionTrajectoryV2ById(original.id, { query: stub.query });
	const ok =
		loaded !== null &&
		loaded.decision.action === 'open_long' &&
		loaded.decision.size_pct === 10 &&
		loaded.decision.leverage === 3 &&
		loaded.decision.stop_price === 58_000 &&
		loaded.decision.tp_prices.length === 2;
	record(ok, 'round-trip: decision fields preserved');
}

// 11. Select-columns constant matches reader SQL (guard against drift)
function checkSelectColumnsConstant(): void {
	const lower = TRAJECTORY_V2_SELECT_COLUMNS.toLowerCase();
	const ok =
		lower.includes('trajectory_id') &&
		lower.includes('verdict_block') &&
		lower.includes('schema_version') &&
		lower.includes('outcome_features') &&
		lower.includes('decision_features') &&
		lower.includes('context_features');
	record(ok, 'TRAJECTORY_V2_SELECT_COLUMNS: enumerates all v2 columns');
}

async function main(): Promise<number> {
	console.log('E4 trajectory writer smoke gate');
	console.log('===============================');

	checkInsertShape();
	checkZodRejection();
	await checkWriterDispatch();
	await checkReaderFilter();
	await checkRoundTrip();
	await checkMissingRowNull();
	await checkVerdictPreserved();
	await checkOutcomeUnresolved();
	await checkFeatureCompleteness();
	await checkDecisionPreserved();
	checkSelectColumnsConstant();

	let failed = 0;
	for (const line of lines) {
		console.log(line);
		if (line.startsWith('FAIL')) failed++;
	}
	console.log('-------------------------------');
	console.log(
		failed === 0
			? `All ${lines.length} E4 assertions passed.`
			: `${failed} of ${lines.length} E4 assertions FAILED.`
	);
	return failed === 0 ? 0 : 1;
}

main().then((code) => process.exit(code));
