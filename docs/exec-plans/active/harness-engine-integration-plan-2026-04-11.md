# Harness Engine Integration Plan — 2026-04-11

**Status**: locked
**Authority**: CTO-level sequencing for closing the gap between the
`alpha-terminal-harness-*` design pack and the actual production
engine. This document is the single source of truth for "what slices
land in what order, who owns which files, and what the exit gate is
for each epic".

**Scope relation to prior docs**:

- `docs/exec-plans/active/alpha-terminal-harness-html-dissection-2026-04-10.md` — WHAT to port (524 lines). This plan is the HOW.
- `docs/exec-plans/active/alpha-terminal-harness-engine-spec-2026-04-09.md` — the 6-contract engine spec. This plan schedules its implementation.
- `docs/exec-plans/active/research-spine-2026-04-11.md` — the parallel D-pipeline (evaluation). Its R4.x stack is already on main (R4.1..R4.6).
- `docs/exec-plans/active/three-pipeline-integration-design-2026-04-11.md` — the A/B/C trunk. This plan mostly touches the A→C handoff and the C→D adapter.

## 0. Current state (as of 2026-04-11)

What is already on main:

| Layer | Status | Where |
|---|:---:|---|
| Contracts (`ids.ts`, `verdict.ts`, `trajectory.ts`, `registry.ts`) | ✅ frozen | `src/lib/contracts/` |
| Phase 0 exit gate (dissection §10) | ✅ closed | all six resolved decisions locked |
| RAW provider `readRaw()` singleton | ✅ 17/21 IDs wired | `src/lib/server/providers/rawSources.ts` (511 lines) |
| Parallel provider canonicalization (P1.A0) | 🔄 in progress by other agents | `providers/binance.ts`, `providers/coingecko.ts`, `providers/coinalyze.ts`, `providers/dexscreener.ts` |
| Layer engine L1..L15 + L18 + L19 | ✅ implemented | `src/lib/engine/cogochi/layerEngine.ts` + `layers/*.ts` |
| `computeSignalSnapshot()` output | ✅ exists | returns `SignalSnapshot` (free-form shape, not VerdictBlock) |
| Research spine R4.1..R4.6 | ✅ merged | `src/lib/research/` — works on synthetic data only |
| Decision journal DB writes | 🟡 legacy only | `passportMlPipeline.ts` writes flat JSONB to `decision_trajectories` — **shape mismatches `DecisionTrajectorySchema`** |

Critical gaps (this plan's target):

1. **Gap A — VerdictBlock producer absent.** Nothing in the codebase emits a `VerdictBlock` zod object. `alphaScore.ts:buildVerdict()` returns a `string`, not the frozen schema shape.
2. **Gap B — `event.*` / `feat.*` namespaces have no entries.** `ids.ts` has the namespace markers (`EVENT: 'event'`, `FEAT: 'feat'`) but zero concrete IDs. Magic numbers still live inside layer files.
3. **Gap C — DB schema vs zod schema mismatch.** The `decision_trajectories` table has `context_features JSONB / decision_features JSONB / outcome_features JSONB` (legacy passport shape), not the nested `verdict_block` structure that `DecisionTrajectorySchema` frozens.
4. **Gap D — Research spine D-pipeline is synthetic-only.** `createSyntheticSource` is the only `DatasetSource`. No DB reader adapter.
5. **Gap E — A few RAW IDs not wired.** `UPBIT_VOLUME_MAP`, `SECTOR_MAP`, `SECTOR_OVERRIDE`, `OI_HIST_DISPLAY_TF` are in `ids.ts` but absent from `rawSources.ts`. Parallel P1.A0 slices may address these incidentally; this plan does NOT claim them.

## 1. Non-negotiable execution principles

1. **Each epic owns a disjoint file set.** No two open PRs modify the same file. If an epic needs to touch a file an earlier epic is editing, it waits or re-scopes.
2. **Each epic ships as 1..N commits on a single feature branch, with one PR per branch.** Large epics are decomposed into sub-slices (E3a, E3b, …) each of which is a separate commit on the same branch.
3. **Every commit must pass `npm run check` + `npm run build` + affected smokes** before it lands. Regression smokes from earlier R4.x + this plan's new ones run on every change.
4. **Backward compatibility is load-bearing.** Nothing here breaks the existing `SignalSnapshot` shape that `scanner.ts` / `toolExecutor.ts` / `multiTimeframeContext.ts` consume. New producers are added; legacy outputs are extended, not replaced.
5. **Modularity over monoliths.** New files, new directories, small focused types. When a file crosses 500 lines with unrelated concerns, split it.
6. **No touching files under other agents' claim** without coordination:
   - `src/lib/server/providers/**` — claimed by the P1.A0 parallel refactor track.
   - `src/lib/server/scanEngine.ts` — legacy path, scheduled for a separate B8+ readRaw migration.
   - `src/lib/server/passportMlPipeline.ts` — passport track, separate cadence.
7. **Research spine (`src/lib/research/`) stays frozen** except for additive new files (e.g. `source/db.ts` in E5). No edits to existing R4.1..R4.6 files.

## 2. Epic overview

```
E0  Roadmap (this doc)                                                   — 1 commit

E1  Event & Feature namespace registry (modular, extensible)             — 1 commit
     └─ New:    src/lib/contracts/events.ts
                src/lib/contracts/features.ts
                scripts/research/e1-namespace-smoke.ts
     └─ Touch:  src/lib/contracts/index.ts (re-export only)

E2  Engine → VerdictBlock adapter                                        — 1 commit
     └─ New:    src/lib/engine/cogochi/verdictBuilder.ts
                scripts/research/e2-verdict-builder-smoke.ts
     └─ Touch:  src/lib/engine/cogochi/index.ts (if exists) or layerEngine barrel

E3  Layer functions emit typed events  (5 sub-slices, 1 file each)
     E3a — L2 flow events           (4 events)
     E3b — L14 BB squeeze events    (2 events)
     E3c — L11 CVD events           (1 event)
     E3d — L9 real-liq events       (2 events)
     E3e — L1 wyckoff state stamp   (structure_state connection)

E4  Decision journal DB migration                                        — 1 commit
     └─ New:    migrations/2026-04-11-verdict-block-jsonb.sql
                src/lib/server/journal/trajectoryWriter.ts
     └─ Touch:  none (pure additive)

E5  Research spine DB source + first real-data experiment                — 1 commit
     └─ New:    src/lib/research/source/db.ts
                scripts/research/experiments/rq-b-real-data-<date>/
                  experiment.mjs
                  objective.md
                docs/generated/research/report-rq-b-real-data-<date>.md
     └─ Touch:  src/lib/research/index.ts (re-export only)

E6  Magic numbers → config registry  (optional, follow-up)               — N commits
     └─ Out of this plan's critical path. Tracked for later.

E7  Live scan loop (A-pipeline writes through VerdictBuilder to DB)      — deferred
     └─ Requires E2 + E4 landed. Schedules on a separate plan.
```

**Critical path**: `E0 → E1 → E2 → E3a..e → E4 → E5`. E6 and E7 are branches off the trunk.

**Parallelism**: E3 sub-slices can run in parallel with each other once E1 lands, because they each own exactly one layer file. E2 can start as soon as E1 lands; E4 can start as soon as E2 lands; E5 requires E4.

## 3. Epic detail

### E0 — Roadmap (this commit)

- **Owned file**: `docs/exec-plans/active/harness-engine-integration-plan-2026-04-11.md` (this file).
- **Acceptance**: committed to a fresh branch, PR opened, merged after CI passes.
- **Size**: 1 commit.
- **Blocks**: everything after it.

### E1 — Event & Feature namespace registry

**Intent**: give the engine a place to emit typed events and features without bloating `ids.ts`. The existing `ids.ts` (266 lines, 78 IDs) stays frozen; new ID space lives in sibling files that compose via `contracts/index.ts`.

**Owned files (new)**:
- `src/lib/contracts/events.ts` — event ID registry. Exports `EventId` const object + discriminated-union type for event payloads.
- `src/lib/contracts/features.ts` — feature ID registry. Exports `FeatureId` const object + typed feature-value map.
- `scripts/research/e1-namespace-smoke.ts` — round-trip smoke: create event payload, validate via zod, read back.

**Touched files**:
- `src/lib/contracts/index.ts` — re-export `EventId`, `FeatureId`, and their types.

**Initial content (minimum viable — more added per-epic in E3)**:

```ts
// contracts/events.ts — initial set (7 events)
export const EventId = {
  // L2 flow (added for E3a)
  FLOW_FR_EXTREME_POSITIVE: 'event.flow.fr_extreme_positive',
  FLOW_FR_EXTREME_NEGATIVE: 'event.flow.fr_extreme_negative',
  FLOW_LONG_ENTRY_BUILD:    'event.flow.long_entry_build',
  FLOW_SHORT_SQUEEZE:       'event.flow.short_squeeze_active',
  // L14 BB (added for E3b)
  BB_SQUEEZE:               'event.bb.squeeze',
  BB_BIG_SQUEEZE:           'event.bb.big_squeeze',
  // L11 CVD (added for E3c)
  CVD_ABSORPTION:           'event.cvd.absorption',
} as const;
```

```ts
// contracts/features.ts — initial set (5 features)
export const FeatureId = {
  FLOW_FR_REGIME:          'feat.flow.funding_regime',      // bucket enum
  FLOW_LONG_SHORT_REGIME:  'feat.flow.long_short_regime',
  FLOW_TAKER_REGIME:       'feat.flow.taker_regime',
  VOL_BB_BANDWIDTH:        'feat.vol.bb_bandwidth',         // number
  VOL_ATR_PCT:             'feat.vol.atr_pct',              // number
} as const;
```

Plus: a `zod` schema for each event payload and each feature value, and a barrel `EventPayload` discriminated union so downstream code can type-match on `event.id`.

**Does not touch**: `ids.ts`, any layer file, runner, splitter.

**Acceptance**:
- `npm run check` → 0/0
- `scripts/research/e1-namespace-smoke.ts` exits 0 (validates every declared event ID has a payload schema and every feature ID has a value type).
- Nothing else in the codebase references `EventId` / `FeatureId` yet. E3 sub-slices are where the layer functions start importing them.

**Size**: Small. 1 commit.

### E2 — Engine → VerdictBlock adapter

**Intent**: convert the existing `SignalSnapshot` output of `computeSignalSnapshot()` into a zod-validated `VerdictBlock` without touching any layer or the snapshot shape. The adapter is a pure function; it is the place where "the engine produces the frozen contract output".

**Owned files (new)**:
- `src/lib/engine/cogochi/verdictBuilder.ts` — `buildVerdictBlock(snapshot, context): VerdictBlock`
- `scripts/research/e2-verdict-builder-smoke.ts` — smoke: hand-craft `SignalSnapshot` fixtures for all 5 bias tiers, convert, `VerdictBlockSchema.parse()` each one, assert fields.

**Touched files**: none (new file only; callers optional).

**Mapping**:

| VerdictBlock field | Source |
|---|---|
| `schema_version` | literal `'verdict_block-v1'` |
| `trace_id` | caller-supplied (from scan request) |
| `symbol` | `snapshot.symbol` |
| `primary_timeframe` | `snapshot.timeframe` |
| `bias` | `snapshot.alphaLabel` (already `STRONG_BULL` / ... / `STRONG_BEAR`) |
| `structure_state` | `snapshot.l1.phase` → map to `state.acc_phase_a` etc. (defensive fallback to `state.none`) |
| `confidence` | `(snapshot.alphaScore + 100) / 200` (0..1 range) |
| `urgency` | `snapshot.extremeFR ? 'HIGH' : snapshot.mtfTriple ? 'HIGH' : snapshot.bbBigSqueeze ? 'MEDIUM' : 'LOW'` |
| `top_reasons` | snapshot's `l*.sigs` arrays filtered for directional agreement with `bias`, first 8 |
| `counter_reasons` | same, filtered for opposite direction |
| `invalidation` | `snapshot.l1.stop_bull` / `stop_bear` + wyckoff C&E events |
| `execution` | `{entry_zone: null, stop: l1.stop_{bull,bear}, targets: l1.target_{bull,bear}, rr_reference: derived}` |
| `data_freshness` | caller-supplied from provider cache metadata |
| `legacy_alpha_score` | `snapshot.alphaScore` |

**Acceptance**:
- `npm run check` → 0/0
- Smoke asserts all 5 bias tiers parse cleanly through `VerdictBlockSchema`.
- Snapshot shape is unchanged (engine output still back-compat for existing callers).

**Size**: Small. 1 commit.

### E3 — Layer functions emit typed events (5 sub-slices)

**Intent**: each layer function, instead of returning plain numeric scores with prose labels, also emits a typed event list pulled from `EventId`. The layer's existing `LxResult` shape is **extended**, not replaced, so existing consumers stay working.

**Sub-slices** (each its own commit on one branch; own exactly one layer file):

| Sub-slice | File | Events added | Features added |
|---|---|---|---|
| E3a | `src/lib/engine/cogochi/layerEngine.ts:computeL2` | 4 (flow FR) | 3 (flow regimes) |
| E3b | `src/lib/engine/cogochi/layers/l14BbSqueeze.ts` | 2 (squeeze, big) | 1 (bb_bandwidth) |
| E3c | `src/lib/engine/cogochi/layerEngine.ts:computeL11` | 1 (cvd absorption) | 0 |
| E3d | `src/lib/engine/cogochi/layerEngine.ts:computeL9` | 2 (long cascade, short squeeze real-liq) | 0 |
| E3e | `src/lib/engine/cogochi/layers/l1Wyckoff.ts` | 0 | 0 (emits `structure_state` enum already present in `ids.ts`) |

**Per sub-slice owned files**:
- Only the file named. No touching of sibling layers.
- Plus a smoke under `scripts/research/e3{a..e}-layer-events-smoke.ts`.

**Acceptance per sub-slice**:
- `npm run check` → 0/0
- Layer output typed-event list matches expected set on each threshold case.
- `SignalSnapshot` shape compatibility verified (existing fields still present).

**Size per sub-slice**: Small. 1 commit each. Sub-slices can land in any order after E1+E2.

### E4 — Decision journal DB migration

**Intent**: extend the `decision_trajectories` table to carry a `verdict_block JSONB` column that stores the frozen zod-validated shape, without breaking the existing passport pipeline's flat JSONB columns.

**Owned files (new)**:
- `migrations/2026-04-11-verdict-block-jsonb.sql` — adds `verdict_block JSONB` and `schema_version TEXT DEFAULT 'decision_trajectory-v1'` columns. Does NOT drop existing columns. Does NOT backfill passport rows.
- `src/lib/server/journal/trajectoryWriter.ts` — `writeDecisionTrajectoryV2(row: DecisionTrajectory): Promise<void>`. Uses the v1 schema from `contracts/trajectory.ts`, validates via `DecisionTrajectorySchema.parse()`, writes to the new column. Does NOT touch `passportMlPipeline.ts`.

**Touched files**: none.

**Acceptance**:
- Migration applies cleanly on a fresh test DB.
- Backward compat: old passport path writes still succeed (migration is additive only).
- Smoke: `trajectoryWriter` writes a hand-crafted trajectory, reads it back via SELECT, parses it via zod, fields match.
- `npm run check` + `npm run build` green.

**Size**: Small-medium. 1 commit.

### E5 — Research spine DB source + first real-data experiment

**Intent**: close the loop. Make `runExperiment` able to read from the `decision_trajectories` table (via the new `verdict_block JSONB` column) and re-run the R4.6 RQ-B sample-size experiment on real data.

**Owned files (new)**:
- `src/lib/research/source/db.ts` — `createDbDatasetSource({ dsn, filter?, limit? })`. Returns `DatasetSource`. SELECTs from `decision_trajectories WHERE verdict_block IS NOT NULL AND outcome_features IS NOT NULL`, maps each row into `DecisionTrajectory` zod object.
- `scripts/research/experiments/rq-b-real-data-<date>/experiment.mjs` — copy of R4.6 template, switched to `createDbDatasetSource`.
- `scripts/research/experiments/rq-b-real-data-<date>/objective.md` — new pre-registration.
- `docs/generated/research/report-rq-b-real-data-<date>.md` — auto-generated.

**Touched files**:
- `src/lib/research/index.ts` — re-export `createDbDatasetSource`.

**Acceptance**:
- Smoke: `createDbDatasetSource({ limit: 10 })` against a test DB with seeded rows returns a well-formed `DecisionTrajectory[]` that passes `assertTrajectoriesWellFormed`.
- New experiment runs end-to-end (may report "insufficient data" when DB is empty; that's a valid outcome — the smoke is that the pipeline executes).
- Pre-registration + generated report committed in the same diff.

**Size**: Small. 1 commit.

## 4. Parallel-track coordination

| Track | Files claimed by that track | My plan's policy |
|---|---|---|
| P1.A0 provider canonicalization | `src/lib/server/providers/*.ts`, possibly `rawSources.ts` | Don't touch. If my E1..E5 needs to cite a provider ID, import via `KnownRawId` only. |
| B-series scanEngine readRaw migration | `src/lib/server/scanEngine.ts` | Don't touch. E2 is additive new file; E3 sub-slices touch the NEW layer files, not scanEngine. |
| Passport ML pipeline | `src/lib/server/passportMlPipeline.ts` | Don't touch. E4 migration is purely additive (new column); passport pipeline keeps working. |
| Swarm-v1 infra | `docs/swarm-v1/`, related `.agent-context/` | Don't touch. |
| Research spine R4.1..R4.6 | `src/lib/research/**/*.ts` (already merged) | Frozen except for additive new file in E5. |

If a conflict arises during implementation (e.g. another agent lands on a file I'm editing), the implementation slice retargets onto the new main tip via `safe:sync:gate` and tries again. No destructive force-pushes.

## 5. Exit criteria for this plan

The plan is considered **complete** when:

1. E0..E5 are all merged to `main`.
2. `npm run research:r4-1-fixtures`, `r4-1-scheduled-end`, `r4-2-smoke`, `r4-3-smoke`, `r4-4-smoke`, `r4-5-template`, `rq-b-sample-size`, and the new E1..E5 smokes all pass on main.
3. `src/lib/engine/cogochi/verdictBuilder.ts` exists and is exported via the research/engine barrels.
4. The `decision_trajectories` table has the `verdict_block JSONB` column.
5. At least one real-data experiment report is committed to `docs/generated/research/`.

After exit: gap items remaining for future plans:

- **E6** — lifting dissection §4 magic numbers into a central `thresholds.ts` registry.
- **E7** — A-pipeline live scan loop that actually writes `VerdictBlock` rows to the DB through the new writer. (Requires E2+E4 landed, which is inside this plan's exit criteria.)
- **Pooled-pair saturation** in R4.6 — the caveat flagged in `report-rq-b-sample-size-2026-04-11.md`, still unresolved.
- **Multi-actor trajectories** — adding `decision.actor` variants (agent / baseline / user) to DB writes so ORPO pairs can be built across agents.

## 6. References

- `docs/exec-plans/active/alpha-terminal-harness-html-dissection-2026-04-10.md`
- `docs/exec-plans/active/alpha-terminal-harness-engine-spec-2026-04-09.md`
- `docs/exec-plans/active/research-spine-2026-04-11.md`
- `docs/exec-plans/active/three-pipeline-integration-design-2026-04-11.md`
- `src/lib/contracts/verdict.ts` — the frozen target schema
- `src/lib/engine/cogochi/layerEngine.ts` — the current engine output surface
- `src/lib/server/providers/rawSources.ts` — the canonical `readRaw()` entry point
