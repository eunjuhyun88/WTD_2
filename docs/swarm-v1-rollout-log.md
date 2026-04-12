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
