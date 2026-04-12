#!/usr/bin/env node
/**
 * Experiment Template — R4.5
 *
 * Working copy-and-edit template for running an experiment end-to-end
 * through the locked `$lib/research` pipeline. Copy this directory to
 * `scripts/research/experiments/<rq-id>-<slug>-<YYYY-MM-DD>/` and
 * edit the config block below. Everything else — split, integrity
 * assertions, report completeness — is enforced by the locked layer.
 *
 * Run (from repo root):
 *   node --experimental-strip-types --disable-warning=ExperimentalWarning \
 *     scripts/research/experiments/_template/experiment.mjs
 *
 * Or via the registered npm script:
 *   npm run research:r4-5-template
 *
 * Acceptance (§R4.5):
 *   - `runExperiment` runs end-to-end on the synthetic source
 *   - every fold carries the full 6/6 integrity assertion codes
 *   - the report is written to `docs/generated/research/report-<id>.md`
 *   - process exits 0
 *
 * Reference:
 *   docs/exec-plans/active/research-spine-2026-04-11.md §R4.5
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Import from the locked research library. Relative paths with explicit
// `.ts` extensions so `--experimental-strip-types` can resolve them.
// When you copy this template to a real experiment directory the depth
// stays the same (`scripts/research/experiments/<slug>/experiment.mjs`),
// so these relative paths need no adjustment.
import {
	runExperiment,
	defaultBaselineRegistry,
	BaselineId,
	ORPO_CANONICAL_WEIGHTS,
	createSyntheticSource
} from '../../../../src/lib/research/index.ts';

// ---------------------------------------------------------------------------
// Experiment config — EDIT THIS BLOCK WHEN YOU COPY THE TEMPLATE
// ---------------------------------------------------------------------------

const EXPERIMENT_ID = 'template-smoke-2026-04-11';

const config = {
	id: EXPERIMENT_ID,
	rq: 'RQ-B',
	seed: 2026,
	// Pull pre-registered baselines from the default registry. Copies of
	// this template that need a stochastic LLM baseline must construct it
	// explicitly and call `defaultBaselineRegistry.register(agent)` before
	// pulling it out, or include it directly in this array.
	agents: [
		defaultBaselineRegistry.get(BaselineId.RANDOM),
		defaultBaselineRegistry.get(BaselineId.RULE_BASED)
	],
	// Override the default temporal split so a ~60 day synthetic span
	// produces at least one fold. Real experiments on trajectory-store
	// data should usually use the locked defaults (omit splitOverride).
	splitOverride: {
		trainDurationFloor: 20 * 24 * 60 * 60 * 1000, // 20 days
		embargoDuration: 12 * 60 * 60 * 1000, // 12h
		testDuration: 5 * 24 * 60 * 60 * 1000, // 5 days
		purgeDuration: 12 * 60 * 60 * 1000, // 12h
		maxFolds: 3
	},
	utilityWeights: ORPO_CANONICAL_WEIGHTS
};

// 120 rows at 12h step = 60 days of synthetic span. That's enough
// runway for 2-3 folds under the override above, without the run
// growing into anything slow.
const source = createSyntheticSource({
	count: 120,
	seed: 2026,
	stepMs: 12 * 60 * 60 * 1000,
	label: `synthetic smoke source for ${EXPERIMENT_ID}`
});

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

function formatReport(report) {
	const lines = [];
	lines.push(`# Experiment report — ${report.config.id}`);
	lines.push('');
	lines.push(`- **RQ**: ${report.config.rq}`);
	lines.push(`- **Schema version**: ${report.reportSchemaVersion}`);
	lines.push(`- **Source**: ${report.sourceDescription}`);
	lines.push(`- **Trajectories loaded**: ${report.trajectoriesTotal}`);
	lines.push(`- **Folds built**: ${report.foldsBuilt}`);
	lines.push(`- **Run started**: ${report.runStartedAt}`);
	lines.push(`- **Run finished**: ${report.runFinishedAt}`);
	lines.push('');
	lines.push('## Folds');
	lines.push('');
	for (const entry of report.folds) {
		const fold = entry.fold;
		lines.push(
			`### Fold ${fold.foldIndex} — train ${fold.train.trajectories.length}, test ${fold.test.trajectories.length}`
		);
		lines.push('');
		lines.push(`- train window: ${fold.train.startAt} → ${fold.train.endAt}`);
		lines.push(`- test  window: ${fold.test.startAt} → ${fold.test.endAt}`);
		lines.push(
			`- integrity assertions ran: ${fold.integrity.assertionsRan.length}/6 (${fold.integrity.assertionsRan.join(', ')})`
		);
		lines.push('');
		lines.push('| Agent | Samples | Total utility | Mean utility |');
		lines.push('|---|---:|---:|---:|');
		for (const ar of entry.agentResults) {
			lines.push(
				`| \`${ar.agentId}\` | ${ar.sampleSize} | ${ar.totalUtility.toFixed(2)} | ${ar.meanUtility.toFixed(2)} |`
			);
		}
		lines.push('');
	}
	lines.push('## Acceptance checks');
	lines.push('');
	const integrityOk = report.folds.every(
		(f) => f.fold.integrity.assertionsRan.length === 6
	);
	const foldsOk = report.foldsBuilt > 0;
	const agentsOk = report.folds.every((f) => f.agentResults.length === config.agents.length);
	lines.push(`- foldsBuilt > 0: ${foldsOk ? 'PASS' : 'FAIL'}`);
	lines.push(`- every fold has 6/6 integrity codes: ${integrityOk ? 'PASS' : 'FAIL'}`);
	lines.push(
		`- every fold has ${config.agents.length} agent results: ${agentsOk ? 'PASS' : 'FAIL'}`
	);
	lines.push('');
	lines.push(`Generated by \`scripts/research/experiments/_template/experiment.mjs\`.`);
	lines.push('');
	return { text: lines.join('\n'), foldsOk, integrityOk, agentsOk };
}

async function main() {
	console.log(`[${EXPERIMENT_ID}] runExperiment start`);
	const report = await runExperiment(config, source);

	const __dirname = dirname(fileURLToPath(import.meta.url));
	const repoRoot = join(__dirname, '../../../..');
	const outDir = join(repoRoot, 'docs/generated/research');
	mkdirSync(outDir, { recursive: true });
	const outPath = join(outDir, `report-${EXPERIMENT_ID}.md`);

	const { text, foldsOk, integrityOk, agentsOk } = formatReport(report);
	writeFileSync(outPath, text);
	console.log(`[${EXPERIMENT_ID}] report written: ${outPath}`);
	console.log(`[${EXPERIMENT_ID}] folds=${report.foldsBuilt} traj=${report.trajectoriesTotal}`);

	if (!(foldsOk && integrityOk && agentsOk)) {
		console.error(`[${EXPERIMENT_ID}] acceptance FAILED`);
		return 1;
	}
	console.log(`[${EXPERIMENT_ID}] acceptance PASSED`);
	return 0;
}

process.exit(await main());
