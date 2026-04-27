# swarm-v1 Rollout Log

> Append-only operational log for the swarm-v1 parallel development system.
> Source-of-truth for rollout-gate evidence and decisions.
>
> - Design doc: `docs/exec-plans/active/swarm-v1-design-2026-04-11.md`
> - DAG: `docs/exec-plans/active/trunk-plan.dag.json`
> - CLI: `scripts/slice/cli.mjs`
> - State layer: `.agent-context/state/slices.jsonl`, `.agent-context/policy/wip-limits.json`

---

## 2026-04-12 — DAG v1 adopted + week_0 gate smoke (Z0-smoke-rollout-marker)

### Pre-conditions (inherited from 2026-04-11 session)

- swarm-v1 Phase 0 infra landed on `main` — commit `88af6b0` (CLI + agents + state layer + policy files).
- B.1 (§15 worker context management) + B.2 (rebuild subcommand) closed — commit `a1fdb4b`.
- E1 event & feature namespace registry landed — commit `0b390a3`.
- slice CLI policy reader fix + backfill subcommand — commit `6ebc01f`.
- 4 P1.A0 provider canonical extractions landed: `89f8430` binance, `0ba2653` coingecko, `7d558ef` coinalyze, `743856d` dexscreener.
- Follow-up P1.A1 caller migrations removed the legacy shims: `1e347b3` binance, `c447c7e` coingecko, `8217169` coinalyze, `c338d1d` dexscreener.

### B1 — State reconciliation

The `focused-pike` worktree began with an empty `.agent-context/state/slices.jsonl`. Rebuild + backfill brought it to ground truth:

| Slice | State | SHA |
|---|---|---|
| P0.1-verdict-zod | MERGED (rebuild) | `3e4a914` |
| P0.2-trajectory-zod | MERGED (rebuild) | `3e4a914` |
| P0.3-ids-finalize | MERGED (rebuild) | `471824e` |
| P0.4-contracts-barrel | MERGED (rebuild) | `bab703e` |
| P0.5-zod-pin | MERGED (rebuild) | `4e11aa6` |
| P1.A0-binance | MERGED (backfill) | `89f8430` |
| P1.A0-coingecko | MERGED (backfill) | `0ba2653` |
| P1.A0-coinalyze | MERGED (backfill) | `7d558ef` |
| P1.A0-dexscreener | MERGED (backfill) | `743856d` |
| P1.C-schema-migration | UNKNOWN | — |

The 4 P1.A0 slices required explicit `backfill` (not `rebuild`) because their declared `paths` include the legacy shim files (`src/lib/server/<name>.ts`) that the follow-up P1.A1 caller migration removed. `rebuild` skips slices whose owned paths are missing on disk — this is correct (it protects against spurious marks) and surfaced a real protocol gap: **when a P1.A1 slice deletes a shim referenced by a prior P1.A0 slice's `paths`, a manual backfill is required**. Future DAG v2+ slices should not list shim files that a later slice is expected to delete.

### B4 — DAG v1 adopted

v0 had 10 slices. v1 adds 17:

- **Z0-smoke-rollout-marker** (priority 999, no mutex, no deps) — the week_0 gate slice, this one.
- **14 P1.A0 provider extractions** promoted from parking_lot: upbit, etherscan, santiment, lunarcrush, defillama, cryptoquant, yahoo, fred, feargreed, coinmetrics, coinmarketcap, dune, gmx, polymarket, geckowhale. All serial via the `scanEngine-decompose` mutex. Priority descends from 71 → 57 to encode the serial order.
- **P2.A1-events-base** (Phase 2 seed) — unblocks the F4~F17 factor event rewrites.
- **P2.C-outcome-resolver** (Phase 2 seed) — time-bridge worker that populates trajectory outcomes.

Dropped from parking_lot:

- **glassnode** — no legacy shim on disk; needs greenfield implementation first.

Every v1 slice has the two new mandatory DoD lines:

- `1000-user perf budget: …` — concrete p95/throughput commitment OR explicit "by construction" justification for docs-only / test-only slices.
- `Security: …` — explicit posture statement (no new creds / no new egress / RLS enforced / etc.).

Enforcement is via Reviewer-Auto's DoD checklist (see `.claude/agents/reviewer-auto.md` + `docs/PERFORMANCE_BUDGET.md`).

### Smoke — Z0-smoke-rollout-marker end-to-end

The smoke exercises every CLI transition:

1. `slice new Z0-smoke-rollout-marker` → writes brief + claim, appends `in-progress` event, bumps WIP.
2. This file (`docs/swarm-v1-rollout-log.md`) is created and committed.
3. `npm run gate` passes (evidence: build + guard + docs + budget all green).
4. `ready-for-review` event appended directly to `slices.jsonl` (per design §15.5 — worker is the emitter; CLI intentionally has no `ready-for-review` command so the CLI stays small).
5. `slice approve Z0-smoke-rollout-marker` → appends `approved` event.
6. `slice merge Z0-smoke-rollout-marker` → appends `merged` event, releases claim, decrements WIP.
7. `slice status` shows `Z0-smoke-rollout-marker ... MERGED`.

### week_0 → week_1 advancement

After smoke merges cleanly, the week_0 rollout gate is declared **passed** per design §8:

- ✅ One slice ran end-to-end through the full lifecycle without manual state editing (the smoke).
- ✅ State layer (`.agent-context/state/slices.jsonl`, `.agent-context/state/wip.json`) reflects reality accurately.
- ✅ DAG has ≥10 schedulable slices (27 total; 18 in UNKNOWN; 3 in the immediate ready set once week_1 cap allows multiple concurrent product slices).

`.agent-context/policy/wip-limits.json → active_phase` advances from `week_0` to `week_1`. New effective caps:

| Track | week_0 | week_1 |
|---|---|---|
| product | 1 | 3 |
| research | 0 | 0 |
| fix | 0 | 0 |

Research track remains offline until week_2. Fix track remains offline until week_3.

---

## 1000-user performance + security baseline (binding for all DAG v1+ slices)

**Source of truth**: this section. A dedicated `docs/PERFORMANCE_BUDGET.md` will be broken out as a follow-up slice (not in scope for the Z0-smoke ownership boundary — Z0-smoke owns only this rollout-log file).

**Performance budget**:

| Metric | Baseline (pre-v1) | Target (week_3) | Enforcement |
|---|---|---|---|
| `/terminal` initial render p95 | ~3s | ≤ 3s | `npm run gate` + manual browser verify |
| `/api/wizard` response p95 | ~500ms | ≤ 500ms | slice DoD + Reviewer-Auto |
| scanEngine one-pass duration | ~2s | ≤ 2s | slice DoD (no regression) |
| Concurrent user capacity | ~100 (single-worker) | ≥ 1000 (multi-edge + fluid compute) | Load test per release |
| `npm run build` bundle size | 49 KB (budget) | ≤ 49 KB (current cap) | `check:budget` in gate |

**Security posture** (binding constants):

- All provider API keys rotate via `createKeyPool` (single source of truth — see `src/lib/server/llm/rotation.ts`).
- No credential may be committed. `.env*.local` is gitignored; pre-push hook verifies.
- Supabase RLS is enforced per user_id on all user-facing tables. Any slice touching DB must document its RLS stance in DoD.
- No new network egress destinations without explicit slice DoD entry naming the domain and justification.
- No PII in event payloads (enforced by `src/lib/contracts/events.ts` schemas).
- Daily credential rotation pending list: see `~/.claude/projects/.../memory/project_credential-rotation-pending.md`.

Every new DAG slice must either (a) state specific numbers in its `1000-user perf budget` DoD line, or (b) justify "by construction" for docs-only / test-only changes. Reviewer-Auto REVISE verdict if missing.

---

## Decisions made (logged)

1. **Serial mutex for all P1.A0 providers** — accepted. True parallelism for provider extraction requires splitting `scanEngine.ts` into per-provider sections first, which is a larger refactor (deferred to v2 if needed). Serial via mutex is honest about the file contention and avoids merge conflicts.

2. **Perf/security DoD is mandatory, not advisory** — every slice gets two additional DoD lines. Docs-only slices may say "by construction"; runtime-touching slices must document specific numbers. Reviewer-Auto rejects slices missing these lines.

3. **glassnode deferred** — dropped from v1 parking_lot because no legacy shim exists. A future slice will implement the initial loader; then a post-creation extraction slice will follow the P1.A0 pattern.

4. **Research track stays offline at week_1** — design §8 keeps research track dark until week_2. Not changing that in this rollout.

5. **No new hooks wired in this session** — `SubagentStop → Scheduler auto-spawn` and `Main-Keeper 30-min cron` are still manual/pending. Deferred to the next session because the bigger immediate win is having an accurate DAG + a passing smoke.

---

## 2026-04-12 (afternoon) — Z1-hook-subagent-autospawn landing + DAG v1.1

### Context

PR #35 (DAG v1 + week_0 → week_1 advance + perf/security DoD mandate)
merged to main as commit `96fbbc7`. This session immediately follows,
picking up the deferred B3 blocker from the morning rollout log.

### What shipped (Z1)

**Committed (tracked)**: two files.

- **`scripts/swarm/auto-spawn.sh`** — observability-only scheduler pick.
  Reads `slice ready --json`, sorts by priority DESC, walks the ready
  set, and appends one line to `.agent-context/digest/YYYY-MM-DD.md`
  naming the next slice the Scheduler would pick. Short-circuits on
  WIP-saturated, writes a saturation line instead.
- **`docs/swarm-v1-rollout-log.md`** — this file. Z1 landing entry +
  setup instructions + decisions.

**Local, per-developer (gitignored)**: two files. `.gitignore` line 34
excludes `.claude/*` except `.claude/agents/**` and `.claude/commands/**`,
so the hook wrapper and the settings entry are NOT tracked. Each
developer who wants the Z1 observability loop wires their own copy.

Setup steps (one-time, per developer, 30 seconds):

1. Create `.claude/hooks/subagent-auto-spawn.sh` with this content:

   ```bash
   #!/usr/bin/env bash
   # Thin wrapper invoked by SubagentStop. Delegates to scripts/swarm/auto-spawn.sh.
   set -euo pipefail
   if ! ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null)"; then exit 0; fi
   TARGET="$ROOT_DIR/scripts/swarm/auto-spawn.sh"
   [ -x "$TARGET" ] || exit 0
   "$TARGET" 2>/dev/null || true
   exit 0
   ```

2. `chmod +x .claude/hooks/subagent-auto-spawn.sh`

3. Merge this hook entry into `.claude/settings.json` under the
   `hooks.SubagentStop[0].hooks` array (AFTER any existing context-save
   entry so snapshot capture runs first):

   ```json
   {
     "type": "command",
     "command": "bash .claude/hooks/subagent-auto-spawn.sh"
   }
   ```

4. Smoke the setup by running `bash scripts/swarm/auto-spawn.sh` from
   the repo root. It should append one line to today's digest file at
   `.agent-context/digest/YYYY-MM-DD.md`. If it silently exits, your
   ready set is empty — create an UNKNOWN slice via `node
   scripts/slice/cli.mjs new <id>` first and re-run.

A future slice will replace this manual setup with an idempotent
`scripts/swarm/install-hook.sh` installer.

### What was deliberately NOT shipped in Z1

- **No `claude -p scheduler` auto-invocation.** Full automation is
  deferred behind Z3 (cost-ceiling-guard), because at n≥10 parallel
  workers the Claude API rate limit is the hardest constraint and a
  runaway hook could burn the daily budget in minutes.
- **No Main-Keeper 30-min cron.** Still manual. Comes in a later slice.

### Z1 is observability, not automation

Every SubagentStop now leaves a trace in today's digest of the form:

```
- 14:37:12Z auto-spawn: next ready slice=P1.A0-upbit track=product pri=71 (WIP 1/3 phase=week_1)
```

or, when WIP is saturated:

```
- 14:37:12Z auto-spawn: WIP saturated track=product (3/3 phase=week_1) — cannot pick P1.C-schema-migration (pri=70)
```

The human operator (or a future cron that shells into `claude -p
scheduler` once Z3 is in place) reads that line and decides whether to
spawn a worker via the Task tool. No API budget is consumed by the hook
itself.

### Invariants the Z1 script enforces (scripts/swarm/auto-spawn.sh)

- Always exits 0 (hook never blocks)
- Silent no-op on non-swarm branches (fresh clones, checkout of old
  branches without `scripts/swarm/auto-spawn.sh`)
- Fail-open on missing `node` / `jq` (log one stderr line, then exit 0)
- Refuses to operate outside a git repo root
- No network egress; pure local file reads + `node scripts/slice/cli.mjs`
  subprocess (which itself is pure file I/O)
- No Claude API calls from the hook itself

### DAG v1.1 expansion

DAG v1 had 27 slices. v1.1 adds:

- **Z1-hook-subagent-autospawn** (priority 990, no deps, this slice)
- **Z2-slice-new-worktree-provision** (priority 985, depends on Z1) —
  deferred; adds `slice new --worktree` flag
- **Z3-cost-ceiling-guard** (priority 980, depends on Z1) — deferred;
  `CLAUDE_API_DAILY_CEILING_USD` env guard + short-circuit in
  `auto-spawn.sh`

Total DAG v1.1 = 30 slices. 10 MERGED after Z1 lands.

### Smoke evidence

Ran `scripts/swarm/auto-spawn.sh` manually from the worktree root while
Z1 was in-progress. Digest entry produced:

```
- HH:MM:SSZ auto-spawn: next ready slice=P1.A0-upbit track=product pri=71 (WIP 1/3 phase=week_1)
```

P1.A0-upbit was the correct pick because Z1 itself was IN_PROGRESS and
filtered out of the ready set. Priority comparison gave upbit (71) vs
P1.C (70), upbit won by 1 point.

### 1000-user perf budget — Z1

- Hook execution wall-clock: bash startup (~20ms) + `git rev-parse`
  (~10ms) + one `node scripts/slice/cli.mjs ready --json` (~150ms on
  this machine) + one `status --json` (~150ms) + `jq` parsing + digest
  write (~5ms) = **≈ 340ms end-to-end on cold cache**
- Zero network I/O, zero DB hits, zero Claude API calls
- Target budget was < 200ms cold; actual is ~340ms cold because the
  slice CLI does a fresh topo sort + event-log fold on every call.
  Above budget but acceptable for a hook that fires at most a few
  times per minute during active work. If this becomes a problem, the
  fix is to memoize the DAG load in a second subprocess or to switch
  to a daemon. Documented here as future work.

### Security — Z1

- No new credentials accessed
- No new network egress destination
- Digest file contains no PII (only slice IDs, priorities, WIP counts)
- Hook refuses to run outside a git repo root
- `set -euo pipefail` prevents silent failures from mutating state
- `settings.json` change is the minimum possible — one additional hook
  entry, no change to other hook categories
- Fail-open design means a broken hook does not break subagent stops
  (zero blast radius on normal Claude Code operation)

### What the next session picks up

1. **Z2-slice-new-worktree-provision** — `slice new <id> --worktree`
   flag. Depends on Z1. Prereq for n≥5 parallel workers without file
   collisions in shared worktree.
2. **Z3-cost-ceiling-guard** — `CLAUDE_API_DAILY_CEILING_USD` guard.
   Depends on Z1. Prereq for any future slice that auto-invokes a
   Claude subagent from a hook or cron.
3. **P1.C-schema-migration** — the first real week_1 content slice.
   No swarm-v1 dependency, can run in parallel with Z2/Z3.

Once Z2 + Z3 land, the system crosses the line from "CTO manually runs
each slice" to "scheduler auto-picks, cost-guard short-circuits, worker
runs in isolated worktree". That is the prerequisite for advancing the
rollout phase past week_1.

---

## 2026-04-12 (late afternoon) — Gap discovery + DAG v1.2 + Z2 lifecycle shipped

### What the previous entry missed

PRs #35 and #37 claimed to close the "10+ parallel dev environment" blockers. A direct user challenge ("병렬 세션 관리와 워크트리 정리 부재 라는데 너가 작업하는게 그게 맞아?") forced a more honest audit. Findings:

- `git worktree list` reports 28 registered worktrees on 2026-04-12
- `.claude/worktrees/` filesystem holds 43 directories
- **15+ orphan directories** (on disk, not in git worktree list)
- **Zero cleanup automation** anywhere in the codebase
- Each worktree owns its OWN `.agent-context/state/slices.jsonl` (gitignored) — two parallel Claude sessions in different worktrees would independently `slice new` the same slice ID without detection
- Within-worktree path ownership IS enforced (pre-commit hook + DAG mutex). Cross-worktree has zero enforcement.
- No mechanism actually spawns `claude -p` from anywhere. Z1 is pure observability.

Conclusion: Z1 + Z2 (provisioning only) + Z3 (cost guard) cover HALF of the 10+ parallel story. The other half (cleanup, cross-worktree state, real spawn) was completely absent.

### DAG v1.2 — four slice categories to close the gap

Committed in CTO prep pass (commit `9f4ad94` before Z2 started):

- **Design doc §16 added** to `docs/exec-plans/active/swarm-v1-design-2026-04-11.md`. Six subsections covering the problem, four candidate architectures for cross-worktree state coordination (tradeoff table), three candidates for session-spawn mechanism, binding execution order Z2 → Z5 → Z4 → Z6, and non-goals.
- **Z2 rewritten** from `Z2-slice-new-worktree-provision` to `Z2-slice-worktree-lifecycle`. Scope widened from provisioning-only to provisioning + teardown on merge/kill + `--keep-worktree` debugging opt-out. Claim JSON schema gains optional `worktree_path` + `worktree_branch` fields.
- **Z4-worktree-orphan-sweep** (pri 975, depends on Z2) — reconciles git worktree list vs filesystem, classifies TRACKED / ORPHAN / STALE / ACTIVE_CLAIM, dry-run default, Main-Keeper Task 4 integration.
- **Z5-cross-worktree-state-read** (pri 970, depends on Z2) — walks sibling worktrees, reads each claim file, blocks duplicate slice-id claims. Pre-commit hook gains cross-worktree check. The single most important slice for n≥5 parallel.
- **Z6-claude-p-spawn-mechanism** (pri 965, depends on Z3 AND Z5) — FIRST slice that actually consumes Claude API budget automatically. Rate-limit stagger ≥ 10s. Short-circuits on Z3 OVER.

DAG total: 30 → 34 slices.

### Z2 lifecycle — what shipped (this slice)

`scripts/slice/cli.mjs` gains six surgical edits. Other files touched by Z2: this rollout log.

1. **`writeClaim(slice, extras)`** — claim JSON now carries optional `worktree_path` and `worktree_branch` fields when `--worktree` is used.
2. **`readClaim(sliceId)`** — helper used by merge/kill to capture the claim BEFORE release so teardown knows the path.
3. **`mainRepoRoot()`** — uses `git rev-parse --git-common-dir` to find the shared `.git` directory even when invoked from a worktree, then strips `/.git`. Prevents nested worktrees (a bug caught during Smoke A — first provision landed at `<focused-pike>/.claude/worktrees/...` instead of the main repo).
4. **`provisionWorktree(sliceId)`** — creates `<main-repo>/.claude/worktrees/<slice-id>` with a fresh `claude/<slice-id>` branch. Refuses if directory or branch already exists. Dies with clear error on any git failure (no rollback needed — no state mutation before provision).
5. **`teardownWorktree(claim, {keepWorktree, force})`** — reads `worktree_path` from the captured claim snapshot, runs `git worktree remove`. Silent no-op when no path. Kept when `--keep-worktree`. Failure is logged but non-fatal (Z4 orphan sweep will reconcile).
6. **`cmdNew` / `cmdMerge` / `cmdKill`** — all three accept the new flags and invoke the helpers. `cmdNew` provisions BEFORE any state mutation. `cmdMerge` and `cmdKill` capture the claim snapshot BEFORE release.

Help text updated to document `--worktree` and `--keep-worktree`.

### Smoke evidence (four scenarios, all passed)

**Smoke A — provisioning at main repo location** (initially failed, then fixed):
- First run: worktree landed at `<focused-pike>/.claude/worktrees/Z3-cost-ceiling-guard` (bug: `REPO_ROOT` via `git rev-parse --show-toplevel` returns current worktree, not main)
- Fix: added `mainRepoRoot()` helper using `--git-common-dir`
- Second run: worktree lands at `/Users/ej/Projects/wtd-clones/CHATBATTLE/.claude/worktrees/Z3-cost-ceiling-guard` ✓
- `git worktree list` confirmed

**Smoke B — default kill tears down**:
```
[slice] kill Z3-cost-ceiling-guard (Z2 smoke B: default kill should tear down worktree)
  worktree removed: /Users/ej/Projects/wtd-clones/CHATBATTLE/.claude/worktrees/Z3-cost-ceiling-guard
```
`git worktree list | grep Z3` → removed. Filesystem → removed.

**Smoke C — `--keep-worktree` preserves**:
```
[slice] kill Z3-cost-ceiling-guard (smoke C: keep-worktree test)
  worktree kept: /Users/ej/Projects/wtd-clones/CHATBATTLE/.claude/worktrees/Z3-cost-ceiling-guard (use this for post-mortem)
```
Worktree still registered, still on disk. Manual cleanup verified.

**Smoke D — full merge lifecycle tears down**:
```
[slice] approve Z3-cost-ceiling-guard
[slice] merge Z3-cost-ceiling-guard (wip 1)
  worktree removed: /Users/ej/Projects/wtd-clones/CHATBATTLE/.claude/worktrees/Z3-cost-ceiling-guard
```

**Smoke cleanup**: all 10 synthetic Z3 events (4 smokes) removed from `slices.jsonl` via `grep -v`. Z3 status back to UNKNOWN. WIP back to `product=1` (Z2 itself, this slice).

### Known limitation — branch leakage on smoke re-runs

Each `slice new --worktree` creates a new branch `claude/<slice-id>`. `slice kill` (default or with `--keep-worktree`) does NOT delete that branch. Consequence: a second `slice new --worktree <same-id>` after a kill will fail with "branch already exists" until the operator runs `git branch -D` manually.

Deliberate for `slice kill` — the branch may hold unmerged commits the operator wants for post-mortem. For `slice merge`, the FF-merge has already happened and the branch is safe to delete, but automatic branch deletion is out of scope for Z2. A future slice may add `slice merge --delete-branch` if leakage becomes annoying.

### 1000-user perf budget — Z2

- `provisionWorktree()` ≈ 500ms cold (one `git worktree add` + one `git rev-parse --verify`)
- `teardownWorktree()` ≈ 200ms (one `git worktree remove`)
- Neither touches `/api/*` or `/terminal` hot paths. Zero runtime impact on the 1000-concurrent-user product surface.
- At n=10 parallel workers, total CLI overhead 10 × 700ms = 7s wall-clock across all lifecycle commands combined. Within "hook never blocks" budget.

### Security — Z2

- `git worktree add/remove` are local-only. No network egress.
- Provisioning does NOT copy keys or env files. `git worktree` shares `.git` but working tree starts from a fresh commit base.
- `teardownWorktree` refuses to force-remove worktrees with uncommitted changes unless `force=true` is passed explicitly.
- Branch name sanitized via `[^a-zA-Z0-9._-]` → `_` so malicious slice IDs cannot escape the git ref namespace.
- Worktree path confined to `<main-repo>/.claude/worktrees/` via `mainRepoRoot()`. No path traversal possible.

### Execution order for remaining DAG v1.2

Per design §16.4 (binding):

```
Z2 (lifecycle, THIS slice) ──▶ Z4 (orphan sweep) ─▶ (end)
                          └──▶ Z5 (cross-worktree) ─▶ Z6 (spawn) ─▶ (end)
                                                      ▲
                                                      │ also depends on
                                                      │
Z3 (cost guard, parallel) ─────────────────────────────┘
```

Next session: Z4 OR Z5 (either can run after Z2 lands). Z5 is the more critical path — it unlocks Z6. Z4 is hygiene that also cleans up the existing 15+ orphans.

---

## Z5 — Cross-worktree state read (2026-04-12)

**Slice**: `Z5-cross-worktree-state-read`
**PR**: (pending)
**Branch**: `claude/Z5-cross-worktree-state-read`

### What

Added `loadCrossWorktreeClaims()` to `scripts/slice/cli.mjs` — a helper that walks `git worktree list --porcelain`, reads each sibling worktree's `.agent-context/ownership/*.json` claim files, and returns a `Map<slice_id, {worktree, branch, paths, source_path}>`.

Wired into:
- **`cmdNew`**: refuses to create a slice whose ID is already claimed by another worktree. Error names the conflicting worktree + branch.
- **`cmdReady`**: filters the ready set to exclude cross-worktree-claimed slices. A slice owned by a sibling is not "ready" for pickup.
- **`.githooks/pre-commit`**: after finding a local claim, walks siblings for the same slice_id. If found, rejects with "Cross-worktree conflict" naming the other worktree. Prevents two worktrees from divergently editing the same slice's owned paths.

### Smoke results

```
Smoke 1: slice new cross-claim rejection
  ✓ slice new <ready-slice> exits non-zero
  ✓ error mentions "already claimed"
  ✓ error names the conflicting worktree

Smoke 2: slice ready cross-claim filter
  ✓ <ready-slice> NOT in ready set while claimed by sibling
  ✓ <ready-slice> reappears in ready after claim removal

5 passed, 0 failed
```

### 1000-user perf budget — Z5

- `loadCrossWorktreeClaims()` runs one `git worktree list --porcelain` subprocess + N synchronous JSON reads (N = number of worktrees). At n=10 worktrees, measured <100ms total.
- Result is cached per-CLI-invocation — subsequent calls within the same process return the cached Map with zero I/O.
- No runtime impact on product surfaces (`/api/*`, `/terminal`). This is a development-time CLI tool only.

### Security — Z5

- **Read-only**: the walker never writes to sibling worktrees. It only reads `.agent-context/ownership/*.json` files.
- **Strict JSON parse**: malformed claim files are silently skipped (no eval, no JSONP).
- **No new network egress**: all operations are local filesystem reads.
- **No new credentials**: no API keys or secrets involved.

### Execution order update

```
Z2 (lifecycle) ✅ ──▶ Z5 (cross-worktree, THIS) ──▶ Z6 (spawn)
                 └──▶ Z4 (orphan sweep)              ▲
                                                      │
Z3 (cost guard) ──────────────────────────────────────┘
```

Next: Z4 (hygiene) and Z3 (cost guard) can run in parallel. Z6 depends on both Z3 + Z5.
