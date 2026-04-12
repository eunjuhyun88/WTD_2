#!/usr/bin/env node
/**
 * scripts/slice/smoke-cross-worktree.mjs
 *
 * Z5 smoke tests for cross-worktree claim awareness.
 *
 * Smoke 1: `slice new` refuses a slice already claimed in a sibling worktree.
 * Smoke 2: `slice ready` excludes cross-worktree-claimed slices.
 *
 * Strategy:
 *   - Uses the REAL repo's worktree topology (git worktree list).
 *   - Writes a TEMPORARY fake claim in a sibling worktree's
 *     `.agent-context/ownership/` dir, runs the CLI, then cleans up.
 *   - Never modifies git state — only touches gitignored .agent-context/.
 *
 * Prerequisites:
 *   - Must be run from a worktree that is NOT the main repo root
 *     (because we inject a fake claim into the main repo's ownership dir
 *     and expect the CLI in THIS worktree to see it as a sibling conflict).
 *   - The DAG must contain a READY slice (deps all MERGED, status UNKNOWN).
 *     The smoke picks the first one available.
 *
 * Usage:
 *   node scripts/slice/smoke-cross-worktree.mjs
 *
 * Exit 0 if both smokes pass, non-zero otherwise.
 */

import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync, unlinkSync, existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const REPO_ROOT = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();

// Find the main repo root (the canonical .git location)
const gitCommonDir = (() => {
	const raw = execSync('git rev-parse --git-common-dir', { encoding: 'utf8' }).trim();
	const abs = raw.startsWith('/') ? raw : resolve(REPO_ROOT, raw);
	return abs.endsWith('/.git') ? abs.slice(0, -'/.git'.length) : REPO_ROOT;
})();

// Pick a sibling worktree to inject the fake claim into.
// Use the main repo root as the "sibling" since it always exists.
const SIBLING_WT = gitCommonDir;
const SIBLING_OWNERSHIP = join(SIBLING_WT, '.agent-context/ownership');

// Find a ready slice from the CLI
function findReadySlice() {
	try {
		const out = execSync('node scripts/slice/cli.mjs ready --json', {
			encoding: 'utf8',
			cwd: REPO_ROOT,
			stdio: ['pipe', 'pipe', 'pipe']
		});
		const arr = JSON.parse(out);
		return arr.length > 0 ? arr[0].id : null;
	} catch {
		return null;
	}
}

let passed = 0;
let failed = 0;
const cleanup = [];

function assert(label, condition, detail) {
	if (condition) {
		console.log(`  ✓ ${label}`);
		passed++;
	} else {
		console.error(`  ✗ ${label}${detail ? ': ' + detail : ''}`);
		failed++;
	}
}

function doCleanup() {
	for (const fn of cleanup) {
		try { fn(); } catch { /* ignore */ }
	}
}

process.on('exit', doCleanup);
process.on('SIGINT', () => { doCleanup(); process.exit(1); });

try {
	// -----------------------------------------------------------------------
	// Smoke 1: slice new refuses duplicate cross-worktree claim
	// -----------------------------------------------------------------------
	console.log('\nSmoke 1: slice new cross-claim rejection');

	const targetSlice = findReadySlice();
	if (!targetSlice) {
		console.error('  SKIP: no READY slices in DAG — cannot test cmdNew conflict');
		failed++;
	} else {
		// Inject a fake claim for targetSlice into the sibling worktree
		mkdirSync(SIBLING_OWNERSHIP, { recursive: true });
		const fakeClaim = {
			slice_id: targetSlice,
			branch: 'claude/fake-sibling-test',
			agent_type: 'test',
			paths: ['scripts/slice/cli.mjs'],
			claimed_at: new Date().toISOString()
		};
		const fakeClaimPath = join(SIBLING_OWNERSHIP, `${targetSlice}.json`);
		writeFileSync(fakeClaimPath, JSON.stringify(fakeClaim, null, 2) + '\n', 'utf8');
		cleanup.push(() => {
			if (existsSync(fakeClaimPath)) unlinkSync(fakeClaimPath);
		});

		// Now run slice new from THIS worktree — should fail
		let newExitCode = 0;
		let newStderr = '';
		try {
			execSync(`node scripts/slice/cli.mjs new ${targetSlice}`, {
				encoding: 'utf8',
				cwd: REPO_ROOT,
				stdio: ['pipe', 'pipe', 'pipe']
			});
		} catch (err) {
			newExitCode = err.status ?? 1;
			newStderr = err.stderr ?? '';
		}

		assert(
			`slice new ${targetSlice} exits non-zero`,
			newExitCode !== 0,
			`got exit ${newExitCode}`
		);
		assert(
			'error mentions "already claimed"',
			newStderr.includes('already claimed'),
			newStderr.split('\n')[0]
		);
		assert(
			'error names the conflicting worktree',
			newStderr.includes(SIBLING_WT),
			'missing worktree path in error'
		);

		// Cleanup the fake claim
		if (existsSync(fakeClaimPath)) unlinkSync(fakeClaimPath);
	}

	// -----------------------------------------------------------------------
	// Smoke 2: slice ready excludes cross-worktree-claimed slices
	// -----------------------------------------------------------------------
	console.log('\nSmoke 2: slice ready cross-claim filter');

	const readyBefore = findReadySlice();
	if (!readyBefore) {
		console.error('  SKIP: no READY slices available');
		failed++;
	} else {
		// Inject fake claim for this ready slice
		mkdirSync(SIBLING_OWNERSHIP, { recursive: true });
		const fakeClaim = {
			slice_id: readyBefore,
			branch: 'claude/fake-sibling-test-2',
			agent_type: 'test',
			paths: [],
			claimed_at: new Date().toISOString()
		};
		const fakeClaimPath = join(SIBLING_OWNERSHIP, `${readyBefore}.json`);
		writeFileSync(fakeClaimPath, JSON.stringify(fakeClaim, null, 2) + '\n', 'utf8');
		cleanup.push(() => {
			if (existsSync(fakeClaimPath)) unlinkSync(fakeClaimPath);
		});

		// Run slice ready --json and check readyBefore is NOT in the result
		let readyOutput = '[]';
		try {
			readyOutput = execSync('node scripts/slice/cli.mjs ready --json', {
				encoding: 'utf8',
				cwd: REPO_ROOT,
				stdio: ['pipe', 'pipe', 'pipe']
			});
		} catch (err) {
			readyOutput = err.stdout ?? '[]';
		}

		const readyArr = JSON.parse(readyOutput);
		const readyIds = readyArr.map((s) => s.id);

		assert(
			`${readyBefore} NOT in ready set while claimed by sibling`,
			!readyIds.includes(readyBefore),
			`found in ready: [${readyIds.join(', ')}]`
		);

		// Cleanup
		if (existsSync(fakeClaimPath)) unlinkSync(fakeClaimPath);

		// Verify it re-appears after cleanup
		const afterCleanup = findReadySlice();
		assert(
			`${readyBefore} reappears in ready after claim removal`,
			afterCleanup === readyBefore,
			`got: ${afterCleanup}`
		);
	}

	// -----------------------------------------------------------------------
	// Summary
	// -----------------------------------------------------------------------
	console.log(`\n${passed} passed, ${failed} failed`);
	process.exit(failed > 0 ? 1 : 0);
} catch (err) {
	doCleanup();
	console.error('Unexpected error:', err);
	process.exit(1);
}
