#!/usr/bin/env node
/**
 * RQ-B Sample-Size Ladder Experiment — R4.6
 *
 * First real experiment through the R4.2 `runExperiment` boundary.
 * Confronts the pre-registered hypothesis recorded in
 * `research/experiments/rq-b-ladder-2026-04-11.md` and
 * `research/evals/rq-b-baseline-protocol.md`:
 *
 *   "The smallest N at which CI95(rule_based − random) excludes zero
 *    on jittered synthetic verdicts lies in N ∈ [50, 500]."
 *
 * Schedule: GeometricSchedule({ from: 50, to: 800, factor: 2 })
 *   → cells N ∈ {50, 100, 200, 400, 800}
 *
 * For each cell:
 *   1. Build a fresh synthetic source of size N (jittered resolveAt).
 *   2. Run `runExperiment` with Random + RuleBased agents.
 *   3. Pool per-trajectory utility across all folds.
 *   4. Pair rule vs random by trajectoryId.
 *   5. `pairedBootstrapCI` on the diff.
 *   6. Record {N, pairs, diffMean, ci95, pValue, significant}.
 *
 * Output: auto-generated markdown report at
 *   `docs/generated/research/report-rq-b-sample-size-2026-04-11.md`
 * The report states whether each success criterion passed, identifies
 * the first-significant-N, and labels the hypothesis supported /
 * falsified / inconclusive-within-range.
 *
 * Run:
 *   npm run research:rq-b-sample-size
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
	runExperiment,
	defaultBaselineRegistry,
	BaselineId,
	ORPO_CANONICAL_WEIGHTS,
	createSyntheticSource,
	createGeometricSchedule,
	pairedBootstrapCI
} from '../../../../src/lib/research/index.ts';

// ---------------------------------------------------------------------------
// Pre-registered parameters (must match the objective.md pre-registration)
// ---------------------------------------------------------------------------

const EXPERIMENT_ID = 'rq-b-sample-size-2026-04-11';
const EXPERIMENT_SEED = 2026;
const SOURCE_SEED = 2026;
const BOOTSTRAP_SEED = 7;

const HYPOTHESIS_BOUND = Object.freeze({ lower: 50, upper: 500 });

const SPLIT_OVERRIDE = Object.freeze({
	trainDurationFloor: 3 * 24 * 60 * 60 * 1000, // 3 days
	embargoDuration: 6 * 60 * 60 * 1000, // 6 hours
	testDuration: 1 * 24 * 60 * 60 * 1000, // 1 day
	purgeDuration: 6 * 60 * 60 * 1000, // 6 hours
	maxFolds: 10
});

const STEP_MS = 6 * 60 * 60 * 1000; // 6 hours between rows

const SCHEDULE = createGeometricSchedule({ from: 50, to: 800, factor: 2 });

// ---------------------------------------------------------------------------
// Cell runner
// ---------------------------------------------------------------------------

/**
 * Pool per-trajectory utility from a report for one agentId across all
 * folds. Returns the flat array in the order folds are stored (fold 0
 * first, then fold 1, …) and within each fold in the order decisions
 * were recorded.
 */
function poolAgentUtilities(report, agentId) {
	const out = [];
	for (const entry of report.folds) {
		const ar = entry.agentResults.find((r) => r.agentId === agentId);
		if (!ar) {
			throw new Error(
				`agent '${agentId}' missing from fold ${entry.fold.foldIndex} of cell ${report.config.id}`
			);
		}
		for (const d of ar.decisions) out.push(d.utility);
	}
	return out;
}

async function runCell(cell) {
	const N = cell.sampleSize;
	const source = createSyntheticSource({
		count: N,
		seed: SOURCE_SEED,
		stepMs: STEP_MS,
		resolveAtStrategy: 'jittered',
		label: `synthetic jittered N=${N} seed=${SOURCE_SEED}`
	});

	const agents = [
		defaultBaselineRegistry.get(BaselineId.RANDOM),
		defaultBaselineRegistry.get(BaselineId.RULE_BASED)
	];

	const config = {
		id: `${EXPERIMENT_ID}.N-${String(N).padStart(4, '0')}`,
		rq: 'RQ-B',
		seed: EXPERIMENT_SEED,
		agents,
		splitOverride: SPLIT_OVERRIDE,
		utilityWeights: ORPO_CANONICAL_WEIGHTS
	};

	const report = await runExperiment(config, source);

	// Decisions within a fold are emitted in test-trajectory order, which
	// is stable across agents because `runAgentOnFold` iterates the same
	// `fold.test.trajectories` array for every agent. Pooling in fold-then-
	// decision order therefore yields arrays that are positionally paired
	// by trajectoryId, which is what `pairedBootstrapCI` requires.
	const ruleUtilities = poolAgentUtilities(report, BaselineId.RULE_BASED);
	const randomUtilities = poolAgentUtilities(report, BaselineId.RANDOM);

	if (ruleUtilities.length !== randomUtilities.length) {
		throw new Error(
			`cell N=${N}: pooled length mismatch (rule=${ruleUtilities.length}, random=${randomUtilities.length})`
		);
	}
	if (ruleUtilities.length === 0) {
		return {
			N,
			sampleSize: cell.sampleSize,
			sequenceIndex: cell.sequenceIndex,
			trajectoriesLoaded: report.trajectoriesTotal,
			foldsBuilt: report.foldsBuilt,
			sampledPairs: 0,
			diffMean: null,
			ci95: null,
			pValue: null,
			significant: false,
			integrityOk: report.folds.every((f) => f.fold.integrity.assertionsRan.length === 6),
			skipped: true
		};
	}

	const ci = pairedBootstrapCI(ruleUtilities, randomUtilities, {
		iterations: 2000,
		seed: BOOTSTRAP_SEED ^ N,
		confidence: 0.95
	});
	const significant = ci.ci95[0] > 0 || ci.ci95[1] < 0;
	const integrityOk = report.folds.every(
		(f) => f.fold.integrity.assertionsRan.length === 6
	);

	return {
		N,
		sampleSize: cell.sampleSize,
		sequenceIndex: cell.sequenceIndex,
		trajectoriesLoaded: report.trajectoriesTotal,
		foldsBuilt: report.foldsBuilt,
		sampledPairs: ruleUtilities.length,
		diffMean: ci.diffMean,
		ci95: ci.ci95,
		pValue: ci.pValue,
		significant,
		integrityOk,
		skipped: false
	};
}

// ---------------------------------------------------------------------------
// Report generation
// ---------------------------------------------------------------------------

function formatResults(results) {
	const firstSignificant = results.find((r) => r.significant && !r.skipped);
	const firstSignificantN = firstSignificant ? firstSignificant.N : null;

	let hypothesisLabel;
	let hypothesisNote;
	if (firstSignificantN === null) {
		hypothesisLabel = 'INCONCLUSIVE within schedule';
		hypothesisNote =
			'No cell within the pre-registered schedule crossed the CI95-excludes-zero threshold. ' +
			'Either the signal is weaker than expected on this synthetic fixture, the split structure ' +
			'reduced effective sample size below the detectable range, or the test is too conservative.';
	} else if (
		firstSignificantN >= HYPOTHESIS_BOUND.lower &&
		firstSignificantN <= HYPOTHESIS_BOUND.upper
	) {
		hypothesisLabel = 'SUPPORTED';
		hypothesisNote =
			`First significant cell lies inside the pre-registered bound ` +
			`[${HYPOTHESIS_BOUND.lower}, ${HYPOTHESIS_BOUND.upper}]. H0 rejected at α=0.05.`;
	} else if (firstSignificantN < HYPOTHESIS_BOUND.lower) {
		hypothesisLabel = 'FALSIFIED (below lower bound)';
		hypothesisNote =
			`First significant cell crosses at N=${firstSignificantN}, below the pre-registered ` +
			`lower bound ${HYPOTHESIS_BOUND.lower}. The synthetic signal is stronger than the ` +
			`prior expected; the lower bound is rejected.`;
	} else {
		hypothesisLabel = 'FALSIFIED (above upper bound)';
		hypothesisNote =
			`First significant cell crosses at N=${firstSignificantN}, above the pre-registered ` +
			`upper bound ${HYPOTHESIS_BOUND.upper}. The synthetic signal is weaker than the ` +
			`prior expected; the upper bound is rejected.`;
	}

	const lines = [];
	lines.push(`# Experiment report — ${EXPERIMENT_ID}`);
	lines.push('');
	lines.push(`**RQ-B** — Sample-size ladder, first real experiment via R4.2 runExperiment.`);
	lines.push('');
	lines.push(
		`> ⚠️ This report is a synthetic-data run. It verifies the locked research library ` +
			`produces honest CI-based conclusions on a signal it is guaranteed to see. ` +
			`Numbers here apply only to the synthetic fixture and MUST NOT be cited as ` +
			`evidence about real markets.`
	);
	lines.push('');
	lines.push(`## Pre-registration`);
	lines.push('');
	lines.push(`- **Hypothesis**: first-significant-N ∈ [${HYPOTHESIS_BOUND.lower}, ${HYPOTHESIS_BOUND.upper}]`);
	lines.push(`- **Canonical experiment doc**: \`research/experiments/rq-b-ladder-2026-04-11.md\``);
	lines.push(`- **Canonical protocol doc**: \`research/evals/rq-b-baseline-protocol.md\``);
	lines.push(`- **Schedule**: \`${SCHEDULE.strategy}\``);
	lines.push(`- **Source seed**: ${SOURCE_SEED}`);
	lines.push(`- **Experiment seed**: ${EXPERIMENT_SEED}`);
	lines.push(`- **Bootstrap seed**: ${BOOTSTRAP_SEED}`);
	lines.push(`- **Bootstrap iterations**: 2000`);
	lines.push(`- **Confidence**: 95%`);
	lines.push('');
	lines.push(`## Schedule cells`);
	lines.push('');
	lines.push(`| N | Trajectories loaded | Folds | Pairs | diff mean | CI95 low | CI95 high | p-value | significant |`);
	lines.push(`|---:|---:|---:|---:|---:|---:|---:|---:|:---:|`);
	for (const r of results) {
		if (r.skipped) {
			lines.push(
				`| ${r.N} | ${r.trajectoriesLoaded} | ${r.foldsBuilt} | 0 | — | — | — | — | (no folds) |`
			);
			continue;
		}
		lines.push(
			`| ${r.N} | ${r.trajectoriesLoaded} | ${r.foldsBuilt} | ${r.sampledPairs} | ` +
				`${r.diffMean.toFixed(3)} | ${r.ci95[0].toFixed(3)} | ${r.ci95[1].toFixed(3)} | ` +
				`${r.pValue.toFixed(4)} | ${r.significant ? '**yes**' : 'no'} |`
		);
	}
	lines.push('');
	lines.push(`## Hypothesis confrontation`);
	lines.push('');
	lines.push(`**Result**: ${hypothesisLabel}`);
	lines.push('');
	lines.push(hypothesisNote);
	lines.push('');
	if (firstSignificantN !== null) {
		lines.push(`**First significant N**: ${firstSignificantN}`);
	} else {
		lines.push(`**First significant N**: none within the schedule.`);
	}
	lines.push('');
	lines.push(`## Known caveats (observed during this run)`);
	lines.push('');
	lines.push(
		`**Pooled-pair saturation**: the number of paired decisions (test rows) is ` +
			`bounded by \`maxFolds × testDuration / stepMs\` under the split used here. ` +
			`With \`maxFolds=10\`, \`testDuration=1d\`, \`stepMs=6h\` → 40 paired decisions ` +
			`is the cap, regardless of how large the input \`N\` is. This means cells ` +
			`N ≥ 100 in the table above share essentially the same CI because they share ` +
			`the same 40 test rows; the extra training trajectories don't produce extra ` +
			`test pairs. The hypothesis test is still honest, but the "ladder" framing ` +
			`only works up to the cap — past 100 trajectories in this configuration the ` +
			`experiment is measuring "same test set, more training" rather than "more ` +
			`test data".`);
	lines.push('');
	lines.push(
		`Follow-ups: experiments that genuinely want N-as-test-size should either ` +
			`(a) scale \`maxFolds\` with \`N\`, (b) widen \`testDuration\` with \`N\`, ` +
			`or (c) drop the walk-forward split entirely and use a single \`TestOnly\` ` +
			`slice. Filing as an open question for R4.7+.`
	);
	lines.push('');
	lines.push(`## Acceptance checks`);
	lines.push('');
	const allRan = results.every((r) => r.integrityOk);
	const allCompleted = results.every((r) => r.skipped || r.ci95 !== null);
	lines.push(
		`- Every cell produced folds with 6/6 integrity codes: ${allRan ? 'PASS' : 'FAIL'}`
	);
	lines.push(
		`- CI95 computed for every non-skipped cell: ${allCompleted ? 'PASS' : 'FAIL'}`
	);
	lines.push(
		`- First-significant-N identified or reported absent: ${firstSignificantN === null ? 'absent' : `N=${firstSignificantN}`}`
	);
	lines.push(
		`- Pre-registered bound confronted: ${hypothesisLabel}`
	);
	lines.push('');
	lines.push(`Generated by \`scripts/research/experiments/${EXPERIMENT_ID}/experiment.mjs\`.`);
	lines.push('');
	return {
		text: lines.join('\n'),
		firstSignificantN,
		hypothesisLabel,
		allRan,
		allCompleted
	};
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
	console.log(`[${EXPERIMENT_ID}] start`);
	const cells = Array.from(SCHEDULE.iterate(EXPERIMENT_SEED));
	console.log(`[${EXPERIMENT_ID}] schedule cells: ${cells.map((c) => c.sampleSize).join(', ')}`);

	const results = [];
	for (const cell of cells) {
		console.log(`[${EXPERIMENT_ID}] cell N=${cell.sampleSize} running`);
		const r = await runCell(cell);
		console.log(
			`[${EXPERIMENT_ID}] cell N=${cell.sampleSize} done: ` +
				`folds=${r.foldsBuilt} pairs=${r.sampledPairs} ` +
				(r.skipped
					? 'SKIPPED (no folds)'
					: `diffMean=${r.diffMean.toFixed(3)} ci95=[${r.ci95[0].toFixed(3)}, ${r.ci95[1].toFixed(3)}] sig=${r.significant}`)
		);
		results.push(r);
	}

	const __dirname = dirname(fileURLToPath(import.meta.url));
	const repoRoot = join(__dirname, '../../../..');
	const outDir = join(repoRoot, 'docs/generated/research');
	mkdirSync(outDir, { recursive: true });
	const outPath = join(outDir, `report-${EXPERIMENT_ID}.md`);

	const { text, firstSignificantN, hypothesisLabel, allRan, allCompleted } = formatResults(results);
	writeFileSync(outPath, text);
	console.log(`[${EXPERIMENT_ID}] report written: ${outPath}`);
	console.log(
		`[${EXPERIMENT_ID}] hypothesis=${hypothesisLabel} firstSigN=${firstSignificantN ?? 'none'}`
	);

	if (!(allRan && allCompleted)) {
		console.error(`[${EXPERIMENT_ID}] acceptance FAILED`);
		return 1;
	}
	console.log(`[${EXPERIMENT_ID}] acceptance PASSED`);
	return 0;
}

process.exit(await main());
