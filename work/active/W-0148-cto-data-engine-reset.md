# W-0148 — CTO Data Engine Reset

## Goal

현재 `app`/`engine`/local state/fallback storage 에 흩어진 시장 데이터, 패턴 상태, 연구 코퍼스 경계를 다시 정의하고, `engine` 중심의 canonical data engine 으로 수렴시키는 실행 가능한 reset plan 과 첫 refactor slice 를 실제 코드에 반영한다.

## Owner

engine

## Primary Change Type

Engine logic change

## Scope

- 현재 데이터 수집/정규화/저장/서빙 경로 inventory 작성
- 문서상 target plane 과 실제 코드 간 불일치 정리
- merge / split / park 기준을 CTO queue 로 재정렬
- target architecture 문서화
- Phase 0 blocking setup (`PR0.1` docs normalize, `PR0.2` contract/proxy split) 구현
- 첫 bounded fact-plane refactor slice 의 landing zone 만 연다

## Non-Goals

- 이번 슬라이스에서 모든 legacy app market route 를 제거
- 모든 local SQLite / JSON / CSV store 를 shared Postgres 로 즉시 이전
- 모든 parked branch 를 한 번에 머지 완료

## Canonical Files

- `AGENTS.md`
- `work/active/CURRENT.md`
- `work/active/W-0148-cto-data-engine-reset.md`
- `work/active/W-0146-lane-cleanup-and-merge-governance.md`
- `work/active/W-0141-market-data-plane.md`
- `work/active/W-0122-free-indicator-stack.md`
- `work/active/W-0145-operational-seed-search-corpus.md`
- `docs/domains/terminal-ai-scan-architecture.md`
- `docs/domains/canonical-indicator-materialization.md`
- `docs/decisions/0003-infra-chart-architecture-2026-04-21.md`
- `engine/api/main.py`
- `engine/api/routes/ctx.py`
- `engine/api/routes/facts.py`
- `engine/scanner/scheduler.py`
- `engine/market_engine/fact_read_models.py`
- `engine/data_cache/loader.py`
- `engine/capture/store.py`
- `engine/patterns/state_store.py`
- `engine/research/state_store.py`
- `app/src/lib/server/marketSnapshotService.ts`
- `app/src/lib/server/enginePlanes/facts.ts`
- `app/src/lib/server/enginePlanes/search.ts`
- `app/src/lib/server/enginePlanes/runtime.ts`
- `app/src/lib/server/marketDataService.ts`
- `app/src/lib/server/marketFeedService.ts`
- `app/src/routes/api/market`
- `app/svelte.config.js`
- `app/package.json`
- `app/Dockerfile`
- `cloudbuild.app.yaml`
- `docs/runbooks/cloud-run-app-deploy.md`

## Facts

1. 실제 checkout 기준으로 market fact assembly 는 여전히 `app/src/routes/api/market/*` + `marketSnapshotService.ts` 가 많이 소유하고 있고, 이는 `engine is the only backend truth` 와 충돌한다.
2. `engine`의 durable state 는 capture/runtime/research/ledger 가 각각 SQLite, JSON/file, Supabase mirror, CSV cache 로 나뉘어 있어 운영 truth 가 분산돼 있다.
3. `CURRENT.md` 와 active work item 문서는 fact/search/surface plane 을 정의하지만, `seed_search`, `market_corpus`, `reference-stack`, `chain-intel` 등 일부 lane 은 현재 checkout 에서 파일/route 가 비어 있거나 다른 형태다.
4. `worker-control` / scheduler 는 이미 존재하지만, 현재 job set 은 scan/alert/outcome 중심이며 always-on corpus accumulation 과 normalized fact refresh 중심으로 재편되지 않았다.
5. local branch landscape 에는 clean lane 과 parking lane 이 공존하고 있어, merge 는 기능보다 plane purity 기준으로 다시 분류해야 한다.
6. first refactor slice now exists as `docs/decisions/0004-cto-data-engine-reset-2026-04-23.md` plus engine `GET /ctx/fact`, which opens an engine-owned bounded fact landing zone without widening app fan-out further.
7. current repository has canonical Cloud Run deploy paths for `engine-api` and `worker-control`, but `app-web` is still configured around `@sveltejs/adapter-vercel`, so the full three-runtime topology is not yet executable from the repo as one server-operable system.
8. this branch now adds an `app-web` dual-target build (`vercel` default, `cloud-run` via `@sveltejs/adapter-node`), `cloudbuild.app.yaml`, and a Cloud Run app deploy runbook, so the three-runtime topology is executable from repository artifacts.
9. Cloud Run smoke exposed two real server blockers on the app surface: `/api/confluence/current` had route-local helper leakage that broke Node builds, and `/healthz` / `/readyz` were incorrectly behind the auth redirect path.
10. `origin/main` is now at `cf657e39` after PR #241 and PR #242, so this lane's remaining work is queue hygiene only; the next real execution lanes stay `W-0122 -> W-0145 -> W-0142 -> W-0160 -> W-0159`.
11. common feature math and pattern-family interpretation are still too easy to conflate; the reset must explicitly separate `data engine feature production` from `pattern engine phase/replay logic`.
12. the repo already has substantial pattern-runtime primitives in place: `PatternObject` / pattern registry, capture + research_context writes, durable pattern state, outcome ledger, verdict inbox, and refinement stats are implemented, but they are not yet normalized into one canonical runtime contract family.
13. for the TRADOOR/PTB “Pattern Research OS” direction, the biggest missing layer is not a brand-new model or giant table family; it is a contract-first split between `pattern definition`, `feature snapshot`, `runtime state`, `outcome/judgment`, and `promotion` planes.

## Assumptions

1. 첫 refactor slice 는 전체 이전이 아니라 canonical boundary 를 코드로 여는 bounded engine read model 부터 시작한다.
2. app surface 는 당분간 legacy route 를 유지하더라도, 새 소비 경로는 engine-owned read model 로 수렴해야 한다.

## Open Questions

- `W-0122` 문서상 fact-plane files 중 현재 checkout 에 없는 lane 은 다른 clean branch 에서 extraction 할지, 현재 branch 에서 재구현할지 결정이 필요하다.
- shared Postgres canonical schema 를 `Supabase` 단일 plane 으로 고정할지, app DB 와 engine DB 를 장기적으로 분리할지 최종 결정이 필요하다.

## Decisions

- 이번 lane 은 기존 `W-0141` UI/workspace data plane 보다 상위의 CTO reset lane 으로 다룬다.
- merge / split / park 판단은 branch 이름이 아니라 `fact`, `search`, `surface`, `docs-only` plane purity 로 내린다.
- canonical target 은 `engine-owned ingress + fact plane + search plane + runtime state`, `app-owned surface plane` 이다.
- target topology 는 `raw provider -> fact plane -> search plane -> agent context -> surface` 로 고정한다.
- raw retention policy is `store enough to replay, audit, and recompute`, not `store every provider byte forever`.
- canonical raw plane stores normalized, queryable market facts with provenance/freshness/quality metadata; provider-native blobs stay in short-lived cache/object storage only.
- data worth durable canonical storage is limited to reusable low-level truth: market bars, perp snapshots, orderflow bars, liquidation events or aggregates, on-chain/fundamental/macro snapshots, and human research inputs.
- derived reusable math (`zscore`, `percentile`, `slope`, `divergence`, `duration`, `regime`) belongs to the canonical feature plane and must be computed once per bar/window, not inside pattern families.
- surface, AI, and pattern/search lanes do not read provider blobs directly; they consume fact read models, feature windows, signatures, and runtime state only.
- `runtime state / workflow state` 는 위 topology 와 별도로 존재하는 engine-owned state plane 으로 분리한다.
- `WorkspaceBundle` 은 UI-neutral read model 인 경우에만 fact/read-model 로 인정하고, panel placement / pin / compare / presentation field 가 섞이면 `surface adapter` 로 본다.
- `app` 의 ingress/fact/search adapter 들은 최종 ownership 이 아니라 migration bridge 로만 유지한다.
- execution spec 은 `docs/domains/terminal-ai-scan-architecture.md` 의 plane contract table, owner routes, storage rules, cutover plan 을 canonical implementation guide 로 삼는다.
- calculation-ready indicator definitions, materialized feature stores, and corpus signatures are fixed in `docs/domains/canonical-indicator-materialization.md`.
- common feature production belongs to the data engine; pattern engines may only consume canonical features and define phase/family/replay rules on top.
- 데이터 종류별 canonical `table / cache / route / job` 분해는 같은 문서의 `Data Domain Split` 표를 구현 기준으로 삼는다.
- 새 데이터/패턴 lane 은 같은 문서의 `Canonical Lane Design Pattern` 과 `Lane Checklist` 를 먼저 채운 뒤 구현한다.
- 첫 code slice 는 app-side raw provider fan-out 을 당장 다 없애는 대신, engine 에 bounded fact-context route 를 열어 이후 migration 의 landing zone 을 만든다.
- current executable slice after `/ctx/fact` is the first fact batch route extraction: `GET /facts/price-context`, `GET /facts/perp-context`, `GET /facts/reference-stack`, `GET /facts/confluence`.
- `codex/parking-20260423-mixed-lanes` 에 있는 `W-0142`, `W-0143`, `W-0144` commits 는 direct merge 금지이며 clean main-based extraction 대상이다.
- `W-0148` 는 architecture owner only 다. lane-specific product code 는 `PR0.2` 이후 각 work item lane 으로 넘긴다.
- `W-0146` 는 governance/reference lane 이며 execution lane 으로 간주하지 않는다.
- `W-0141` 는 workspace/data-contract assist lane 이며 상위 architecture owner 가 아니다.
- `engine/market_engine/indicator_catalog.py` 는 `W-0122` 소유 fact-plane inventory 파일이며 `W-0148` 범위로 흡수하지 않는다.
- parallel lanes (`W-0122`, `W-0145`, `W-0142`) 는 `PR0.2` contract/proxy split 이 merge 되기 전에는 열지 않는다.
- CTO execution method follows a Karpathy-style auto-research loop: `seed -> hypothesis -> bounded contract -> eval -> promotion -> failure memory`.
- no lane is considered complete because it exists in code alone; completion requires durable artifacts plus promotion through `cataloged -> readable -> operational -> promoted`.
- every new lane must name its evaluation artifact before claiming promotion. Route tests are the minimum gate; replay packs / benchmark cases are required once the lane touches search or pattern logic.
- `PR0.2` app proxy rule: app server handlers must not assemble plane URLs inline once a plane client exists; they must call `app/src/lib/server/enginePlanes/{facts,search,runtime}.ts`.
- `PR0.2` client rule: new app consumers must read canonical engine planes through `/api/facts/*`, `/api/search/*`, `/api/runtime/*`; `/api/engine/*` remains compatibility-only.
- production topology for this reset is `app-web`, `engine-api`, and `worker-control` on separate runtimes; `app-web` must support both current Vercel compatibility and a canonical Cloud Run node build so the repo can run as an all-server deployment without re-architecting the app later.
- `app-web` on Cloud Run remains surface/orchestration only: it may proxy canonical `facts/search/runtime` contracts and own public auth/session/readiness, but it must not absorb engine compute or privileged worker secrets.
- server health/readiness endpoints (`/healthz`, `/readyz`) are public operational surfaces and must remain outside page-auth redirects.
- after PR #241 / #242 layered onto PR #236 / #238 / #239 and earlier PR #230 / #231 / #232, the post-merge execution queue is still `W-0122 facts -> W-0145 search -> W-0142 runtime -> W-0160 contract follow-up -> W-0159 public liquidation source`, not another branch-extraction wave.
- branch split reason for this refresh: local `codex/w-0148-current-plan-refresh-20260424` carries unrelated engine WIP in another checkout, so post-merge plan updates must land as clean docs-only merge units from updated `main`.
- pattern runtime decomposition is `contract-first`, not `DB-first`: first normalize read/write route families and ownership around existing primitives, then decide which durable stores to merge, rename, or replace.
- pattern research OS follow-ups must treat `pattern definition`, `feature snapshot`, `runtime state`, `outcome/judgment`, and `promotion` as separate merge units; reopening them as one giant runtime rewrite is forbidden.

## Current Layer Map

| Layer | Current owners / files | Current reality | CTO judgment |
|---|---|---|---|
| Raw provider ingress | `app/src/lib/server/marketDataService.ts`, app provider adapters, engine loaders/cache | raw fetch bag is still mostly app-owned | keep only as temporary adapter/proxy surface |
| Fact plane | `engine/api/routes/ctx.py`, engine `market_engine.fact_plane`, `app/src/routes/api/market/*`, `marketSnapshotService.ts`, `terminalParity.ts` | same market truth is assembled in both app and engine | most urgent refactor target |
| Search plane | `engine/research/pattern_search.py`, scheduler/worker-control, parked `seed_search` / `market_corpus` lanes | replay/search runtime exists, but retrieval/corpus lane is not yet cleanly extracted | second priority after fact-plane |
| Runtime state | `engine/capture/*`, `engine/patterns/state_store.py`, `engine/research/state_store.py`, ledger/runtime stores | capture, ledger, pattern state, research state live outside fact/search and must stay engine-owned | separate state plane, not a fact/search subtype |
| Agent context | `app/src/routes/api/cogochi/terminal/message/+server.ts`, `app/src/lib/server/douni/contextBuilder.ts`, `app/src/lib/server/intelPolicyRuntime.ts` | AI context is assembled in app from mixed facts and surface state | keep app shell, narrow inputs to bounded contracts |
| Surface plane | `app/src/routes/terminal/+page.svelte`, `app/src/lib/cogochi/workspaceDataPlane.ts`, `TradeMode.svelte`, `terminalBackend.ts` | UI still carries orchestration and some derived semantics | acceptable only after upstream planes are frozen |

## Target Architecture

### 1. Ingress

- owner: `engine`
- role: provider auth, timeout, retry, quota, freshness, degraded state
- allowed output: provider-shaped payload or normalized low-level adapter object
- forbidden: scan score, AI explanation, UI-ready summary

### 2. Fact Plane

- owner: `engine`
- role: canonical market/read models for one symbol/timeframe or market-wide context
- primary objects:
  - `FactSnapshot`
  - `ReferenceStackSnapshot`
  - `ChainIntelSnapshot`
  - `MarketCapSnapshot`
  - `ConfluenceResult`
- canonical entrypoint now: `GET /ctx/fact`

### 3. Search Plane

- owner: `engine` + `worker-control`
- role: live scan, seed-search, catalog, corpus retrieval, replay/rerank
- primary objects:
  - `ScanResult`
  - `PatternCatalogEntry`
  - `SeedSearchRequest`
  - `SeedSearchResult`
  - `CorpusWindowSignature`
- rule: search reads facts/corpus; facts never depend on search

### 4. Agent Context

- owner: `engine` contract, `app` shell
- role: compress `fact + search + workspace selection` into `AgentContextPack`
- rule: AI does not call raw providers directly
- rule: prompt builder may stay in app, but context truth must come from bounded engine/search contracts

### 5. Runtime State

- owner: `engine`
- role: persist workflow state that is neither market fact nor search result
- primary objects:
  - `CaptureRecord`
  - `PinnedWorkspaceState`
  - `SavedSetup`
  - `PatternRuntimeState`
  - `ResearchContext`
  - `LedgerRecord`
  - `OutcomeRecord`
- rule: runtime state may reference facts/search outputs, but it is its own plane
- rule: `capture`, `pins`, `saved setup`, `pattern state`, `ledger`, `research_context`, `outcome` do not belong in fact/search contracts

### 6. Surface

- owner: `app`
- role: chart, analyze, compare/pin, save setup, AI shell
- rule: surface consumes contracts only
- forbidden: direct provider fan-out and ad hoc market-truth recomposition

## File Ownership Map

| File | Keep / move | Target layer | Action |
|---|---|---|---|
| `app/src/lib/server/marketDataService.ts` | keep temporarily | ingress adapter | freeze as raw fetch bag only; stop adding product semantics |
| `app/src/lib/server/scanEngine.ts` | shrink then retire | split across fact/search | stop extending in app; move scoring/fact shaping behind engine read models |
| `app/src/lib/server/terminalParity.ts` | keep temporarily | surface adapter | make it consume engine facts/search only; no new provider joins |
| `app/src/lib/cogochi/workspaceDataPlane.ts` | keep and narrow | surface composition | if bundle fields are UI-neutral keep them as fact/read-model inputs; if they encode compare/pin/layout semantics keep them here |
| `app/src/routes/api/cogochi/terminal/message/+server.ts` | keep | AI shell | SSE/tool loop only; no fact/search assembly beyond loading `AgentContextPack` |
| `app/src/lib/server/douni/contextBuilder.ts` | keep | agent prompt shell | token/history compression only; input contract becomes `AgentContextPack` |
| `app/src/lib/server/intelPolicyRuntime.ts` | split | fact/agent boundary | preserve scoring logic, but feed it canonical fact/evidence contracts instead of mixed app payloads |
| `app/src/lib/contracts/terminalBackend.ts` | split | contracts | break into `facts`, `search`, `agent`, `surface` contracts; current file is too broad |
| `engine/api/routes/ctx.py` | expand | fact gateway | keep growing as bounded engine fact landing zone |
| `engine/research/pattern_search.py` | split | search runtime | separate replay eval, catalog, selection, persistence before adding more features |
| `engine/capture/*` | keep | runtime state | canonical owner for user capture/setup workflow state |
| `engine/patterns/state_store.py` | keep | runtime state | canonical owner for pattern runtime state |
| `engine/research/state_store.py` | keep | runtime state | canonical owner for research/search workflow state |

## Dependency Rules

- `ingress -> fact` is allowed
- `fact -> search` is read-only and one-way
- `fact/search -> runtime state` is allowed
- `fact/search -> agent context` is allowed
- `runtime state -> agent context` is allowed as workflow context only
- `surface -> fact/search/agent` is allowed
- `surface -> runtime state` is allowed through engine-owned workflow APIs only
- `surface -> ingress` is forbidden
- `agent -> ingress` is forbidden
- `search -> surface` is forbidden
- `runtime state -> fact` is forbidden except for identifiers and cached references

## Execution Queue

1. `W-0122`: fact-plane consumer mainline after PR #236 / #238 — retire remaining market-cap/confluence bridges, push more consumers onto engine-preferred `/facts/*`, and open confluence scoring runway.
2. `W-0145`: search-plane promotion over the merged raw/search baseline — corpus accumulation, canonical `/search/*`, and read models that stop depending on broad live fan-out.
3. `W-0142`: runtime-state read/write family expansion — authoritative `/runtime/*` repositories for captures, research context, ledger, and workspace state.
4. `W-0160`: contract follow-up only — runtime capture/ledger scope policy, legacy backfill/sunset policy, durable definition namespace, and canonical key cleanup after PR #235 / #239 / #242.
5. `W-0159`: raw follow-up only — public or market-wide liquidation source decision, liquidation fact promotion, and next raw-family expansion only if a concrete retrieval/product gap remains.
6. `W-0156`: canonical `feature_windows` and reusable derived math promotion so cross-pattern feature truth stops living inside pattern families.
7. `W-0140`: surface slimming only after upstream fact/search/runtime contracts above are stable.
8. infra decisions: Cloud Run region choice plus production app-web env/secret wiring.

## Branch Plan

- `codex/w-0148-data-engine-reset`
  - docs + blocking contract split only
- `codex/w-0122-fact-plane-mainline`
  - active clean fact-plane execution lane; prioritize remaining consumer cuts over new side-lanes
- `codex/w-0145-*`
  - next clean `main`-based merge unit for corpus/search read-model promotion only
- `codex/w-0142-*`
  - next clean `main`-based merge unit for runtime-state repository/route expansion only
- `codex/w-0160-pattern-definition-plane`
  - follow-up lane for definition-scope policy/backfill/namespace decisions only; avoid new DOUNI-specific forks
- `codex/w-0159-*`
  - raw follow-up branch only if liquidation-source/product gaps are explicit
- docs-only queue refresh branches
  - merge-only references; do not reuse as execution lanes for product or engine code

## Next Steps

1. keep `CURRENT.md` aligned with merged mainline so the canonical order remains `W-0122 -> W-0145 -> W-0142 -> W-0160 -> W-0159`, and reject new branch-extraction work that bypasses that queue.
2. W-0156/W-0122 implementation lanes should codify the raw retention split explicitly: canonical normalized tables for replay-critical data, TTL cache for provider-native blobs, and materialized `feature_windows` as the cross-pattern contract.
3. freeze the data-engine vs pattern-engine ownership boundary so `W-0122` computes canonical features once and `W-0145` consumes them without duplicating math inside replay/search logic.
4. use the pattern-runtime decomposition note in `docs/domains/terminal-ai-scan-architecture.md` as the canonical checklist before opening the next runtime/search/promotion lanes.
5. app-web Cloud Run bootstrap still needs operator env/secret wiring on the real service plus a final region decision: least-privilege `DATABASE_URL`, `ENGINE_URL`, `ENGINE_INTERNAL_SECRET`, `PUBLIC_SITE_URL`, `SECURITY_ALLOWED_HOSTS`, and `asia-southeast1` vs `us-east4`.

## Exit Criteria

- current-state vs target-state architecture 가 문서로 명확히 정리된다.
- merge / split / defer queue 가 branch/action 수준으로 정리된다.
- engine 에 app migration 이 가능한 첫 bounded fact read model 이 실제로 존재한다.
- scoped verification 이 통과한다.

## Handoff Checklist

- active work item: `work/active/W-0148-cto-data-engine-reset.md`
- branch: `codex/w-0148-data-engine-reset`
- verification:
  - `uv run --directory engine python -m pytest tests/test_ctx_fact_route.py -q`
  - `uv run --directory engine python -m pytest tests/test_engine_runtime_roles.py -q`
- verification completed on this branch:
  - `cd app && APP_BUILD_TARGET=cloud-run npm run build`
  - `cd app && npm run test -- src/routes/api/confluence/current/confluence-current.test.ts 'src/routes/api/engine/[...path]/engine-proxy.test.ts'`
  - built `app-web` node server smoke: `GET /healthz -> 200`, `GET /readyz -> 503 degraded` with unreachable engine
- remaining blockers: shared-state migrations, legacy app market route cutover, and search-plane corpus implementation remain follow-up slices
