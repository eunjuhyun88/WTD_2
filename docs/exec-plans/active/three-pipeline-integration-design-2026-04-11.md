# Three-Pipeline Integration Design

Date: 2026-04-11
Status: active
Scope: `/Users/ej/Downloads/maxidoge-clones/CHATBATTLE`
Branch where foundation lands: `feat/phase0-contracts`

## Purpose

CHATBATTLE has **three separate pipelines** that must become **one trunk** because they share one contract: the `verdict_block`.

1. **A — Market Data → Verdict pipeline** (Alpha Terminal harness track)
2. **B — Game/Decision Result → ORPO learning pipeline**
3. **C — Decision Journal bridge** (ties A output to B input)

Doing them independently leads to drift and full re-refactors. This doc defines the single correct execution order: **contract-first, then pipelines, then learning, then NL**.

## Why a New Top-Level Design Is Needed

The existing docs cover the three tracks in isolation:

- **Cluster 1** `docs/exec-plans/active/alpha-terminal-harness-*.md` (6 files, ~3,288 LOC) — A pipeline only
- **Cluster 4** `docs/ORPO_DATA_SCHEMA_PIPELINE_v1_2026-02-26.md` + `docs/PASSPORT_ML_ORPO_LEARNING_ARCHITECTURE_v2_2026-02-25.md` — B pipeline only
- No document defines C (the bridge) at all

Without a trunk plan, A's `verdict_block` will ship in a shape that B can't consume, and C will be reinvented every time a new endpoint is written.

## Source Material (Inventory Verified 2026-04-11)

Data-pipeline-adjacent documents total **~7,900 LOC across 17 files** in 5 clusters:

### Cluster 1 — Alpha Terminal Harness (canonical A, 3,288 LOC)

| File | LOC | Role |
|---|---|---|
| `docs/exec-plans/active/alpha-terminal-harness-engine-spec-2026-04-09.md` | 604 | Engine contract spec (raw→feat→evt→struct→verdict authority chain) |
| `docs/exec-plans/active/alpha-terminal-harness-methodology-2026-04-09.md` | 703 | LLM + multimodal approach, tool taxonomy |
| `docs/exec-plans/active/alpha-terminal-harness-html-dissection-2026-04-10.md` | 441 | HTML atom-level ledger (6-contract × 5-port classification) |
| `docs/exec-plans/active/alpha-terminal-harness-boundary-2026-04-10.md` | 362 | Engine vs LLM boundary rule |
| `docs/exec-plans/active/alpha-terminal-harness-i18n-contract-2026-04-10.md` | 761 | Locale axis rules |
| `docs/exec-plans/active/alpha-terminal-harness-rationale-2026-04-10.md` | 417 | Trader + engineer dual-lens rationale |

### Cluster 2 — Alpha Flow UI Integration (1,358 LOC)

| File | LOC | Role |
|---|---|---|
| `docs/exec-plans/active/alpha-flow-terminal-integration-2026-04-10.md` | 679 | 3-panel reimpl + Alpha Flow UI absorb + Deep Dive artifact |
| `docs/design-docs/alpha-flow-terminal-uiux.md` | 679 | UI/UX canonical |

### Cluster 3 — Terminal Scan Engine (877 LOC)

| File | LOC | Role |
|---|---|---|
| `docs/TERMINAL_SCAN_E2E_SPEC.md` + `docs/references/active/TERMINAL_SCAN_E2E_SPEC.md` | 248×2 | scan endpoint → scoring → verdict E2E |
| `docs/references/active/terminal-refactor-master-plan-2026-03-06.md` | 196 | Terminal refactor master plan |
| `docs/feature-specification.md` | 380 | Feature spec |
| `docs/TOOL_DESIGN.md` | 53 | Tool design |

### Cluster 4 — ORPO Learning Pipeline (canonical B, 1,046 LOC)

| File | LOC | Role |
|---|---|---|
| `docs/ORPO_DATA_SCHEMA_PIPELINE_v1_2026-02-26.md` (+ `references/active/` copy) | 327 | `decision_trajectories` → `ml_preference_pairs` → train/eval schema + chosen/rejected generation pipeline |
| `docs/PASSPORT_ML_ORPO_LEARNING_ARCHITECTURE_v2_2026-02-25.md` | 355 | Passport ML + ORPO learning architecture |
| `docs/PASSPORT_BACKEND_ARCHITECTURE_v1_2026-02-25.md` | 364 | Passport backend structure |

### Cluster 5 — Supporting contracts (1,075 LOC)

| File | LOC | Role |
|---|---|---|
| `docs/API_CONTRACT.md` | 874 | API contract (endpoints, req/resp) |
| `docs/INTEL_TRADING_DECISION_POLICY_2026-02-25.md` | 201 | Intel-based trading decision policy |
| `docs/HARNESS.md` | 33 | Harness layers (docs governance, context quality, smoke, browser, benchmark) |

### Structural Drift Observations

| Issue | Impact |
|---|---|
| **Multiple canonical docs for the same topic** — terminal/scan lives in Cluster 1, 2, and 3 | Every task requires reading 3 places |
| **Harness package (Cluster 1) is the most recent and most complete** — 2026-04-09~10 | But terminology may collide with Cluster 3 (March 2026) |
| **Harness dissection §9 open questions unresolved** — no §10 "Resolved decisions" section | P0 implementation is gated on these 6 decisions |
| **ORPO pipeline is an independent track** — Cluster 4 is "game → learning", Cluster 1~3 are "market → verdict" | No doc defines where they meet (C bridge missing) |
| **Code drift** — `src/lib/server/scanEngine.ts` (1,131 lines) has 0 references to `raw.*/feat.*/event.*` IDs | Contract namespace exists only on paper |

## Non-Negotiable Invariants

1. **Contract-first.** No new pipeline code lands before `src/lib/contracts/*` is frozen.
2. **One `verdict_block` shape** shared by A, B, and C. If B needs a field, it gets added to the shared schema — B does not copy and mutate.
3. **C never owns computation.** C only stores and resolves outcomes.
4. **Legacy `alphaScore` stays as a secondary ranking field** inside `verdict_block` until Phase 3 exit. Not removed.
5. **No rewrite.** Existing live WIP on `codex/terminal-wip-sync-20260410` must not be overwritten.
6. **Zod is the single runtime validator.** All cross-boundary payloads (server ↔ client, DB ↔ code, LLM ↔ tool) go through the same zod schemas defined in `src/lib/contracts/`.

## Three-Pipeline Dependency Graph

```
┌─────────────────────────────────────────────────────────────┐
│                                                              │
│  ① Market data (raw)                                         │
│     ↓  (A-P0: server loaders + raw registry)                │
│  ② Features (feat.*)                                         │
│     ↓  (A-P1: event emitters)                               │
│  ③ Events (event.*)                                          │
│     ↓  (A-P2: structure state machine)                      │
│  ④ Structural state (state.*)                                │
│     ↓  (A-P3: verdict assembler)                            │
│  ⑤ verdict_block                                             │
│     │  ← A's output, B's input                              │
│     ↓                                                        │
│  ⑥ [C: Decision Journal]                                    │
│     │  verdict_block + user/agent decision + scope + ts      │
│     │  → decision_trajectories table row                    │
│     ↓                                                        │
│  ⑦ Time passes                                               │
│     ↓  (C: outcome resolver — price/event follow-up)        │
│  ⑧ Outcome (pnl, TP/SL hit, structure_state transition)    │
│     ↓                                                        │
│  ⑨ [B: ORPO pair generator]                                 │
│     │  same context → A verdict vs alt (random/heuristic/   │
│     │  legacy) → chosen / rejected by outcome margin        │
│     ↓                                                        │
│  ⑩ ml_preference_pairs table                                │
│     ↓                                                        │
│  ⑪ [B: train / eval] → LLM / policy update                  │
│     │                                                        │
│     └──→ feedback: next verdict generation consumes update  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Key Observations

- **⑤ `verdict_block` is the single contract tying A to B.** If it drifts, both pipelines drift.
- **⑥ `decision_trajectory` schema is C itself.** Tables `decision_trajectories` and `ml_preference_pairs` already exist per `ORPO_DATA_SCHEMA_PIPELINE_v1 §2`. But there is **no mapping** of how A's `verdict_block` embeds into those rows. That mapping is Phase 0's deliverable.
- **⑧ Outcome resolver is the time axis of the whole pipeline.** A only knows "now", B needs "later". The resolver fills the gap by watching price + structural transitions on a schedule.

## Why Wrong Order Breaks Everything

| Wrong order | Result |
|---|---|
| **A first, B later** | `verdict_block` freezes in a shape B cannot use for pair generation. Full re-refactor. |
| **B first, A later** | Pair `context` is legacy `scanEngine` output. Pair quality is low. Training is wasted. |
| **Skip C** | `decision_trajectories` accepts arbitrary shapes. No offline replay possible. Learning cannot reproduce. |
| **Three in parallel** | Each track assumes a different `verdict_block`. Merge requires full rewrite. |

## Correct Execution Order — Single Trunk

**Principle: contract-first.** Before Phase 1, the two schemas below must be frozen and committed:

1. `verdict_block` schema (A's output = B's input = C's storage unit)
2. `decision_trajectory` row schema (C's row, embedding verdict_block)

### Phase 0 — Contract Freeze (1~2 days)

| Step | Deliverable | Source |
|---|---|---|
| 0.1 | `src/lib/contracts/verdict.ts` — `VerdictBlock` zod schema + TypeScript type | harness engine-spec §§ (verdict) |
| 0.2 | `src/lib/contracts/trajectory.ts` — `DecisionTrajectory` row zod schema (verdict_block embed + outcome slot) | ORPO_DATA_SCHEMA_PIPELINE_v1 §2 + engine-spec verdict contract |
| 0.3 | `docs/exec-plans/active/alpha-terminal-harness-html-dissection-2026-04-10.md` §10 — Resolved decisions answering the 6 open questions in §9 | dissection.md §9 |
| 0.4 | `src/lib/contracts/ids.ts` — contract ID namespace enum (`raw.*`, `feat.*`, `event.*`, `state.*`, `verdict.*`, `trajectory.*`, `pair.*`) | harness engine-spec §1 |
| 0.5 | `src/lib/contracts/index.ts` — barrel re-export |  |

**Exit gate**: `src/lib/contracts/` folder committed on `feat/phase0-contracts`. All subsequent code imports from here. `npm run check` green.

### Phase 1 — A-P0 + C-schema in parallel (1 week)

| Track | Content |
|---|---|
| **A-P0** | Move the 21 network atoms (dissection §1) to `src/lib/server/providers/` — one file per source. Extract raw fetches from `scanEngine.ts` only. Wire into registry using `raw.*` IDs. |
| **C-schema** | Add `verdict_block_json` column (JSONB) to `decision_trajectories` table. Round-trip test: `trajectory_id → verdict_block → zod parse`. Outcome columns start nullable. |

**Parallel rationale**: As soon as A-P0's `raw.*` IDs stabilize, C can decide which fields belong inside `verdict_block_json`.

### Phase 2 — A-P1 (events) + C outcome resolver (1 week)

| Track | Content |
|---|---|
| **A-P1** | Rewrite F4~F17 (dissection §3) as event emitters. Each threshold emits a typed `event.*` ID. Replace scoring logic in `scanEngine.ts` with event aggregation. |
| **C outcome** | Worker that attaches time-based outcome to trajectories. Watches price for TP/SL hit, structural state transitions. Fills `trajectory.outcome_*` fields. |

### Phase 3 — A-P2 (structure) + A-P3 (verdict) (1~2 weeks)

| Track | Content |
|---|---|
| **A-P2** | Extend `l1Wyckoff.ts` into a structural state machine (ACC / RE_ACC / DIST / RE_DIST / MARK_UP / MARK_DOWN / UNKNOWN). MTF becomes per-TF state aggregation, not re-running L1 per TF. |
| **A-P3** | `verdict_block` assembler. Replace `computeAlpha`. Keep ranking-compatible `legacy_alpha_score` field. |

**Exit gate**: `scanEngine.ts` god-file split into `src/lib/server/scan/{loaders,features,events,structure,verdict,aggregator}.ts` (6 files). All imports continue to work via barrel re-export.

### Phase 4 — B pair generator + extended indicators (2 weeks)

| Track | Content |
|---|---|
| **B-P1** | `decision_trajectories` → `ml_preference_pairs` converter. For the same context, generate (A verdict) vs (legacy / random / heuristic) pairs. `margin = outcome_delta`. |
| **B-P2** | Wire train/eval job hooks. Reuse existing `ml_train_jobs`, `ml_eval_reports` tables. |
| **Extended indicators** | Add missing on-chain indicators (MVRV Z-score normalization, STH P&L to Exchanges, UTXO Age Bands, Sharpe short-term, Material Indicators-style orderbook) as new A-P0 raw loaders. Free because the structure already exists. |

### Phase 5 — A-P4 (NL routing) + multimodal (1 week)

| Content |
|---|
| Wire harness dissection §7 NL routing matrix to the real `terminal/message` endpoint. |
| Multimodal chart image → `{symbol, timeframe, focus}` extraction → existing contract call. |
| Tool schemas for LLM are generated from the zod schemas in `src/lib/contracts/` (one source of truth). |

### Dependency Summary

```
Phase 0 (Contract Freeze)
   │
   ├─→ Phase 1: A-P0 ∥ C-schema
   │      │
   │      └─→ Phase 2: A-P1 ∥ C-outcome
   │             │
   │             └─→ Phase 3: A-P2 → A-P3
   │                    │
   │                    └─→ Phase 4: B-pair ∥ extended indicators
   │                           │
   │                           └─→ Phase 5: A-P4 (NL + multimodal)
```

**Total estimate**: 7~9 weeks (single engineer, full-time).
**Earliest payoff**: End of Phase 3 — scanEngine decomposed + `verdict_block` stable → terminal UI produces consistent answers across click, NL, and deep-dive.

## Phase 0 — Concrete Deliverables

| # | File | Basis | Status |
|---|---|---|---|
| 1 | `src/lib/contracts/ids.ts` — contract ID namespace | harness engine-spec §1 | ✅ Landed on `main` (92c1e56 + f84b451). `FORCE_ORDERS_4H` added 2026-04-11 per dissection §10 Q6. |
| 2 | `src/lib/contracts/verdict.ts` — VerdictBlock zod + type | harness engine-spec verdict section | ✅ Landed on `main` (92c1e56). `legacy_alpha_score` kept nullable per dissection §10 Q5. |
| 3 | `src/lib/contracts/trajectory.ts` — DecisionTrajectory zod + type | ORPO_DATA_SCHEMA_PIPELINE_v1 §2 + verdict embed | ✅ Landed on `main` (92c1e56). |
| 4 | `src/lib/contracts/index.ts` — barrel re-export | — | ✅ Landed on `main` (92c1e56). |
| 5 | `src/lib/contracts/registry.ts` — raw-source subscription shape (bonus, not in original plan) | Phase 0 review 2026-04-11 | ✅ Landed on `main` (f84b451). |
| 6 | `docs/exec-plans/active/alpha-terminal-harness-html-dissection-2026-04-10.md` §10 — Resolved decisions | dissection.md §9 | ✅ Written 2026-04-11 on `claude/objective-vaughan`. |

### Phase 0 exit gate — CLOSED (2026-04-11)

| Gate | Result |
|---|---|
| All five contracts files committed to `main` | ✅ |
| `zod` explicitly pinned in `package.json` (`^3.25.76`, L101) | ✅ |
| Dissection §10 Resolved decisions written (all 6 Q1–Q6 answered) | ✅ |
| `FORCE_ORDERS_4H` added to `ids.ts` per §10 Q6 | ✅ |
| `npm run check` — 2928 files, 0 errors, 0 warnings | ✅ |
| `npm run build` — built in ~15s, no errors | ✅ |

Phase 1 (A-P0 + C-schema in parallel) is now unblocked.

## Zod as Foundation — Why

CHATBATTLE already ships zod 3.25.76 as a transitive dependency via `@walletconnect/ethereum-provider → @reown/appkit → abitype → zod`. It is not in `package.json` dependencies explicitly, but it is available at runtime. Phase 0 must pin it explicitly to stop the transitive dependency from disappearing if a parent package drops it.

Current validation in `src/lib/server/apiValidation.ts` is manual (regex + helper functions like `toNumber`, `normalizePair`). This does not scale to nested structures like `VerdictBlock`. Zod gives:

1. Runtime validation with TypeScript type inference via `z.infer<typeof Schema>`.
2. Cross-boundary safety (server → client, DB JSONB → code, LLM tool args → handler).
3. LLM tool schema generation via `zod-to-json-schema` — one source of truth for both the handler signature and the LLM-visible function description.
4. Composability (`.partial()`, `.pick()`, `.omit()`, `.extend()`) for schema variants (e.g. `VerdictBlockForPair = VerdictBlockSchema.omit({ data_freshness: true })`).
5. Structured error messages with paths, so clients and dashboards can render "which field failed validation where".

## Relationship to Other In-Flight Work

### Track A — Terminal Consolidation (zealous-shannon worktree)

Scanner dead-code removal + alpha terminal mockup. Pure UI shell cleanup, engine-agnostic. **Parallel-safe** with Phase 0 because it touches `src/routes/cogochi/scanner/` and `src/routes/terminal/` only, not `src/lib/server/scanEngine.ts` or `src/lib/contracts/`.

### Alpha Flow UI Integration (Cluster 2, already live on `codex/terminal-wip-sync-20260410`)

3-panel terminal layout + Alpha Market Bar in header. **Already shipped** to `codex/terminal-wip-sync-20260410` (commit `e0760c6 refactor(home): slim AlphaMarketBar + hide from home chrome`). No conflict with Phase 0 — it only touches presentation.

### Repo-Wide Refactor Design (`docs/exec-plans/active/chatbattle-repo-wide-refactor-design-2026-04-11.md`)

W3 (state-authority repair) and W4 (terminal / cogochi convergence) overlap with this document's Phase 3. When Phase 3 starts, the scanEngine decomposition should be driven by both documents.

### Dormant Worktrees

- `delightful-bubbling-meteor` → retired, preserved as `experiment/home-characters` branch
- Other `claude/*` worktrees → still contain candidate commits that may seed Phase 2 event emitters or Phase 4 extended indicators

## Do Not Mix Into Phase 0

- New engine or layer math (belongs to Phase 1~3)
- UI redesign (belongs to Cluster 2)
- Archive cleanup (belongs to repo-wide refactor)
- Extended indicators (belongs to Phase 4 — after structure is stable)

## Success Metrics

### Contract metrics

- `src/lib/contracts/` is the **only** place that defines field names for `verdict_block`, `trajectory`, `raw.*`, `feat.*`, `event.*`, `state.*`, `pair.*`.
- Every cross-boundary payload (server ↔ client, DB ↔ code, LLM ↔ handler) runs through a zod parse.
- `grep -r "verdict_block" src/` returns imports from `$lib/contracts`, not ad-hoc interface definitions.

### Structural metrics

- `src/lib/server/scanEngine.ts` is decomposed into ≤ 6 files under `src/lib/server/scan/` by end of Phase 3.
- No file above ~700 LOC in the scan engine surface.
- Magic numbers in scanEngine move to a named config registry.

### Pipeline metrics

- A trajectory row can be round-tripped: `scan → verdict_block → trajectory insert → trajectory select → zod parse → verdict_block`, no shape loss.
- Outcome resolver can close a trajectory within the target window (e.g. 4h for short-term setups).
- Pair generator can produce `chosen / rejected` pairs from any resolved trajectory batch.

### Surface metrics

- NL router (Phase 5) calls the same contracts as click UI — single source of computation.
- Terminal chat answers are byte-for-byte reproducible from `(verdict_block, pair_reference?)`.

## Open Questions Forwarded From Harness Dissection §9

Phase 0.3 must close each of these in a new §10 Resolved decisions section in `alpha-terminal-harness-html-dissection-2026-04-10.md`:

1. **Timeframe authority** — Does engine OI-change compute at fixed 5m×12 + 1h×6, with `#period` as pure display control?
2. **Sector taxonomy** — Flat enum or 2-level registry (chain ecosystem + narrative)?
3. **Watchlist persistence scope** — Per-user (authenticated) or per-device (localStorage)?
4. **Multimodal image parsing** — Commit now or defer to P4?
5. **Alpha score fate** — Keep as secondary ranking, or drop after P3?
6. **Live force-orders window** — 1H only, or widen to 4H + 24H rolling?

Each answer is a locked decision and a named constant in the config registry.

## Next Slice

After this document lands:

1. Finish `src/lib/contracts/verdict.ts`, `trajectory.ts`, `index.ts` on `feat/phase0-contracts`.
2. Pin zod explicitly in `package.json`.
3. Close the 6 dissection §9 questions as §10 Resolved decisions.
4. Run `npm run check` and `npm run build` as the Phase 0 exit gate.
5. Only then start Phase 1 (A-P0 + C-schema in parallel).
