/**
 * R4.3 baseline registry + RuleSetV1 smoke test.
 *
 * Acceptance for the current baseline-registry gate in
 * `research/evals/rq-b-baseline-protocol.md`:
 *
 *   1. `RuleBasedAgent.decide()` returns a concrete proposal matching
 *      the §D5 decision function — long open, short open, urgency
 *      amplifier, and wait fallbacks.
 *   2. `BaselineRegistry.register()` / `.get()` round-trip correctly,
 *      including `kind` tagging and duplicate-id rejection.
 *   3. `defaultBaselineRegistry` is pre-populated with the config-free
 *      R1 baselines (random, engine_only, rule_based, human) — exactly
 *      these four, tagged `'baseline'`, and `zero_shot_llm` is absent
 *      because it requires an explicit model + prompt.
 *
 * Run:
 *   npm run research:r4-3-smoke
 */

import type { VerdictBlock } from '../../src/lib/contracts/index.ts';
import { VerdictBias, VerdictUrgency, StructureStateId } from '../../src/lib/contracts/ids.ts';
import { BaselineId } from '../../src/lib/research/baselines/types.ts';
import {
	BaselineRegistry,
	BaselineRegistryError,
	defaultBaselineRegistry
} from '../../src/lib/research/baselines/registry.ts';
import { createRuleBasedAgent } from '../../src/lib/research/baselines/ruleBasedAgent.ts';
import { createRandomAgent } from '../../src/lib/research/baselines/randomAgent.ts';
import {
	RULE_SET_V1_20260411_VERSION,
	createRuleSetV1_20260411
} from '../../src/lib/research/baselines/ruleSetV1.ts';
// Side-effect import: populates `defaultBaselineRegistry` with the R1 defaults.
import '../../src/lib/research/index.ts';

// ---------------------------------------------------------------------------
// VerdictBlock factory — covers every branch the rule set inspects
// ---------------------------------------------------------------------------

function makeVerdict(overrides: Partial<VerdictBlock> = {}): VerdictBlock {
	const base: VerdictBlock = {
		schema_version: 'verdict_block-v1',
		trace_id: 'smoke-trace',
		symbol: 'BTCUSDT',
		primary_timeframe: '1h',
		bias: VerdictBias.STRONG_BULL,
		structure_state: StructureStateId.ACC_PHASE_C,
		confidence: 0.9,
		urgency: VerdictUrgency.HIGH,
		top_reasons: [],
		counter_reasons: [],
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
			as_of: '2026-04-11T00:00:00.000Z',
			max_raw_age_ms: 0,
			stale_sources: [],
			is_stale: false
		},
		legacy_alpha_score: null
	};
	return { ...base, ...overrides };
}

// ---------------------------------------------------------------------------
// Assertion helpers
// ---------------------------------------------------------------------------

const lines: string[] = [];

function record(ok: boolean, name: string, detail: string): void {
	lines.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  →  ' + detail : ''}`);
}

// ---------------------------------------------------------------------------
// 1. RuleSetV1 decision matrix
// ---------------------------------------------------------------------------

function checkRuleSetDecisions(): void {
	const agent = createRuleBasedAgent();

	// 1a. strong_bull, confidence 0.90, urgency high → amplified open_long.
	{
		const v = makeVerdict({
			bias: VerdictBias.STRONG_BULL,
			confidence: 0.9,
			urgency: VerdictUrgency.HIGH
		});
		const p = agent.decide({ verdict: v, context: {} });
		const ok =
			p.action === 'open_long' &&
			p.size_pct === 1.5 &&
			p.leverage === 2 &&
			typeof p.note === 'string' &&
			p.note.includes('amplified');
		record(
			ok,
			'ruleset: strong_bull+high+0.90 → amplified open_long',
			`action=${p.action} size=${p.size_pct} lev=${p.leverage}`
		);
	}

	// 1b. bear, confidence 0.75, urgency medium → base open_short.
	{
		const v = makeVerdict({
			bias: VerdictBias.BEAR,
			confidence: 0.75,
			urgency: VerdictUrgency.MEDIUM
		});
		const p = agent.decide({ verdict: v, context: {} });
		const ok =
			p.action === 'open_short' &&
			p.size_pct === 1.0 &&
			p.leverage === 1 &&
			typeof p.note === 'string' &&
			!p.note.includes('amplified');
		record(
			ok,
			'ruleset: bear+medium+0.75 → base open_short',
			`action=${p.action} size=${p.size_pct} lev=${p.leverage}`
		);
	}

	// 1c. strong_bull, high urgency, but confidence just under amplify floor
	//     (0.80 < 0.85) → base open_long, NOT amplified.
	{
		const v = makeVerdict({
			bias: VerdictBias.STRONG_BULL,
			confidence: 0.8,
			urgency: VerdictUrgency.HIGH
		});
		const p = agent.decide({ verdict: v, context: {} });
		const ok = p.action === 'open_long' && p.size_pct === 1.0 && p.leverage === 1;
		record(
			ok,
			'ruleset: strong_bull+high+0.80 → base open_long (below amplify floor)',
			`action=${p.action} size=${p.size_pct} lev=${p.leverage}`
		);
	}

	// 1d. bull, confidence 0.60 (below open floor) → wait.
	{
		const v = makeVerdict({
			bias: VerdictBias.BULL,
			confidence: 0.6,
			urgency: VerdictUrgency.LOW
		});
		const p = agent.decide({ verdict: v, context: {} });
		const ok = p.action === 'wait' && p.size_pct === null && p.leverage === null;
		record(
			ok,
			'ruleset: bull+low+0.60 → wait (below open floor)',
			`action=${p.action}`
		);
	}

	// 1e. bull, confidence 0.9, but 3 counter_reasons → wait.
	{
		const v = makeVerdict({
			bias: VerdictBias.BULL,
			confidence: 0.9,
			urgency: VerdictUrgency.MEDIUM,
			counter_reasons: [
				{ text: 'a', event_ids: [], direction: 'bear', severity: 'medium' },
				{ text: 'b', event_ids: [], direction: 'bear', severity: 'medium' },
				{ text: 'c', event_ids: [], direction: 'bear', severity: 'medium' }
			]
		});
		const p = agent.decide({ verdict: v, context: {} });
		const ok = p.action === 'wait';
		record(ok, 'ruleset: bull+0.9+counter=3 → wait (counter floor)', `action=${p.action}`);
	}

	// 1f. neutral bias → wait.
	{
		const v = makeVerdict({
			bias: VerdictBias.NEUTRAL,
			confidence: 0.99,
			urgency: VerdictUrgency.HIGH
		});
		const p = agent.decide({ verdict: v, context: {} });
		const ok = p.action === 'wait';
		record(ok, 'ruleset: neutral → wait regardless of confidence', `action=${p.action}`);
	}

	// 1g. Determinism: same verdict → same proposal twice.
	{
		const v = makeVerdict({
			bias: VerdictBias.STRONG_BEAR,
			confidence: 0.95,
			urgency: VerdictUrgency.HIGH
		});
		const p1 = agent.decide({ verdict: v, context: {} });
		const p2 = agent.decide({ verdict: v, context: {} });
		const ok =
			p1.action === p2.action &&
			p1.size_pct === p2.size_pct &&
			p1.leverage === p2.leverage &&
			p1.note === p2.note;
		record(ok, 'ruleset: deterministic under identical input', `action=${p1.action}`);
	}

	// 1h. Agent version string matches the rule set version.
	{
		const ok = agent.version === RULE_SET_V1_20260411_VERSION;
		record(ok, 'ruleset: agent.version === rule set version', `version=${agent.version}`);
	}

	// 1i. Threshold override tags version with `+override`.
	{
		const overridden = createRuleSetV1_20260411({ minConfidenceOpen: 0.6 });
		const ok = overridden.version.endsWith('+override');
		record(ok, 'ruleset: threshold override suffixes version with +override', `version=${overridden.version}`);
	}
}

// ---------------------------------------------------------------------------
// 2. BaselineRegistry round-trip
// ---------------------------------------------------------------------------

function checkRegistryRoundTrip(): void {
	const reg = new BaselineRegistry();
	const rnd = createRandomAgent();
	const rule = createRuleBasedAgent();

	reg.register(rnd, 'baseline');
	reg.register(rule, 'baseline');

	// 2a. get() round-trip.
	{
		const ok = reg.get(BaselineId.RANDOM) === rnd && reg.get(BaselineId.RULE_BASED) === rule;
		record(ok, 'registry: get() round-trip', `size=${reg.size()}`);
	}

	// 2b. listByKind returns both as baselines.
	{
		const baselines = reg.listByKind('baseline');
		const ok = baselines.length === 2 && baselines.includes(rnd) && baselines.includes(rule);
		record(ok, 'registry: listByKind(baseline) returns both', `count=${baselines.length}`);
	}

	// 2c. comparison_target lookup on a separate kind entry.
	{
		const target = createRandomAgent({ defaultSeed: 999 });
		// A comparison-target instance needs a distinct id; we forge one by
		// wrapping `rnd` at a different layer. Using a shadow class would be
		// over-engineering for a smoke test — instead we clear and re-register.
		const reg2 = new BaselineRegistry();
		reg2.register(target, 'comparison_target');
		const gotBaselines = reg2.listByKind('baseline').length;
		const gotTargets = reg2.listByKind('comparison_target').length;
		const ok = gotBaselines === 0 && gotTargets === 1 && reg2.getEntry(target.id).kind === 'comparison_target';
		record(ok, 'registry: kind separation (comparison_target)', `baselines=${gotBaselines} targets=${gotTargets}`);
	}

	// 2d. Duplicate id rejection with coded error.
	{
		let code: string | null = null;
		try {
			reg.register(rnd, 'baseline');
		} catch (err) {
			if (err instanceof BaselineRegistryError) code = err.code;
		}
		record(code === 'duplicate_id', 'registry: duplicate id rejected', `code=${code ?? '<none>'}`);
	}

	// 2e. Unknown id lookup with coded error.
	{
		let code: string | null = null;
		try {
			reg.get('baseline.does_not_exist');
		} catch (err) {
			if (err instanceof BaselineRegistryError) code = err.code;
		}
		record(code === 'unknown_id', 'registry: unknown id rejected', `code=${code ?? '<none>'}`);
	}

	// 2f. Invalid kind rejected.
	{
		let code: string | null = null;
		try {
			const reg3 = new BaselineRegistry();
			reg3.register(createRandomAgent(), 'nonsense' as 'baseline');
		} catch (err) {
			if (err instanceof BaselineRegistryError) code = err.code;
		}
		record(code === 'invalid_kind', 'registry: invalid kind rejected', `code=${code ?? '<none>'}`);
	}

	// 2g. Invalid agent (missing decide) rejected.
	{
		let code: string | null = null;
		try {
			const reg4 = new BaselineRegistry();
			reg4.register({ id: 'bogus', label: 'x', baselineId: 'x' } as unknown as Parameters<
				BaselineRegistry['register']
			>[0]);
		} catch (err) {
			if (err instanceof BaselineRegistryError) code = err.code;
		}
		record(code === 'invalid_agent', 'registry: invalid agent rejected', `code=${code ?? '<none>'}`);
	}
}

// ---------------------------------------------------------------------------
// 3. defaultBaselineRegistry pre-population
// ---------------------------------------------------------------------------

function checkDefaultRegistryPopulation(): void {
	const expected = new Set<string>([
		BaselineId.RANDOM,
		BaselineId.ENGINE_ONLY,
		BaselineId.RULE_BASED,
		BaselineId.HUMAN
	]);
	const ids = new Set(defaultBaselineRegistry.listIds());

	// 3a. All four expected ids present.
	{
		let allPresent = true;
		for (const id of expected) if (!ids.has(id)) allPresent = false;
		record(
			allPresent,
			'default registry: contains random, engine_only, rule_based, human',
			`ids=${Array.from(ids).join(',')}`
		);
	}

	// 3b. Exactly four — zero_shot_llm intentionally excluded.
	{
		const ok = defaultBaselineRegistry.size() === 4 && !ids.has(BaselineId.ZERO_SHOT_LLM);
		record(
			ok,
			'default registry: size=4, zero_shot_llm excluded',
			`size=${defaultBaselineRegistry.size()}`
		);
	}

	// 3c. All defaults tagged `baseline`.
	{
		const baselines = defaultBaselineRegistry.listByKind('baseline');
		const targets = defaultBaselineRegistry.listByKind('comparison_target');
		const ok = baselines.length === 4 && targets.length === 0;
		record(
			ok,
			'default registry: all defaults tagged baseline',
			`baselines=${baselines.length} targets=${targets.length}`
		);
	}

	// 3d. RuleBasedAgent instance in the default registry uses the pinned version.
	{
		const rule = defaultBaselineRegistry.get(BaselineId.RULE_BASED);
		const ok = rule.version === RULE_SET_V1_20260411_VERSION;
		record(
			ok,
			'default registry: rule_based uses pinned version',
			`version=${rule.version}`
		);
	}
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): number {
	console.log('R4.3 baseline registry + RuleSetV1 smoke gate');
	console.log('=============================================');

	checkRuleSetDecisions();
	checkRegistryRoundTrip();
	checkDefaultRegistryPopulation();

	let failed = 0;
	for (const line of lines) {
		console.log(line);
		if (line.startsWith('FAIL')) failed++;
	}
	console.log('---------------------------------------------');
	console.log(
		failed === 0
			? `All ${lines.length} R4.3 assertions passed.`
			: `${failed} of ${lines.length} R4.3 assertions FAILED.`
	);
	return failed === 0 ? 0 : 1;
}

process.exit(main());
