#!/usr/bin/env node
// check-ownership.mjs — pre-commit ownership check (W-1004 PR1)
// Called from .githooks/pre-commit after W-0274 CAS check
// Usage: node tools/check-ownership.mjs [--override-owner]

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { resolve } from 'path';

const REPO_ROOT = execSync('git rev-parse --show-toplevel').toString().trim();
const OWNERSHIP_FILE = resolve(REPO_ROOT, 'state/file-ownership.jsonl');
const OVERRIDE_FILE = resolve(REPO_ROOT, 'state/ownership-overrides.jsonl');
const AGENT_FILE = resolve(REPO_ROOT, 'state/current_agent.txt');
const TTL_MS = 24 * 60 * 60 * 1000; // 24h

const override = process.argv.includes('--override-owner');

const currentAgent = existsSync(AGENT_FILE)
  ? readFileSync(AGENT_FILE, 'utf8').trim()
  : 'unknown';

if (!currentAgent || currentAgent === 'unknown') process.exit(0);

const staged = execSync('git diff --cached --name-only', { encoding: 'utf8' })
  .trim().split('\n').filter(Boolean);

if (staged.length === 0) process.exit(0);

// Parse ownership — last action wins per file
const now = Date.now();
const claims = new Map(); // file -> {agent, ts}

if (existsSync(OWNERSHIP_FILE)) {
  const lines = readFileSync(OWNERSHIP_FILE, 'utf8').trim().split('\n').filter(Boolean);
  for (const line of lines) {
    try {
      const e = JSON.parse(line);
      if (e.action === 'claim') {
        const age = now - new Date(e.ts).getTime();
        if (age < TTL_MS) claims.set(e.file, { agent: e.agent, ts: e.ts });
        else claims.delete(e.file); // expired
      } else if (e.action === 'release') {
        claims.delete(e.file);
      } else if (e.action === 'share' && e.share_with === currentAgent) {
        // shared access — treat as owned by current agent
        claims.set(e.file, { agent: currentAgent, ts: e.ts });
      }
    } catch {}
  }
}

// Find conflicts: staged file owned by someone else
const conflicts = staged
  .map(f => ({ file: f, claim: claims.get(f) }))
  .filter(({ claim }) => claim && claim.agent !== currentAgent);

if (conflicts.length === 0) process.exit(0);

if (override) {
  const ts = new Date().toISOString();
  const entries = conflicts.map(({ file, claim }) =>
    JSON.stringify({ ts, agent: currentAgent, file, original_owner: claim.agent, action: 'override' })
  ).join('\n') + '\n';
  writeFileSync(OVERRIDE_FILE, entries, { flag: 'a' });
  process.stderr.write(`⚠️  ownership override: ${conflicts.length} file(s) → state/ownership-overrides.jsonl\n`);
  process.exit(0);
}

process.stderr.write('\n❌ pre-commit blocked: file ownership conflict (W-1004)\n\n');
for (const { file, claim } of conflicts) {
  process.stderr.write(`  ${file}\n`);
  process.stderr.write(`    owned by: ${claim.agent} (since ${claim.ts})\n`);
}
process.stderr.write('\n해결:\n');
process.stderr.write('  tools/own.sh list                  # 전체 claim 확인\n');
const files = conflicts.map(c => c.file).join(' ');
process.stderr.write(`  tools/own.sh release ${files}  # owner가 해제\n`);
process.stderr.write('  또는 --override-owner 플래그 bypass (감사 로그 기록)\n\n');
process.exit(1);
