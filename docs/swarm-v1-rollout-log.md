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
