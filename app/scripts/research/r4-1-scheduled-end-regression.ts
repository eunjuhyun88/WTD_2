/**
 * R4.1 scheduled-end purge-window regression — end-to-end.
 *
 * This script exercises the full pipeline on synthetic data with
 * `resolveAtStrategy: 'jittered'` and a non-zero `purgeDuration`.
 * Before the R4.1 fix (scheduled-end purge window), this path could
 * trip `assertPurgeApplied` even though the splitter's own purge step
 * correctly dropped rows in `(scheduledTrainEnd - purgeDuration,
 * scheduledTrainEnd)`. After the fix the assertion uses
 * `scheduledTrainEnd` as its reference and the run completes cleanly.
 *
 * The regression check: run `runExperiment` end-to-end over jittered
 * synthetic data across multiple seeds and several purge durations,
 * and assert that every run produces folds with full 6/6 integrity
 * codes and no `LeakageError` surfaces.
 *
 * Run:
 *   npm run research:r4-1-scheduled-end-regression
 *
 * Reference:
 *   `research/evals/rq-b-baseline-protocol.md`
 */

import type { BaselineAgent } from '../../src/lib/research/baselines/types.ts';
import { createRandomAgent } from '../../src/lib/research/baselines/randomAgent.ts';
import { createRuleBasedAgent } from '../../src/lib/research/baselines/ruleBasedAgent.ts';
import { createSyntheticSource } from '../../src/lib/research/source/synthetic.ts';
import { runExperiment } from '../../src/lib/research/pipeline/runner.ts';
import type { ExperimentConfig } from '../../src/lib/research/pipeline/types.ts';
import { ORPO_CANONICAL_WEIGHTS } from '../../src/lib/research/evaluation/types.ts';

const DAY = 24 * 60 * 60 * 1000;

interface Scenario {
	readonly name: string;
	readonly seed: number;
	readonly count: number;
	readonly stepMs: number;
	readonly purgeDuration: number;
	readonly trainDurationFloor: number;
	readonly embargoDuration: number;
	readonly testDuration: number;
	readonly maxFolds: number;
}

const scenarios: Scenario[] = [
	{
		name: 'jittered 12h step, 12h purge, 3 folds — canonical R4.5 config',
		seed: 2026,
		count: 120,
		stepMs: 12 * 60 * 60 * 1000,
		purgeDuration: 12 * 60 * 60 * 1000,
		trainDurationFloor: 20 * DAY,
		embargoDuration: 12 * 60 * 60 * 1000,
		testDuration: 5 * DAY,
		maxFolds: 3
	},
	{
		name: 'jittered 12h step, 1-day purge, larger train floor',
		seed: 1337,
		count: 200,
		stepMs: 12 * 60 * 60 * 1000,
		purgeDuration: DAY,
		trainDurationFloor: 30 * DAY,
		embargoDuration: DAY,
		testDuration: 7 * DAY,
		maxFolds: 4
	},
	{
		name: 'jittered 1-day step, 2-day purge — wide spacing',
		seed: 42,
		count: 120,
		stepMs: DAY,
		purgeDuration: 2 * DAY,
		trainDurationFloor: 40 * DAY,
		embargoDuration: 2 * DAY,
		testDuration: 10 * DAY,
		maxFolds: 3
	},
	{
		name: 'jittered 6h step, 6h purge — dense cadence',
		seed: 0xbeef,
		count: 240,
		stepMs: 6 * 60 * 60 * 1000,
		purgeDuration: 6 * 60 * 60 * 1000,
		trainDurationFloor: 15 * DAY,
		embargoDuration: 6 * 60 * 60 * 1000,
		testDuration: 3 * DAY,
		maxFolds: 3
	}
];

async function runScenario(s: Scenario): Promise<string> {
	const agents: BaselineAgent[] = [createRandomAgent(), createRuleBasedAgent()];
	const config: ExperimentConfig = {
		id: `r4-1-regression.${s.seed}`,
		rq: 'RQ-B',
		seed: s.seed,
		agents,
		splitOverride: {
			trainDurationFloor: s.trainDurationFloor,
			embargoDuration: s.embargoDuration,
			testDuration: s.testDuration,
			purgeDuration: s.purgeDuration,
			maxFolds: s.maxFolds
		},
		utilityWeights: ORPO_CANONICAL_WEIGHTS
	};
	const source = createSyntheticSource({
		count: s.count,
		seed: s.seed,
		stepMs: s.stepMs,
		resolveAtStrategy: 'jittered'
	});

	try {
		const report = await runExperiment(config, source);

		if (report.foldsBuilt < 1) {
			return `FAIL  ${s.name}  →  no folds built`;
		}
		for (const entry of report.folds) {
			const codes = entry.fold.integrity.assertionsRan;
			if (codes.length !== 6) {
				return `FAIL  ${s.name}  →  fold ${entry.fold.foldIndex} has ${codes.length}/6 integrity codes`;
			}
			for (const ar of entry.agentResults) {
				if (ar.sampleSize <= 0) {
					return `FAIL  ${s.name}  →  fold ${entry.fold.foldIndex} agent ${ar.agentId} empty`;
				}
			}
		}
		return `PASS  ${s.name}  →  folds=${report.foldsBuilt} traj=${report.trajectoriesTotal}`;
	} catch (err) {
		const e = err as Error;
		return `FAIL  ${s.name}  →  ${e.name}: ${e.message}`;
	}
}

async function main(): Promise<number> {
	console.log('R4.1 scheduled-end purge-window regression gate');
	console.log('===============================================');

	const lines: string[] = [];
	for (const s of scenarios) {
		lines.push(await runScenario(s));
	}

	let failed = 0;
	for (const line of lines) {
		console.log(line);
		if (line.startsWith('FAIL')) failed++;
	}
	console.log('-----------------------------------------------');
	console.log(
		failed === 0
			? `All ${lines.length} regression scenarios passed.`
			: `${failed} of ${lines.length} regression scenarios FAILED.`
	);
	return failed === 0 ? 0 : 1;
}

process.exit(await main());
