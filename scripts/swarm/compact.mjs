#!/usr/bin/env node
/**
 * scripts/swarm/compact.mjs — swarm-v1 worker context handoff primitive
 *
 * Replaces the earlier draft reference to Claude Code's DreamTask (which is
 * not reachable from a CHATBATTLE worker). Canonical spec lives in
 *   docs/exec-plans/active/swarm-v1-design-2026-04-11.md §15.
 *
 * Usage (from any running agent, invoked via Bash tool):
 *   node scripts/swarm/compact.mjs --slice <slice-id> --agent <agent-type> [--reason "..."]
 *
 * What it does (side-effect-only):
 *   1. Reads the slice brief      (.agent-context/briefs/<slice-id>.md)
 *   2. Reads the claim file       (.agent-context/ownership/<slice-id>.json)
 *   3. Reads the DAG entry        (docs/exec-plans/active/trunk-plan.dag.json)
 *   4. Reads the latest branch snapshot if one exists
 *      (.agent-context/snapshots/<branch>/*.md — most recent)
 *   5. Reads the tail of the event log
 *      (.agent-context/state/slices.jsonl — last 20 lines for this slice)
 *   6. Reads `git status -s` and `git diff --stat` for the owned paths
 *   7. Writes .agent-context/handoffs/<slice-id>.md — self-contained bundle
 *   8. Appends one telemetry record to
 *      .agent-context/state/worker-telemetry.jsonl
 *
 * What it does NOT do:
 *   - It does not kill the agent or modify any code.
 *   - It does not touch slices.jsonl (that's the normal lifecycle commands).
 *   - It does not make spawning / scheduling decisions.
 *
 * Exit codes:
 *   0 — handoff written (or slice not found but telemetry recorded)
 *   1 — usage error / missing args
 *   2 — hard IO error (permissions, disk full, etc.)
 *
 * Minimal by design. If you need more, read §15 and file B.6.
 */

import {
	readFileSync,
	writeFileSync,
	existsSync,
	mkdirSync,
	appendFileSync,
	readdirSync,
	statSync
} from 'node:fs';
import { join, resolve } from 'node:path';
import { execSync } from 'node:child_process';

// ---------------------------------------------------------------------------
// Paths (match scripts/slice/cli.mjs so both tools share the same layout)
// ---------------------------------------------------------------------------

const REPO_ROOT = (() => {
	try {
		return execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
	} catch {
		return process.cwd();
	}
})();

const DAG_PATH = join(REPO_ROOT, 'docs/exec-plans/active/trunk-plan.dag.json');
const STATE_DIR = join(REPO_ROOT, '.agent-context/state');
const OWNERSHIP_DIR = join(REPO_ROOT, '.agent-context/ownership');
const BRIEFS_DIR = join(REPO_ROOT, '.agent-context/briefs');
const HANDOFFS_DIR = join(REPO_ROOT, '.agent-context/handoffs');
const SNAPSHOTS_DIR = join(REPO_ROOT, '.agent-context/snapshots');

const SLICES_LOG = join(STATE_DIR, 'slices.jsonl');
const TELEMETRY_LOG = join(STATE_DIR, 'worker-telemetry.jsonl');

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function ensureDir(path) {
	if (!existsSync(path)) mkdirSync(path, { recursive: true });
}

function nowIso() {
	return new Date().toISOString();
}

function readJsonSafe(path, fallback) {
	try {
		return JSON.parse(readFileSync(path, 'utf8'));
	} catch {
		return fallback;
	}
}

function readTextSafe(path, fallback = '') {
	try {
		return readFileSync(path, 'utf8');
	} catch {
		return fallback;
	}
}

function parseArgs(argv) {
	const out = { slice: null, agent: null, reason: null };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === '--slice') out.slice = argv[++i];
		else if (a === '--agent') out.agent = argv[++i];
		else if (a === '--reason') out.reason = argv[++i];
	}
	return out;
}

function currentBranch() {
	try {
		return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
	} catch {
		return 'detached';
	}
}

function currentHeadShort() {
	try {
		return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
	} catch {
		return 'unknown';
	}
}

function gitStatusShort() {
	try {
		return execSync('git status --short', { encoding: 'utf8' }).trim();
	} catch {
		return '(git status failed)';
	}
}

function gitDiffStat(paths) {
	if (!paths || paths.length === 0) return '(no paths)';
	try {
		const quoted = paths.map((p) => `"${p}"`).join(' ');
		return execSync(`git diff --stat -- ${quoted}`, { encoding: 'utf8' }).trim() || '(clean)';
	} catch {
		return '(git diff failed)';
	}
}

function loadDagSlice(sliceId) {
	const dag = readJsonSafe(DAG_PATH, null);
	if (!dag || !Array.isArray(dag.slices)) return null;
	return dag.slices.find((s) => s.id === sliceId) ?? null;
}

function tailSlicesLog(sliceId, n = 20) {
	if (!existsSync(SLICES_LOG)) return [];
	const lines = readFileSync(SLICES_LOG, 'utf8').split('\n').filter(Boolean);
	const matched = [];
	for (const line of lines) {
		try {
			const event = JSON.parse(line);
			if (event.slice_id === sliceId) matched.push(event);
		} catch {
			/* ignore malformed line */
		}
	}
	return matched.slice(-n);
}

function latestBranchSnapshot(branch) {
	const safeBranch = branch.replace(/[^a-zA-Z0-9._-]/g, '-');
	const dir = join(SNAPSHOTS_DIR, safeBranch);
	if (!existsSync(dir)) return null;
	try {
		const entries = readdirSync(dir)
			.filter((f) => f.endsWith('.md'))
			.map((f) => {
				const full = join(dir, f);
				return { full, mtime: statSync(full).mtimeMs };
			})
			.sort((a, b) => b.mtime - a.mtime);
		return entries[0]?.full ?? null;
	} catch {
		return null;
	}
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const args = parseArgs(process.argv.slice(2));

if (!args.slice) {
	process.stderr.write(
		'usage: node scripts/swarm/compact.mjs --slice <slice-id> --agent <agent-type> [--reason "..."]\n'
	);
	process.exit(1);
}

const sliceId = args.slice;
const agentType = args.agent ?? 'unknown';
const reason = args.reason ?? 'soft budget reached; writing handoff for resume';
const branch = currentBranch();
const head = currentHeadShort();
const ts = nowIso();

const slice = loadDagSlice(sliceId);
const brief = readTextSafe(join(BRIEFS_DIR, `${sliceId}.md`), '(no brief file)');
const claim = readJsonSafe(join(OWNERSHIP_DIR, `${sliceId}.json`), null);
const events = tailSlicesLog(sliceId, 20);
const snapshotPath = latestBranchSnapshot(branch);
const snapshotNote = snapshotPath
	? `see \`${snapshotPath.replace(REPO_ROOT + '/', '')}\``
	: '(no branch snapshot yet)';

const paths = slice?.paths ?? claim?.paths ?? [];

const handoffBody = [
	`# Handoff — ${sliceId}`,
	'',
	`- Written at: ${ts}`,
	`- Agent type: ${agentType}`,
	`- Branch: ${branch}`,
	`- HEAD: ${head}`,
	`- Reason: ${reason}`,
	`- Latest branch snapshot: ${snapshotNote}`,
	'',
	'## Slice in DAG',
	slice
		? '```json\n' + JSON.stringify(slice, null, 2) + '\n```'
		: '(slice not found in DAG — this handoff is informational only)',
	'',
	'## Current brief',
	'```markdown',
	brief.trim(),
	'```',
	'',
	'## Claim',
	claim ? '```json\n' + JSON.stringify(claim, null, 2) + '\n```' : '(no claim file)',
	'',
	'## Owned paths',
	...(paths.length > 0 ? paths.map((p) => `- \`${p}\``) : ['- (none)']),
	'',
	'## Git status (worktree)',
	'```',
	gitStatusShort(),
	'```',
	'',
	'## Git diff --stat (owned paths only)',
	'```',
	gitDiffStat(paths),
	'```',
	'',
	'## Last 20 slice events',
	events.length === 0
		? '(no events in slices.jsonl for this slice)'
		: '```jsonl\n' + events.map((e) => JSON.stringify(e)).join('\n') + '\n```',
	'',
	'## Resume instructions for next agent',
	'',
	'1. Read this handoff **before** reading any other file.',
	'2. Re-check the claim is still valid (branch matches, paths still claimed).',
	'3. Do not re-read files already listed under "Owned paths" unless you need to modify them — assume they have been reviewed.',
	'4. Continue from wherever the last slice event left off (see "Last 20 slice events").',
	'5. If you hit the same soft budget threshold without reaching DoD, STOP and emit `slice kill --reason "context hard exit"` rather than writing another handoff (one handoff per agent per slice, per §15.3 Rule 3).',
	'',
	'---',
	`Generated by scripts/swarm/compact.mjs at ${ts}.`,
	''
].join('\n');

try {
	ensureDir(HANDOFFS_DIR);
	const handoffPath = join(HANDOFFS_DIR, `${sliceId}.md`);
	writeFileSync(handoffPath, handoffBody, 'utf8');

	ensureDir(STATE_DIR);
	appendFileSync(
		TELEMETRY_LOG,
		JSON.stringify({
			ts,
			event: 'handoff',
			slice_id: sliceId,
			agent_type: agentType,
			branch,
			head,
			reason,
			handoff_path: handoffPath.replace(REPO_ROOT + '/', '')
		}) + '\n',
		'utf8'
	);

	process.stdout.write(
		`[swarm:compact] handoff written for ${sliceId}\n  path: ${handoffPath.replace(
			REPO_ROOT + '/',
			''
		)}\n  telemetry: ${TELEMETRY_LOG.replace(REPO_ROOT + '/', '')}\n  reason: ${reason}\n`
	);
	process.exit(0);
} catch (err) {
	process.stderr.write(`[swarm:compact] error: ${err instanceof Error ? err.message : String(err)}\n`);
	process.exit(2);
}
