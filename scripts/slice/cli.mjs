#!/usr/bin/env node
/**
 * scripts/slice/cli.mjs — swarm-v1 slice orchestration CLI
 *
 * Thin, file-only dispatcher over the state layer defined in
 * `docs/exec-plans/active/swarm-v1-design-2026-04-11.md §4` and the DAG
 * model in §5. Every mutation is an append to `slices.jsonl`; every read
 * is a fold over that log + the current DAG definition.
 *
 * This is intentionally minimal. It does not spawn subagents, fetch from
 * the network, or hit any database. It is a typed filesystem API that the
 * Scheduler / Reviewer-Auto / Main-Keeper agents (and humans) call.
 *
 * Commands:
 *   slice new <slice-id>              Create brief + claim + queue entry
 *   slice status [--slice <id>]       Show WIP, queue, active, recent events
 *   slice merge <slice-id>            Mark a slice ready for merge-train
 *   slice kill <slice-id> [--reason]  Abandon: release claim, record event
 *   slice approve <slice-id>          Human sign-off, clears review queue
 *   slice ready                       List all slices whose deps are merged
 *
 * All commands exit 0 on success, non-zero on failure. Stdout is
 * newline-delimited JSON when --json is passed, human text otherwise.
 *
 * NOT IMPLEMENTED YET (intentional v0 omissions, documented in design §12):
 *   - slice spawn (handled by Scheduler agent, not CLI)
 *   - slice review (handled by Reviewer-Auto agent)
 *   - slice rebase (handled by Main-Keeper)
 *
 * See docs/exec-plans/active/swarm-v1-design-2026-04-11.md for the full
 * state layer, invariants, and rollout plan.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { execSync } from 'node:child_process';

// ---------------------------------------------------------------------------
// Paths (§4)
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
const POLICY_DIR = join(REPO_ROOT, '.agent-context/policy');

const SLICES_LOG = join(STATE_DIR, 'slices.jsonl');
const WIP_FILE = join(STATE_DIR, 'wip.json');
const QUEUE_LOG = join(STATE_DIR, 'queue.jsonl');
const MAIN_FILE = join(STATE_DIR, 'main.json');

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function ensureDir(path) {
	if (!existsSync(path)) mkdirSync(path, { recursive: true });
}

function nowIso() {
	return new Date().toISOString();
}

function readJson(path, fallback) {
	if (!existsSync(path)) return fallback;
	try {
		return JSON.parse(readFileSync(path, 'utf8'));
	} catch (err) {
		throw new Error(`Failed to parse ${path}: ${err.message}`);
	}
}

function writeJson(path, value) {
	ensureDir(dirname(path));
	writeFileSync(path, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

function appendJsonl(path, record) {
	ensureDir(dirname(path));
	appendFileSync(path, JSON.stringify(record) + '\n', 'utf8');
}

function readJsonl(path) {
	if (!existsSync(path)) return [];
	return readFileSync(path, 'utf8')
		.split('\n')
		.filter((line) => line.trim().length > 0)
		.map((line) => JSON.parse(line));
}

function die(msg, code = 1) {
	process.stderr.write(`slice: ${msg}\n`);
	process.exit(code);
}

// ---------------------------------------------------------------------------
// DAG loading + validation (§5.3 — acyclic, single ownership)
// ---------------------------------------------------------------------------

function loadDag() {
	if (!existsSync(DAG_PATH)) die(`DAG not found: ${DAG_PATH}`);
	const dag = readJson(DAG_PATH);
	if (!dag || !Array.isArray(dag.slices)) die('DAG malformed: missing slices[]');
	return dag;
}

function findSlice(dag, sliceId) {
	return dag.slices.find((s) => s.id === sliceId) ?? null;
}

/** Topological sort — rejects cycles (§5.3). */
function topoSort(dag) {
	const byId = new Map(dag.slices.map((s) => [s.id, s]));
	const visited = new Map(); // id -> 'visiting' | 'done'
	const out = [];

	function visit(id, trail) {
		const state = visited.get(id);
		if (state === 'done') return;
		if (state === 'visiting') {
			throw new Error(`Cycle detected: ${[...trail, id].join(' -> ')}`);
		}
		const node = byId.get(id);
		if (!node) throw new Error(`Unknown dep: ${id} (referenced from ${trail[trail.length - 1] ?? '<root>'})`);
		visited.set(id, 'visiting');
		for (const dep of node.depends_on ?? []) {
			visit(dep, [...trail, id]);
		}
		visited.set(id, 'done');
		out.push(node);
	}

	for (const slice of dag.slices) visit(slice.id, []);
	return out;
}

// ---------------------------------------------------------------------------
// State folding — reconstruct per-slice status from event log
// ---------------------------------------------------------------------------

/**
 * Slice status lifecycle:
 *   QUEUED (in queue.jsonl, ready but not spawned)
 *   IN_PROGRESS (brief + claim exist, no merge event yet)
 *   READY_FOR_REVIEW (worker emitted 'ready-for-review')
 *   APPROVED (human said OK)
 *   MERGED (Main-Keeper ff'd it into main)
 *   KILLED (abandoned with reason)
 */
function computeSliceStatus(sliceId) {
	const events = readJsonl(SLICES_LOG).filter((e) => e.slice_id === sliceId);
	if (events.length === 0) return { status: 'UNKNOWN', events: [] };
	const terminal = events
		.slice()
		.reverse()
		.find((e) => ['merged', 'killed', 'approved', 'ready-for-review', 'in-progress', 'queued'].includes(e.event));
	const statusMap = {
		queued: 'QUEUED',
		'in-progress': 'IN_PROGRESS',
		'ready-for-review': 'READY_FOR_REVIEW',
		approved: 'APPROVED',
		merged: 'MERGED',
		killed: 'KILLED'
	};
	return {
		status: statusMap[terminal?.event] ?? 'UNKNOWN',
		lastEvent: terminal ?? null,
		events
	};
}

function readWip() {
	return readJson(WIP_FILE, { product: 0, research: 0, fix: 0 });
}

function bumpWip(track, delta) {
	const wip = readWip();
	wip[track] = Math.max(0, (wip[track] ?? 0) + delta);
	writeJson(WIP_FILE, wip);
}

/**
 * Load wip-limits.json and return both the absolute track caps and the
 * effective caps (`rollout_schedule[active_phase]` if set).
 *
 * File shape (design §8):
 *   {
 *     tracks: { product, research, fix },           // absolute ceiling (week_3)
 *     rollout_schedule: { week_0: { product, ... }, ... },
 *     active_phase: 'week_0'                        // effective phase key
 *   }
 *
 * Historical fallback: the v0 CLI read `{product, research, fix}` at the
 * root. If `tracks` is missing but those top-level keys exist, treat the
 * root object as the tracks bag.
 */
function loadPolicy() {
	const DEFAULTS = { product: 6, research: 3, fix: 1 };
	const raw = readJson(join(POLICY_DIR, 'wip-limits.json'), null);
	if (!raw || typeof raw !== 'object') {
		return { tracks: { ...DEFAULTS }, effective: { ...DEFAULTS }, activePhase: null, raw: null };
	}
	const tracks =
		raw.tracks && typeof raw.tracks === 'object'
			? { ...DEFAULTS, ...raw.tracks }
			: { ...DEFAULTS, ...Object.fromEntries(Object.entries(raw).filter(([k]) => k in DEFAULTS)) };
	const activePhase = typeof raw.active_phase === 'string' ? raw.active_phase : null;
	let effective = { ...tracks };
	if (activePhase && raw.rollout_schedule && typeof raw.rollout_schedule === 'object') {
		const phase = raw.rollout_schedule[activePhase];
		if (phase && typeof phase === 'object') {
			effective = {
				product: phase.product ?? tracks.product,
				research: phase.research ?? tracks.research,
				fix: phase.fix ?? tracks.fix
			};
		}
	}
	return { tracks, effective, activePhase, raw };
}

// ---------------------------------------------------------------------------
// Ownership manifest (§6 rule #3 — pre-commit hook reads this)
// ---------------------------------------------------------------------------

function writeClaim(slice) {
	ensureDir(OWNERSHIP_DIR);
	const claim = {
		slice_id: slice.id,
		branch: currentBranch(),
		agent_type: slice.agent_type,
		paths: slice.paths,
		claimed_at: nowIso()
	};
	writeJson(join(OWNERSHIP_DIR, `${slice.id}.json`), claim);
	// Branch-keyed mirror makes pre-commit lookup O(1) in the common case
	// where one branch = one slice.
	const branch = claim.branch.replace(/[^a-zA-Z0-9._-]/g, '_');
	writeJson(join(OWNERSHIP_DIR, `branch-${branch}.json`), claim);
}

function releaseClaim(sliceId) {
	const path = join(OWNERSHIP_DIR, `${sliceId}.json`);
	if (existsSync(path)) {
		const claim = readJson(path);
		const branch = (claim.branch ?? '').replace(/[^a-zA-Z0-9._-]/g, '_');
		const branchPath = join(OWNERSHIP_DIR, `branch-${branch}.json`);
		if (existsSync(branchPath)) {
			try {
				const branchClaim = readJson(branchPath);
				if (branchClaim.slice_id === sliceId) {
					execSync(`rm -f "${branchPath}"`);
				}
			} catch {
				/* ignore */
			}
		}
		execSync(`rm -f "${path}"`);
	}
}

function currentBranch() {
	try {
		return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
	} catch {
		return 'detached';
	}
}

// ---------------------------------------------------------------------------
// Brief generator (§3.1 Scheduler responsibility, minimal v0)
// ---------------------------------------------------------------------------

function writeBrief(slice) {
	ensureDir(BRIEFS_DIR);
	const path = join(BRIEFS_DIR, `${slice.id}.md`);
	const body = [
		`# Brief — ${slice.id}`,
		'',
		`**Title**: ${slice.title}`,
		`**Track**: ${slice.track}`,
		`**Phase**: ${slice.phase}`,
		`**Priority**: ${slice.priority}`,
		`**Agent type**: ${slice.agent_type}`,
		'',
		'## Owned paths',
		...(slice.paths ?? []).map((p) => `- \`${p}\``),
		'',
		'## Context files',
		...(slice.context_files ?? []).map((p) => `- \`${p}\``),
		'',
		'## Definition of Done',
		...(slice.dod ?? []).map((d) => `- [ ] ${d}`),
		'',
		'## Mutex groups',
		...(slice.mutex?.length ? slice.mutex.map((m) => `- ${m}`) : ['- (none)']),
		'',
		'## Kill gate',
		`- gate_fail_max: ${slice.kill_gate?.gate_fail_max ?? '∞'}`,
		`- age_days_max: ${slice.kill_gate?.age_days_max ?? '∞'}`,
		'',
		'## Notes',
		slice.notes ?? '(none)',
		'',
		'---',
		`Generated by scripts/slice/cli.mjs at ${nowIso()}.`,
		''
	].join('\n');
	writeFileSync(path, body, 'utf8');
	return path;
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

function cmdNew(args) {
	const sliceId = args[0];
	if (!sliceId) die('usage: slice new <slice-id>');
	const dag = loadDag();
	topoSort(dag); // fail fast on cycles
	const slice = findSlice(dag, sliceId);
	if (!slice) die(`slice not in DAG: ${sliceId}`);

	// Check status — refuse if already claimed/running
	const existing = computeSliceStatus(sliceId);
	if (['IN_PROGRESS', 'READY_FOR_REVIEW', 'APPROVED'].includes(existing.status)) {
		die(`slice ${sliceId} already ${existing.status}`);
	}

	// Check WIP against effective rollout cap (falls back to absolute cap)
	const policy = loadPolicy();
	const cap = policy.effective[slice.track] ?? 0;
	const wip = readWip();
	if ((wip[slice.track] ?? 0) >= cap) {
		const phaseLabel = policy.activePhase ? ` [${policy.activePhase}]` : '';
		die(`WIP cap hit for track "${slice.track}" (${wip[slice.track] ?? 0}/${cap})${phaseLabel}`);
	}

	ensureDir(STATE_DIR);
	writeClaim(slice);
	const briefPath = writeBrief(slice);
	appendJsonl(SLICES_LOG, { ts: nowIso(), event: 'in-progress', slice_id: sliceId, branch: currentBranch() });
	bumpWip(slice.track, +1);

	console.log(`[slice] new ${sliceId}`);
	console.log(`  brief: ${briefPath}`);
	console.log(`  claim: ${join(OWNERSHIP_DIR, `${sliceId}.json`)}`);
	console.log(`  track: ${slice.track} (wip ${readWip()[slice.track]}/${policy[slice.track]})`);
}

function cmdStatus(args) {
	const jsonMode = args.includes('--json');
	const sliceFilter = (() => {
		const idx = args.indexOf('--slice');
		return idx >= 0 ? args[idx + 1] : null;
	})();

	const dag = loadDag();
	const wip = readWip();
	const policy = loadPolicy();

	const rows = dag.slices.map((s) => {
		const st = computeSliceStatus(s.id);
		return {
			id: s.id,
			phase: s.phase,
			track: s.track,
			priority: s.priority,
			status: st.status,
			last_event: st.lastEvent?.event ?? null,
			last_ts: st.lastEvent?.ts ?? null
		};
	}).filter((r) => !sliceFilter || r.id === sliceFilter);

	if (jsonMode) {
		console.log(
			JSON.stringify(
				{
					wip,
					policy: {
						active_phase: policy.activePhase,
						effective: policy.effective,
						tracks: policy.tracks,
						raw: policy.raw
					},
					slices: rows
				},
				null,
				2
			)
		);
		return;
	}

	const cap = (track) => `${wip[track] ?? 0}/${policy.effective[track] ?? 0}`;
	const phaseLabel = policy.activePhase ? ` (phase=${policy.activePhase})` : '';
	console.log(`WIP: product=${cap('product')} research=${cap('research')} fix=${cap('fix')}${phaseLabel}`);
	console.log('');
	console.log('ID                                 PHASE TRACK      PRI STATUS');
	for (const r of rows) {
		console.log(
			`${r.id.padEnd(34)} ${r.phase.padEnd(5)} ${r.track.padEnd(10)} ${String(r.priority).padStart(3)} ${r.status}`
		);
	}
}

function cmdMerge(args) {
	const sliceId = args[0];
	if (!sliceId) die('usage: slice merge <slice-id>');
	const dag = loadDag();
	const slice = findSlice(dag, sliceId);
	if (!slice) die(`slice not in DAG: ${sliceId}`);
	const st = computeSliceStatus(sliceId);
	if (st.status !== 'APPROVED') {
		die(`slice ${sliceId} is ${st.status}, expected APPROVED before merge`);
	}
	appendJsonl(SLICES_LOG, { ts: nowIso(), event: 'merged', slice_id: sliceId });
	releaseClaim(sliceId);
	bumpWip(slice.track, -1);
	console.log(`[slice] merge ${sliceId} (wip ${readWip()[slice.track]})`);
}

function cmdKill(args) {
	const sliceId = args[0];
	if (!sliceId) die('usage: slice kill <slice-id> [--reason "..."]');
	const reasonIdx = args.indexOf('--reason');
	const reason = reasonIdx >= 0 ? args[reasonIdx + 1] : 'unspecified';

	const dag = loadDag();
	const slice = findSlice(dag, sliceId);
	if (!slice) die(`slice not in DAG: ${sliceId}`);
	const st = computeSliceStatus(sliceId);
	if (['MERGED', 'KILLED'].includes(st.status)) {
		die(`slice ${sliceId} already ${st.status}`);
	}
	appendJsonl(SLICES_LOG, { ts: nowIso(), event: 'killed', slice_id: sliceId, reason });
	releaseClaim(sliceId);
	if (['IN_PROGRESS', 'READY_FOR_REVIEW', 'APPROVED'].includes(st.status)) {
		bumpWip(slice.track, -1);
	}
	console.log(`[slice] kill ${sliceId} (${reason})`);
}

function cmdApprove(args) {
	const sliceId = args[0];
	if (!sliceId) die('usage: slice approve <slice-id>');
	const dag = loadDag();
	const slice = findSlice(dag, sliceId);
	if (!slice) die(`slice not in DAG: ${sliceId}`);
	const st = computeSliceStatus(sliceId);
	if (st.status !== 'READY_FOR_REVIEW') {
		die(`slice ${sliceId} is ${st.status}, expected READY_FOR_REVIEW before approve`);
	}
	appendJsonl(SLICES_LOG, { ts: nowIso(), event: 'approved', slice_id: sliceId });
	console.log(`[slice] approve ${sliceId}`);
}

/**
 * One-time state reconciliation for slices whose code landed on main before
 * the swarm-v1 state layer was bootstrapped. Writes a single `merged` event
 * with `backfill: true` so `computeSliceStatus` reports MERGED and the slice
 * drops out of the ready queue.
 *
 * Intentionally refuses to touch slices that already have state events — if
 * a slice is IN_PROGRESS / READY_FOR_REVIEW / APPROVED / MERGED, the normal
 * lifecycle commands are correct and backfill would corrupt the journal.
 */
function cmdBackfill(args) {
	const sliceId = args[0];
	if (!sliceId) die('usage: slice backfill <slice-id> [--sha <hash>] [--note "..."]');
	const shaIdx = args.indexOf('--sha');
	const sha = shaIdx >= 0 ? args[shaIdx + 1] : null;
	const noteIdx = args.indexOf('--note');
	const note = noteIdx >= 0 ? args[noteIdx + 1] : 'state-layer backfill for pre-swarm-v1 merge';

	const dag = loadDag();
	const slice = findSlice(dag, sliceId);
	if (!slice) die(`slice not in DAG: ${sliceId}`);

	const st = computeSliceStatus(sliceId);
	if (st.status === 'MERGED') {
		console.log(`[slice] backfill noop — ${sliceId} already MERGED`);
		return;
	}
	if (st.status !== 'UNKNOWN') {
		die(
			`slice ${sliceId} is ${st.status}; backfill only accepts UNKNOWN. ` +
				'Use approve/merge/kill on slices that already have state events.'
		);
	}

	ensureDir(STATE_DIR);
	appendJsonl(SLICES_LOG, {
		ts: nowIso(),
		event: 'merged',
		slice_id: sliceId,
		backfill: true,
		sha: sha ?? null,
		note
	});
	console.log(`[slice] backfill ${sliceId} -> MERGED${sha ? ` (sha=${sha})` : ''}`);
}

/**
 * Rebuild the state journal from the working tree. For every DAG slice that
 * is currently UNKNOWN, check whether all of its declared `paths` exist on
 * disk. If they do, mark the slice MERGED and record the most recent commit
 * that touched any of those paths as the SHA evidence.
 *
 * This is the reconciliation primitive that makes `.agent-context/state/`
 * gitignore-safe: any fresh worktree can regenerate the journal without
 * manual per-slice backfill commands. It addresses swarm-v1-design-2026-04-11
 * Appendix B.2.
 *
 * Heuristic rules:
 *   1. Only touches slices whose status is UNKNOWN. Existing lifecycle
 *      events are left alone — rebuild never clobbers approved/merged/killed.
 *   2. A slice is considered MERGED iff every path in `slice.paths` exists
 *      as a file in the working tree. Partial landing (half the owned files
 *      created) does NOT trip the rebuild — the slice stays UNKNOWN.
 *   3. SHA evidence is the `git log -1 --format=%h -- <path>` of the first
 *      existing owned path. Null if git is unhappy.
 *   4. `--dry-run` prints the plan without writing to slices.jsonl.
 *
 * Limitations (intentional):
 *   - Does NOT verify DoD items like "npm run check exits 0" or
 *     "round-trip test passes". Filesystem presence is the only evidence.
 *     A slice marked MERGED by rebuild may still have unmet DoD items — the
 *     safety net is that the commits creating those files went through the
 *     normal `gate` before landing on main.
 *   - Does NOT detect a slice that was KILLED and partially reverted — if
 *     the files still exist on disk, rebuild will re-mark them MERGED.
 *     Kills must be explicit via `slice kill` before rebuild runs.
 */
function cmdRebuild(args) {
	const dryRun = args.includes('--dry-run');
	const jsonMode = args.includes('--json');
	const dag = loadDag();

	const plan = [];
	for (const slice of dag.slices) {
		const st = computeSliceStatus(slice.id);
		if (st.status !== 'UNKNOWN') {
			plan.push({ id: slice.id, action: 'skip', reason: `already ${st.status}` });
			continue;
		}
		const paths = slice.paths ?? [];
		if (paths.length === 0) {
			plan.push({ id: slice.id, action: 'skip', reason: 'no declared paths' });
			continue;
		}
		const missing = paths.filter((p) => !existsSync(join(REPO_ROOT, p)));
		if (missing.length > 0) {
			plan.push({
				id: slice.id,
				action: 'skip',
				reason: `missing ${missing.length}/${paths.length} owned paths`,
				missing
			});
			continue;
		}

		let sha = null;
		for (const p of paths) {
			try {
				const out = execSync(`git log -1 --format=%h -- "${p}"`, {
					encoding: 'utf8',
					cwd: REPO_ROOT
				}).trim();
				if (out) {
					sha = out;
					break;
				}
			} catch {
				/* ignore and try next path */
			}
		}
		plan.push({ id: slice.id, action: 'mark-merged', sha });
	}

	if (jsonMode) {
		console.log(JSON.stringify({ dry_run: dryRun, plan }, null, 2));
		return;
	}

	let marked = 0;
	let skipped = 0;
	for (const step of plan) {
		if (step.action === 'mark-merged') {
			if (!dryRun) {
				ensureDir(STATE_DIR);
				appendJsonl(SLICES_LOG, {
					ts: nowIso(),
					event: 'merged',
					slice_id: step.id,
					backfill: true,
					rebuild: true,
					sha: step.sha,
					note: 'slice rebuild — all owned paths exist on disk'
				});
			}
			console.log(
				`[slice] rebuild ${dryRun ? '(dry-run) ' : ''}${step.id} -> MERGED${
					step.sha ? ` (sha=${step.sha})` : ''
				}`
			);
			marked++;
		} else {
			skipped++;
		}
	}
	console.log(`[slice] rebuild: marked=${marked} skipped=${skipped}${dryRun ? ' (dry-run)' : ''}`);
}

function cmdReady(args) {
	const jsonMode = args.includes('--json');
	const dag = loadDag();
	const sorted = topoSort(dag);
	// Merged/killed set
	const terminalByDep = new Map();
	for (const s of sorted) {
		const st = computeSliceStatus(s.id);
		terminalByDep.set(s.id, st.status === 'MERGED');
	}
	const ready = sorted.filter((s) => {
		const st = computeSliceStatus(s.id);
		if (st.status !== 'UNKNOWN' && st.status !== 'QUEUED') return false;
		return (s.depends_on ?? []).every((dep) => terminalByDep.get(dep));
	});
	if (jsonMode) {
		console.log(JSON.stringify(ready.map((s) => ({ id: s.id, priority: s.priority, track: s.track })), null, 2));
		return;
	}
	for (const s of ready.sort((a, b) => b.priority - a.priority)) {
		console.log(`${s.id.padEnd(34)} ${s.track.padEnd(10)} pri=${s.priority}`);
	}
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

const [, , cmd, ...rest] = process.argv;

if (!cmd || cmd === '--help' || cmd === '-h') {
	process.stdout.write(
		[
			'slice — swarm-v1 slice CLI',
			'',
			'  slice new <slice-id>                   Claim paths, write brief, bump WIP',
			'  slice status [--slice <id>] [--json]   Show DAG + WIP state',
			'  slice ready [--json]                   List slices whose deps are merged',
			'  slice merge <slice-id>                 Mark APPROVED slice as merged',
			'  slice kill <slice-id> [--reason "..."] Abandon a slice',
			'  slice approve <slice-id>               Human sign-off on a reviewed slice',
			'  slice backfill <slice-id> [--sha <h>] [--note "..."]',
			'                                         Reconcile MERGED state for one slice',
			'  slice rebuild [--dry-run] [--json]     Rebuild slices.jsonl from the working tree',
			'',
			'DAG: docs/exec-plans/active/trunk-plan.dag.json',
			'State: .agent-context/{state,ownership,briefs}/',
			''
		].join('\n')
	);
	process.exit(cmd ? 0 : 1);
}

try {
	switch (cmd) {
		case 'new':
			cmdNew(rest);
			break;
		case 'status':
			cmdStatus(rest);
			break;
		case 'ready':
			cmdReady(rest);
			break;
		case 'merge':
			cmdMerge(rest);
			break;
		case 'kill':
			cmdKill(rest);
			break;
		case 'approve':
			cmdApprove(rest);
			break;
		case 'backfill':
			cmdBackfill(rest);
			break;
		case 'rebuild':
			cmdRebuild(rest);
			break;
		default:
			die(`unknown command: ${cmd}`);
	}
} catch (err) {
	die(err instanceof Error ? err.message : String(err));
}
