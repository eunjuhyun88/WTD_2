# CURRENT — 단일 진실 (2026-04-24)

> 이 파일 = 지금 무엇이 진행 중인지의 유일한 source of truth.
> 세션 시작 시 반드시 먼저 읽는다. 세션 종료 시 반드시 업데이트.

---

## main SHA

`fd0f4731` — current local `origin/main` ref after PR #216

## 완료 (이번 세션)

| PR | 내용 |
|---|---|
| #185 (W-0137) | C sidebar ANALYZE를 right-dock collapse + summary/detail 구조로 재분리 |
| #186 (W-0126) | ledger record store boundary refactor를 최신 mainline에 통합 |
| #188 (W-0136) | worker-control research CLI + W-0126 cutover preflight 보강 |
| #189 (W-0140) | bottom ANALYZE tab 상세 workspace 재구성 |
| #190 (W-0138) | `ENGINE_RUNTIME_ROLE` 기반 engine-api / worker-control split |
| #201 (W-0122) | consumer fact routes attach to engine facts (`reference-stack`, `chain-intel`) |
| #202 (W-0145) | search corpus store + worker-control corpus refresh + `/search/catalog` |
| #203 (W-0145) | corpus-only `/search/seed` and `/search/scan` routes + persisted run candidates |
| #205 (W-0145) | app search contracts aligned with canonical engine search payloads |
| #206 (W-0142) | runtime state route skeleton for captures, workspace pins, setups, research contexts, and ledger |
| #207 (W-0142) | app pattern captures routed through the runtime plane with degraded fallback |
| #208 (W-0143) | canonical app-side `AgentContextPack` loader over fact/search/runtime plane clients |
| #209 (W-0143) | DOUNI terminal message consumes bounded `AgentContextPack` through contextBuilder |
| #210 (W-0143) | `intel-policy` consumes bounded `AgentContextPack` summary without changing scoring |
| #211 (W-0139) | `TradeMode` recent saved captures read through runtime plane client |
| #212 (W-0139) | `TradeMode` confluence current/history reads moved behind terminal client helpers |
| #213 (W-0139) | `TradeMode` indicator side-fetch `/api/market/*` reads moved behind terminal client helpers |
| #214 (W-0139) | `TradeMode` candle-close analyze refresh moved behind terminal client helper |
| #215 (W-0139) | `TradeMode` outcome submit and alpha world-model reads moved behind terminal client helpers |
| #216 (W-0139) | terminal page review inbox count moved behind terminal client helper; terminal surface direct-fetch audit clean |

---

## 활성 Work Items (우선순위 순)

| ID | 파일 | 상태 | 핵심 미완 |
|---|---|---|---|
| **W-0160** | `W-0160-pattern-definition-plane.md` | 🔴 IN-PROGRESS | `/runtime/definitions/*` canonical read family over pattern library/registry + capture-linked research evidence |
| **W-0148** | `W-0148-cto-data-engine-reset.md` | 🔴 IN-PROGRESS | Phase 0 boundary program: docs/governance normalize + plane contract skeleton + proxy split |
| **W-0122** | `W-0122-free-indicator-stack.md` | 🔴 IN-PROGRESS | fact plane mainline: `GET /ctx/fact` expansion + canonical `/facts/*` routes + `indicator_catalog.py` inventory owner |
| **W-0145** | `W-0145-operational-seed-search-corpus.md` | 🔴 IN-PROGRESS | corpus accumulation + canonical `/search/*` route family |
| **W-0142** | `W-0142-manual-hypothesis-research-context.md` | 🔴 IN-PROGRESS | runtime state APIs for capture / pins / setups / research context / ledger |
| **W-0143** | `W-0143-query-by-example-pattern-search.md` | 🟢 COMPLETE | `AgentContextPack` loader + DOUNI + intel-policy migrations merged |
| **W-0139** | `W-0139-terminal-core-loop-capture.md` | 🟢 COMPLETE | terminal surface reads now route through fact/search/runtime/surface clients; direct-fetch audit clean |
| **W-0140** | `W-0140-analyze-tab-consolidation.md` | 🔴 IN-PROGRESS | bottom ANALYZE workspace must consume workspace envelope instead of duplicated local derivations |

## Reference / Assist Work Items

| ID | 파일 | 상태 | 역할 |
|---|---|---|---|
| **W-0146** | `W-0146-lane-cleanup-and-merge-governance.md` | 🟡 REFERENCE | merge governance / queue audit reference, not an execution lane |
| **W-0141** | `W-0141-market-data-plane.md` | 🟡 ASSIST | workspace/data contract assist lane, not top-level architecture owner |

## Deferred / Blocked

| ID | 파일 | 상태 | 핵심 미완 |
|---|---|---|---|
| **W-0126** | `W-0126-ledger-supabase-record-store.md` | 🟡 FOLLOW-UP | migration 018 + live preview redeploy + post-cutover stats hotfix 완료, canonical engine region 결정만 남음 |
| **W-0124** | `W-0124-engine-ingress-auth-hardening.md` | 🟠 DEFERRED | GCP ingress 인증 — infra 변경, 별도 세션 |

---

## Canonical Lane Order — Terminal AI / Scan

이 축은 아래 `5 planes + runtime state plane` 으로 고정한다. 순서를 어기면 surface 와 provider fan-out 이 다시 섞인다.

1. **Ingress**
   - raw provider fetch, cache, capability/freshness state
   - 규칙: product semantics 금지, `engine` 가 최종 owner
2. **Fact Plane (`W-0122`)**
   - `FactSnapshot`, reference stack, chain intel, market-cap, confluence, indicator catalog
   - 목적: AI 와 search 가 읽을 canonical market truth 구축
3. **Search Plane (`W-0145`)**
   - corpus accumulation, scan runtime, seed-search, catalog, candidate reports
   - 목적: live fan-out 없이 fact/corpus 기반 retrieval 확보
4. **Agent Context (`W-0143`)**
   - `AgentContextPack`, bounded AI inputs, route-by-route ad hoc joins 제거
   - 목적: AI 가 fact/search/runtime summary 만 읽도록 고정
5. **Surface Plane (`W-0139` + `W-0140`)**
   - terminal page, compare/pin, analyze workspace, save/setup UX
   - 목적: 위 plane 들의 결과만 소비해 trader workflow 를 닫음

별도 plane:

- **Runtime State (`W-0142`)**
  - capture, pins, saved setups, research context, ledger, outcomes
  - 규칙: workflow truth 는 fact/search cache 와 분리된 engine-owned authoritative store

규칙:

- UI 는 raw provider 를 직접 fan-out 하지 않는다.
- AI agent 는 bounded `agentContext` 와 read-model route 만 소비한다.
- historical / market-wide search 는 `worker-control` / scheduler corpus 에서만 확장한다.
- 새 provider 는 먼저 fact plane 에서 `live / blocked / reference_only` state 를 가져야 한다.
- `W-0148` 는 architecture owner only 이며, lane-specific product code 를 흡수하지 않는다.
- `W-0148` 의 blocking step 은 `PR0.2` contract/proxy split 이고, parallel lanes 는 그 뒤 `updated main` 에서 시작한다.
- `engine/market_engine/indicator_catalog.py` 는 `W-0122` fact-plane owner 파일이며 `W-0148` 로 흡수하지 않는다.

---

## Current Dirty Tree Snapshot

- active on `codex/w-0160-pattern-definition-plane`
- worktree: `/tmp/wtd-v2-w0160-pattern-definition`
- current slice: `/runtime/definitions/*` is open, runtime captures/search/research/refinement/training all preserve `definition_ref`, direct model train/promote routes plus `/runtime/ledger/*` projection expose it, runtime ledger store + pattern stats/model-registry read models carry it as first-class metadata, runtime ledger history / pattern model-history accept canonical `definition_id` queries, model-registry/model-history filter on persisted definition metadata instead of validation-only slug routing, canonical pattern model identity is now definition-version aware (`definition_id`-scoped keys + per-definition promotion/preferred lookup with legacy fallback), and `/patterns/{slug}/stats` now exposes explicit mixed-scope stats (`pattern-wide` outcomes + `definition-scoped` model artifacts)

---

## 즉시 실행 순서

1. **W-0148 / PR0.1** — docs/governance normalize
2. **W-0148 / PR0.2** — plane contract skeleton + plane-specific app proxies (`facts/search/runtime`)
3. **W-0122 / Lane A** — fact-plane canonical sub-routes + app compatibility bridges
4. **W-0145 / Lane B** — corpus/search stores + canonical `/search/*`
5. **W-0142 / Lane C** — runtime repositories + canonical `/runtime/*`
6. **W-0139 / Lane E.1** — terminal surface runtime/fact/search client slimming
7. **W-0140 / Lane E.2** — bottom ANALYZE slimming after terminal surface has no data ownership
8. **Cloud Run region decision** — `asia-southeast1/cogotchi` redeploy vs `us-east4/cogotchi` 유지 명시

---

## 브랜치 매핑

### Active / Existing

| 브랜치 | Work Item | 상태 |
|---|---|---|
| main | — | local `main` = `27952d95` |
| origin/main | — | local remote-tracking ref = `fd0f4731` |
| codex/w-0148-data-engine-reset | W-0148 | active Phase 0 lane; bounded engine fact landing zone + governance/contract split |
| codex/w-0160-pattern-definition-plane | W-0160 | active runtime lane for canonical pattern-definition read models |
| codex/w-0122-fact-plane-mainline | W-0122 | clean main-based execution lane |
| codex/w-0122-market-cap-fact-cut | W-0122 | active Lane A slice; engine market-cap fact route + macro consumer fallback cut |
| codex/parking-20260423-mixed-lanes | parking | preservation-only mixed snapshot |
| codex/stack-20260423-mixed-terminal-stack | parking | preservation-only stacked history |
| codex/w-0139-terminal-core-loop-capture | mixed stack | preserved only; do not reuse for new work |
| codex/w-0139-terminal-core-loop-capture-mainline | W-0139 | prior clean lane |

### Planned After `PR0.2`

| 브랜치 | Work Item | 상태 |
|---|---|---|
| codex/w-0145-corpus-plane | W-0145 | merged via PR #202 |
| codex/w-0145-search-routes | W-0145 | merged via PR #203 |
| codex/w-0145-search-proxy-client | W-0145 | merged via PR #205 |
| codex/w-0142-runtime-routes | W-0142 | merged via PR #206 |
| codex/w-0142-runtime-contracts | W-0142 | merged via PR #207 |
| codex/w-0143-agent-context-pack | W-0143 | merged via PR #208 |
| codex/w-0143-agent-route-migration | W-0143 | merged via PR #209 |
| codex/w-0143-intel-policy-context | W-0143 | merged via PR #210 |
| codex/w-0143-agent-search-integration | W-0143 | parked name; do not reuse unless a larger agent/search integration slice is needed |
| codex/w-0139-surface-closeout | W-0139 | merged via PR #211 |
| codex/w-0139-trademode-market-clients | W-0139 | merged via PR #212 |
| codex/w-0139-trademode-indicator-clients | W-0139 | merged via PR #213 |
| codex/w-0139-trademode-analyze-client | W-0139 | merged via PR #214 |
| codex/w-0139-trademode-action-clients | W-0139 | merged via PR #215 |
| codex/w-0139-surface-closeout-audit | W-0139 | merged via PR #216 |
| codex/w-0140-bottom-analyze-slimming | W-0140 | active bottom analyze workspace slimming lane |

---

## 인프라 미완 (사람 직접 실행 필요)

- [x] Supabase migration 018 실행 및 DB table/index 검증
- [x] Vercel preview branch env (`release`, `codex/w-0139-terminal-core-loop-capture`) 정렬
- [x] deterministic wrapper로 `cogochi-2` preview 재배포 후 live alias/스모크 확인
- [ ] Cloud Run `asia-southeast1/cogotchi` 재배포 또는 `us-east4/cogotchi` 유지 결정을 명시
- [ ] Vercel EXCHANGE_ENCRYPTION_KEY 환경변수 설정 (프로덕션)
