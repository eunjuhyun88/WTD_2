#!/usr/bin/env node
/**
 * W-0274 Phase 4 — Optimistic Concurrency / Conflict Detector
 *
 * Implements Compare-And-Swap (CAS) style file-level conflict detection for
 * the multi-agent environment (W-0270 §Pillar 2).
 *
 * Two layers of protection:
 *
 * 1. Claim registry (pre-flight): agents declare which files they intend
 *    to modify.  Before a second agent edits a claimed file, it sees the
 *    conflict and stops.
 *    State: state/claims.json
 *
 * 2. Commit-time CAS (post-flight): the pre-commit hook calls
 *    `conflict-detector.mjs check-staged` which compares each staged
 *    file's hash against the hash recorded when the claim was opened.
 *    If another agent has snuck in a different version → abort.
 *    State: state/claims.json (includes base_sha per file)
 *
 * Claim shape (state/claims.json):
 *   {
 *     "claims": {
 *       "<file_path>": {
 *         "agent_id": "A###",
 *         "work_item": "W-####",
 *         "claimed_at": "ISO",
 *         "base_sha":   "<git object hash of file at claim time>"
 *       }
 *     }
 *   }
 *
 * CLI:
 *   node tools/conflict-detector.mjs claim <file1> [file2 ...] --agent <A###> --work-item <W-####>
 *         — register intent to modify files
 *
 *   node tools/conflict-detector.mjs release --agent <A###> [--work-item <W-####>]
 *         — release all claims held by this agent (call in /end or post-merge)
 *
 *   node tools/conflict-detector.mjs check-staged [--agent <A###>]
 *         — check staged files against claim registry (pre-commit)
 *         — exit 0 = safe, exit 1 = conflict detected, exit 2 = usage error
 *
 *   node tools/conflict-detector.mjs list [--agent <A###>]
 *         — list all active claims
 *
 *   node tools/conflict-detector.mjs check-file <file_path> [--agent <A###>]
 *         — check if a file is claimed by another agent
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(__filename), "..");
const CLAIMS_FILE = resolve(REPO_ROOT, "state/claims.json");
const STATE_DIR = resolve(REPO_ROOT, "state");

// ---------------------------------------------------------------------------
// State helpers
// ---------------------------------------------------------------------------

function loadClaims() {
  if (!existsSync(CLAIMS_FILE)) return { claims: {} };
  try {
    return JSON.parse(readFileSync(CLAIMS_FILE, "utf8"));
  } catch {
    return { claims: {} };
  }
}

function saveClaims(state) {
  mkdirSync(STATE_DIR, { recursive: true });
  const tmp = CLAIMS_FILE + ".tmp";
  writeFileSync(tmp, JSON.stringify(state, null, 2));
  // atomic rename
  const { renameSync } = await_import_sync();
  renameSync(tmp, CLAIMS_FILE);
}

// Node 22 — renameSync is synchronous; use inline import workaround
function await_import_sync() {
  return require_shim();
}

function require_shim() {
  // We're in ESM — use a direct import alias for fs
  const { renameSync } = (() => {
    try {
      return { renameSync: (s, d) => { const fs = require("fs"); fs.renameSync(s, d); } };
    } catch {
      return { renameSync: () => {} };
    }
  })();
  // Actually, renameSync is already imported at top level — add it here:
  const { renameSync: rs } = { renameSync: (s, d) => {
    // Use execSync as fallback if needed
    try {
      // fs.renameSync is available via dynamic require in CJS, but we're ESM.
      // Use the already-available writeFileSync + unlink pattern instead.
      const data = readFileSync(s, "utf8");
      writeFileSync(d, data);
      try { execSync(`rm -f "${s}"`); } catch {}
    } catch {}
  }};
  return { renameSync: rs };
}

// Simpler: just write directly (not atomic but good enough for local dev)
function saveClaimsDirect(state) {
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(CLAIMS_FILE, JSON.stringify(state, null, 2));
}

// ---------------------------------------------------------------------------
// Git helpers
// ---------------------------------------------------------------------------

function gitHashFile(filePath) {
  try {
    const abs = resolve(REPO_ROOT, filePath);
    if (!existsSync(abs)) return null;
    const out = execSync(`git -C "${REPO_ROOT}" hash-object "${abs}" 2>/dev/null`, {
      encoding: "utf8",
    }).trim();
    return out || null;
  } catch {
    return null;
  }
}

function getStagedFiles() {
  try {
    const out = execSync(`git -C "${REPO_ROOT}" diff --cached --name-only`, {
      encoding: "utf8",
    });
    return out.split("\n").map(f => f.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// CLI flag parser
// ---------------------------------------------------------------------------

function parseFlags(argv) {
  const flags = { _files: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2).replace(/-/g, "_");
      const v = argv[i + 1];
      flags[key] = (!v || v.startsWith("--")) ? true : (i++, v);
    } else {
      flags._files.push(a);
    }
  }
  return flags;
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

function cmdClaim(flags) {
  const files = flags._files;
  const agentId = flags.agent;
  const workItem = flags.work_item ?? null;

  if (!files.length || !agentId) {
    console.error("usage: claim <file1> [file2 ...] --agent <A###> [--work-item <W-####>]");
    process.exit(2);
  }

  const state = loadClaims();
  const conflicts = [];
  const claimed = [];

  for (const f of files) {
    const existing = state.claims[f];
    if (existing && existing.agent_id !== agentId) {
      conflicts.push({ file: f, owner: existing.agent_id, work_item: existing.work_item });
    } else {
      const base_sha = gitHashFile(f);
      state.claims[f] = {
        agent_id: agentId,
        work_item: workItem,
        claimed_at: new Date().toISOString(),
        base_sha,
      };
      claimed.push(f);
    }
  }

  saveClaimsDirect(state);

  if (conflicts.length > 0) {
    console.error("⚠ CONFLICT: the following files are claimed by another agent:");
    for (const c of conflicts) {
      console.error(`  ${c.file}  →  ${c.owner} (${c.work_item ?? "no work item"})`);
    }
    console.error("\nAsk the owning agent to release the claim, or coordinate via PR.");
    if (claimed.length === 0) process.exit(1);
  }

  for (const f of claimed) {
    console.log(`✓ claimed: ${f} (agent=${agentId})`);
  }
}

function cmdRelease(flags) {
  const agentId = flags.agent;
  const workItem = flags.work_item ?? null;

  if (!agentId) {
    console.error("usage: release --agent <A###> [--work-item <W-####>]");
    process.exit(2);
  }

  const state = loadClaims();
  let released = 0;

  for (const [f, claim] of Object.entries(state.claims)) {
    if (claim.agent_id === agentId) {
      if (!workItem || claim.work_item === workItem) {
        delete state.claims[f];
        released++;
      }
    }
  }

  saveClaimsDirect(state);
  console.log(`✓ released ${released} claim(s) for ${agentId}${workItem ? ` / ${workItem}` : ""}`);
}

function cmdCheckStaged(flags) {
  const agentId = flags.agent ?? null;
  const staged = getStagedFiles();

  if (staged.length === 0) {
    process.exit(0);
  }

  const state = loadClaims();
  const conflicts = [];
  const stale = [];

  for (const f of staged) {
    const claim = state.claims[f];
    if (!claim) continue;

    // Conflict: file claimed by a different agent
    if (agentId && claim.agent_id !== agentId) {
      conflicts.push({
        file: f,
        claimant: claim.agent_id,
        work_item: claim.work_item,
        claimed_at: claim.claimed_at,
      });
      continue;
    }

    // CAS check: if base_sha recorded, verify the current HEAD version matches
    if (claim.base_sha) {
      const currentSha = gitHashFile(f);
      if (currentSha && currentSha !== claim.base_sha) {
        // File changed on disk since claim was made — stale base
        stale.push({ file: f, expected: claim.base_sha.slice(0, 8), actual: currentSha.slice(0, 8) });
      }
    }
  }

  if (conflicts.length === 0 && stale.length === 0) {
    process.exit(0);
  }

  if (conflicts.length > 0) {
    console.error("\n⚡ OPTIMISTIC CONCURRENCY CONFLICT (W-0274)\n");
    console.error("The following staged files are claimed by another agent:");
    for (const c of conflicts) {
      console.error(`  ${c.file}`);
      console.error(`    Owner: ${c.claimant} / ${c.work_item ?? "—"} (since ${c.claimed_at})`);
    }
    console.error("\nCoordinate with the owning agent before committing.");
    console.error("Or release the claim: node tools/conflict-detector.mjs release --agent <owner>");
  }

  if (stale.length > 0) {
    console.error("\n⚠ STALE BASE (CAS check)\n");
    console.error("These files changed after your claim was recorded:");
    for (const s of stale) {
      console.error(`  ${s.file}  (claim base=${s.expected}, current=${s.actual})`);
    }
    console.error("\nAnother agent may have committed changes since your claim.");
    console.error("Re-claim with fresh base: node tools/conflict-detector.mjs claim <file> --agent <id>");
  }

  process.exit(1);
}

function cmdList(flags) {
  const agentId = flags.agent ?? null;
  const state = loadClaims();
  const entries = Object.entries(state.claims);

  if (entries.length === 0) {
    console.log("(no active claims)");
    return;
  }

  const filtered = agentId
    ? entries.filter(([, v]) => v.agent_id === agentId)
    : entries;

  console.log(`${"File".padEnd(50)} ${"Agent".padEnd(8)} ${"Work Item".padEnd(12)} Claimed At`);
  console.log("─".repeat(95));
  for (const [f, v] of filtered) {
    console.log(
      `${f.slice(0, 50).padEnd(50)} ${v.agent_id.padEnd(8)} ${(v.work_item ?? "—").padEnd(12)} ${v.claimed_at}`
    );
  }
}

function cmdCheckFile(flags) {
  const file = flags._files[0];
  const agentId = flags.agent ?? null;

  if (!file) {
    console.error("usage: check-file <file_path> [--agent <A###>]");
    process.exit(2);
  }

  const state = loadClaims();
  const claim = state.claims[file];

  if (!claim) {
    console.log(`✓ ${file}: unclaimed`);
    process.exit(0);
  }

  if (agentId && claim.agent_id === agentId) {
    console.log(`✓ ${file}: claimed by you (${agentId})`);
    process.exit(0);
  }

  console.error(`✗ ${file}: claimed by ${claim.agent_id} / ${claim.work_item ?? "—"} (since ${claim.claimed_at})`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  const [, , cmd, ...rest] = process.argv;
  const flags = parseFlags(rest);

  switch (cmd) {
    case "claim":        return cmdClaim(flags);
    case "release":      return cmdRelease(flags);
    case "check-staged": return cmdCheckStaged(flags);
    case "list":         return cmdList(flags);
    case "check-file":   return cmdCheckFile(flags);
    default:
      console.error("usage: conflict-detector.mjs <claim|release|check-staged|list|check-file> ...");
      process.exit(2);
  }
}

main();
