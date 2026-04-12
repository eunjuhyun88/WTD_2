/**
 * Synthetic `DatasetSource` — R4.5.
 *
 * Seed-driven generator of `DecisionTrajectory` rows that satisfies the
 * full zod schema end-to-end. Used by the experiment template and R4.6
 * to exercise the research pipeline without needing real trajectory
 * data.
 *
 * Design invariants:
 *   - All randomness is sourced from `mulberry32(seed)` so two runs on
 *     the same seed produce byte-identical output.
 *   - `created_at` is strictly monotonic. `resolved_at` is strictly
 *     greater than `created_at` for every row, so the temporal
 *     splitter's integrity assertions (D2) fire correctly.
 *   - Regimes cycle through `['trend', 'range', 'high_vol', 'unknown']`
 *     so the stratifier has something to slice.
 *   - Verdict `bias`, `confidence`, `urgency`, and `counter_reasons`
 *     are varied so `RuleBasedAgent(RuleSetV1_20260411)` produces both
 *     open and wait decisions, and the urgency amplifier path is
 *     exercised on some rows.
 *   - Outcomes include both positive and negative `pnl_bps` so the toy
 *     R4.2 utility scorer yields both winners and losers.
 *
 * Out of scope:
 *   - Realistic price dynamics or mark-to-market curves — this is a
 *     smoke generator, not a simulator. R6 (when real trajectory data
 *     is available) is where realism belongs.
 *   - Execution hints (`entry_zone`, `stop`, `targets`) — set to null /
 *     empty because the R4.2 runner ignores them.
 *
 * Reference:
 *   docs/exec-plans/active/research-spine-2026-04-11.md §R4.5
 */

import type { DecisionTrajectory } from '../../contracts/index.ts';
import { VerdictBias, VerdictUrgency, StructureStateId } from '../../contracts/ids.ts';
import { mulberry32 } from '../stats.ts';
import type { DatasetSource } from '../pipeline/types.ts';

/**
 * How `resolved_at` is derived from `created_at`.
 *
 * `'deterministic'` (default) — `resolved_at = created_at + stepMs`.
 * Reproducible and simple: every row's resolution time is strictly
 * one step after its creation, so consecutive rows' `resolved_at`
 * values are spaced exactly `stepMs` apart.
 *
 * `'jittered'` — `resolved_at = created_at + (0.5 + u) * stepMs` where
 * `u ~ Uniform[0, 1)` is drawn from the seeded RNG. Mimics real
 * trajectories whose resolution time depends on outcome-specific delay.
 * Before the R4.1 scheduled-end purge-window fix, this path could trip
 * `assertPurgeApplied` on the end-to-end pipeline with non-zero
 * `purgeDuration`. After the fix it's the realistic default for
 * real-data smoke runs.
 */
export type ResolveAtStrategy = 'deterministic' | 'jittered';

export interface SyntheticSourceConfig {
	/** Number of trajectories to generate. Must be a positive integer. */
	readonly count: number;
	/** Seed for `mulberry32`. Any finite integer. */
	readonly seed: number;
	/** Symbol to stamp into every row. Defaults to `'BTCUSDT'`. */
	readonly symbol?: string;
	/** ISO-8601 start of the `created_at` sequence. Defaults to `'2026-01-01T00:00:00Z'`. */
	readonly startAt?: string;
	/** Step between consecutive `created_at` values in ms. Defaults to 12h. */
	readonly stepMs?: number;
	/**
	 * How `resolved_at` is derived from `created_at`. Defaults to
	 * `'deterministic'` for backward compatibility with R4.5's original
	 * template run. Experiments that want realistic resolution-time
	 * variance (and to exercise the scheduled-end purge window fix)
	 * should pass `'jittered'`.
	 */
	readonly resolveAtStrategy?: ResolveAtStrategy;
	/**
	 * Label reported by `describe()`. Defaults to a derived string. Override
	 * when an experiment wants the provenance text to match its own id.
	 */
	readonly label?: string;
}

export class SyntheticSourceConfigError extends Error {
	constructor(message: string) {
		super(`SyntheticSourceConfigError: ${message}`);
		this.name = 'SyntheticSourceConfigError';
	}
}

const DEFAULT_STEP_MS = 12 * 60 * 60 * 1000;
const DEFAULT_START_AT = '2026-01-01T00:00:00Z';
const DEFAULT_SYMBOL = 'BTCUSDT';

/**
 * Build a `DatasetSource` that generates `config.count` synthetic
 * trajectories on each `load()` call. The generator is deterministic
 * in `seed`, so calling `load()` twice returns the same sequence.
 */
export function createSyntheticSource(config: SyntheticSourceConfig): DatasetSource {
	if (!Number.isInteger(config.count) || config.count < 1) {
		throw new SyntheticSourceConfigError(
			`count must be a positive integer, got ${config.count}`
		);
	}
	if (typeof config.seed !== 'number' || !Number.isFinite(config.seed)) {
		throw new SyntheticSourceConfigError(
			`seed must be a finite number, got ${String(config.seed)}`
		);
	}
	if (config.stepMs !== undefined) {
		if (!Number.isFinite(config.stepMs) || config.stepMs <= 0) {
			throw new SyntheticSourceConfigError(
				`stepMs must be a positive finite number, got ${config.stepMs}`
			);
		}
	}

	const symbol = config.symbol ?? DEFAULT_SYMBOL;
	const startMs = Date.parse(config.startAt ?? DEFAULT_START_AT);
	if (!Number.isFinite(startMs)) {
		throw new SyntheticSourceConfigError(
			`startAt must parse to a finite epoch, got ${String(config.startAt)}`
		);
	}
	const stepMs = config.stepMs ?? DEFAULT_STEP_MS;
	const resolveAtStrategy: ResolveAtStrategy = config.resolveAtStrategy ?? 'deterministic';
	if (resolveAtStrategy !== 'deterministic' && resolveAtStrategy !== 'jittered') {
		throw new SyntheticSourceConfigError(
			`resolveAtStrategy must be 'deterministic' or 'jittered', got ${String(resolveAtStrategy)}`
		);
	}
	const id = `synthetic.${config.count}-${config.seed}`;
	const describeText =
		config.label ??
		`synthetic(count=${config.count}, seed=${config.seed}, symbol=${symbol}, stepMs=${stepMs}, resolveAt=${resolveAtStrategy})`;

	return {
		id,
		describe: () => describeText,
		load: async () =>
			generate(config.count, config.seed, symbol, startMs, stepMs, resolveAtStrategy)
	};
}

// ---------------------------------------------------------------------------
// Generator internals
// ---------------------------------------------------------------------------

const REGIMES = ['trend', 'range', 'high_vol', 'unknown'] as const;
const BIAS_CYCLE = [
	VerdictBias.STRONG_BULL,
	VerdictBias.BULL,
	VerdictBias.NEUTRAL,
	VerdictBias.BEAR,
	VerdictBias.STRONG_BEAR
];
const URGENCY_CYCLE = [VerdictUrgency.LOW, VerdictUrgency.MEDIUM, VerdictUrgency.HIGH];

function generate(
	count: number,
	seed: number,
	symbol: string,
	startMs: number,
	stepMs: number,
	resolveAtStrategy: ResolveAtStrategy
): DecisionTrajectory[] {
	const rng = mulberry32((seed ^ 0x51ed1a51) >>> 0);
	const out: DecisionTrajectory[] = [];

	for (let i = 0; i < count; i++) {
		const createdAtMs = startMs + i * stepMs;
		// Resolution time strategy:
		//   'deterministic' → exactly one step after creation
		//   'jittered'      → uniform in [0.5, 1.5) * stepMs after creation
		// Both satisfy `resolved_at > created_at`. Under the R4.1
		// scheduled-end purge window fix, both strategies also satisfy
		// `assertPurgeApplied` end-to-end, regardless of purgeDuration.
		const resolvedAtMs =
			resolveAtStrategy === 'deterministic'
				? createdAtMs + stepMs
				: createdAtMs + Math.floor((0.5 + rng()) * stepMs);

		const regime = REGIMES[i % REGIMES.length]!;
		const bias = BIAS_CYCLE[i % BIAS_CYCLE.length]!;
		const urgency = URGENCY_CYCLE[i % URGENCY_CYCLE.length]!;

		// Confidence in [0.50, 1.00], nudged so some cross the RuleSetV1
		// open floor (0.70) and fewer cross the amplifier floor (0.85).
		const confidence = Math.round((0.5 + rng() * 0.5) * 1000) / 1000;

		// 0..2 counter reasons — keeps the RuleSetV1 counter floor exercisable.
		const counterCount = Math.floor(rng() * 3);
		const counterReasons = Array.from({ length: counterCount }, (_, k) => ({
			text: `counter reason ${k + 1}`,
			event_ids: [] as string[],
			direction: 'bear' as const,
			severity: 'medium' as const
		}));

		const pnlSign =
			bias === VerdictBias.STRONG_BULL || bias === VerdictBias.BULL
				? 1
				: bias === VerdictBias.STRONG_BEAR || bias === VerdictBias.BEAR
					? -1
					: 0;
		const pnlBps = Math.round(pnlSign * 20 + (rng() - 0.5) * 60);

		const traceId = `synthetic.trace.${seed}.${i}`;
		const traj: DecisionTrajectory = {
			schema_version: 'decision_trajectory-v1',
			id: makeUuidFromRng(rng),
			trace_id: traceId,
			created_at: new Date(createdAtMs).toISOString(),
			symbol,
			primary_timeframe: '1h',
			regime,
			verdict_block: {
				schema_version: 'verdict_block-v1',
				trace_id: traceId,
				symbol,
				primary_timeframe: '1h',
				bias,
				structure_state: StructureStateId.ACC_PHASE_C,
				confidence,
				urgency,
				top_reasons: [
					{
						text: 'synthetic top reason',
						event_ids: [],
						direction:
							pnlSign > 0 ? 'bull' : pnlSign < 0 ? 'bear' : 'neutral',
						severity: 'medium'
					}
				],
				counter_reasons: counterReasons,
				invalidation: {
					price_level: 40000,
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
					as_of: new Date(createdAtMs).toISOString(),
					max_raw_age_ms: 0,
					stale_sources: [],
					is_stale: false
				},
				legacy_alpha_score: null
			},
			decision: {
				actor: { kind: 'user', id: 'synthetic-user', policy_version: null },
				action: pnlSign > 0 ? 'open_long' : pnlSign < 0 ? 'open_short' : 'wait',
				size_pct: pnlSign !== 0 ? 1 : null,
				leverage: pnlSign !== 0 ? 1 : null,
				stop_price: null,
				tp_prices: [],
				note: null
			},
			outcome: {
				resolved: true,
				resolved_at: new Date(resolvedAtMs).toISOString(),
				pnl_bps: pnlBps,
				max_favorable_bps: Math.abs(pnlBps) + 5,
				max_adverse_bps: Math.abs(pnlBps) / 2,
				tp_hit_index: null,
				stop_hit: null,
				structure_state_after: null,
				utility_score: null,
				rule_violation_count: 0,
				p0_violation: false
			},
			feature_completeness: 1
		};
		out.push(traj);
	}
	return out;
}

/**
 * Deterministic pseudo-UUIDv4 from a seeded RNG. The output matches
 * the `uuid` zod format (8-4-4-4-12 hex, version nibble `4`, variant
 * nibble in `{8,9,a,b}`). Not cryptographically random — this is for
 * synthetic test data only.
 */
function makeUuidFromRng(rng: () => number): string {
	const hex = () => Math.floor(rng() * 16).toString(16);
	const block = (n: number): string => {
		let s = '';
		for (let i = 0; i < n; i++) s += hex();
		return s;
	};
	const variantNibbles = ['8', '9', 'a', 'b'] as const;
	const variantFirst = variantNibbles[Math.floor(rng() * 4)]!;
	return `${block(8)}-${block(4)}-4${block(3)}-${variantFirst}${block(3)}-${block(12)}`;
}
