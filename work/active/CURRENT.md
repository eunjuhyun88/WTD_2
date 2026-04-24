# CURRENT — 단일 진실 (2026-04-24)

> 이 파일 = 지금 무엇이 진행 중인지의 유일한 source of truth.
> 세션 시작 시 반드시 먼저 읽는다. 세션 종료 시 반드시 업데이트.

---

## main SHA

`219dc317` — current local `origin/main` ref

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
| #230 (W-0160) | `PatternSeedScout` now persists `PatternDraft`, runs engine benchmark search, and reads `similar-live` through canonical `SearchQuerySpec` contracts |
| #231 (W-0160 / W-0159) | runtime capture / benchmark fixtures aligned with `/runtime/captures`, and optional user-data liquidation diagnostics landed on raw ingest |
| #232 (W-0159) | canonical raw plane mainline extract merged: raw SQLite tables, indexed market search, shared cache, scheduler refresh, and `/universe?q=` cutover |
| #235 (W-0160) | definition truth scope now persists canonical `definition_id` / `definition_ref` across captures, outcomes, ledger, and definition-scoped stats/read models |
| #236 (W-0122) | `influencer-metrics` now attaches additive engine `indicator-catalog` fact coverage without changing the public research payload |
| #237 (W-0148) | docs queue refresh landed on main so post-raw execution order and branch map were realigned to the canonical lane order |
| #238 (W-0122) | `/api/confluence/current` fallback now reads analyze service directly instead of loopbacking through `/api/cogochi/analyze`; W-0122 conflict-marker drift was cleaned |
| #239 (W-0160) | DOUNI pattern search now flows through `PatternSeedScout` / canonical `PatternDraft -> SearchQuerySpec` contracts instead of local route-specific wiring |
| #240 (W-0148 / W-0160) | post-merge refresh branch restores `captures` benchmark-search route truth and keeps the next-step plan aligned with the live repo state |
| #241 (W-0148) | post-merge execution queue was refreshed again after the W-0122/W-0160 follow-up merges so the next lanes stayed fact -> search -> runtime -> contract -> raw follow-up |
| #242 (W-0160) | `/patterns/{slug}/stats` and `/patterns/stats/all` now expose explicit `definition_scope`, and app pattern-stats proxies pass through scoped queries |
| #243 (W-0148) | next execution plan was resynced again after the latest merged follow-ups so CURRENT stayed aligned with the canonical lane order and branch map |
| #244 (W-0161) | app warning cleanup landed on latest main base; `npm --prefix app run check` now reports `0 errors / 0 warnings` and the queue resumes on engine lanes without app warning noise |
| #248 (W-0159) | engine-owned Coinalyze market-wide liquidation ingress now materializes public windows into `market_liquidation_windows`, while optional Binance user-data diagnostics stay isolated by provider/venue |
| #249 (W-0159) | public liquidation ingress follow-up closed with Coinalyze credential handling, diagnostics, and refreshed raw-plane tests/docs |

---

## 활성 Work Items (우선순위 순)

| ID | 파일 | 상태 | 핵심 미완 |
|---|---|---|---|
| **W-0200** | `W-0200-core-loop-proof.md` | 🔴 IN-PROGRESS | Save → Find Similar (10개) → Outcome 표시를 한 화면에서 end-to-end로 작동시키는 것 |

> **원칙**: 이 루프가 사용자 화면에서 실제로 돌기 전까지는 다른 work item을 열지 않는다.

---

## Deferred (루프 완성 이후 재개)

아래 work item들은 코드/브랜치가 존재하나, W-0200 완성 전까지 진행 금지.
`work/active/` 파일은 유지하되, 이 index에서는 deferred 처리.

| ID | 상태 | 재개 조건 |
|---|---|---|
| W-0160 | 🟡 DEFERRED | runtime capture/ledger scope policy, legacy backfill policy, durable definition namespace decision은 루프 완성 후 |
| W-0148 | 🟡 DEFERRED | broader plane contract/governance owner 작업은 루프 완성 후 |
| W-0122 | 🟡 DEFERRED | fact-plane canonical routes는 루프 완성 후 |
| W-0145 | 🟡 DEFERRED | corpus/search store는 루프 완성 후 |
| W-0150 | 🟡 DEFERRED | breakout production lane은 루프 완성 후 |
| W-0151 | 🟡 DEFERRED | active variant registry는 루프 완성 후 |
| W-0152 | 🟡 DEFERRED | state/phase similarity search는 루프 완성 후 |
| W-0156 | 🟡 DEFERRED | feature plane foundation은 루프 완성 후 |
| W-0157 | 🟡 DEFERRED | similar-live feature ranking은 루프 완성 후 |
| W-0158 | 🟡 DEFERRED | promotion feature diagnostics는 루프 완성 후 |
| W-0159 | 🟡 DEFERRED | next raw family 우선순위 결정은 루프 완성 후 |
| W-0149 | 🟡 DEFERRED | benchmark pack / search bridge의 남은 loop-proof 범위는 W-0200에 흡수 |
| W-0142 | 🟡 DEFERRED | runtime state API 확장은 루프 완성 후 |
| W-0140 | 🟡 DEFERRED | bottom ANALYZE slimming은 루프 완성 후 |

## Reference / Assist

| ID | 파일 | 상태 | 역할 |
|---|---|---|---|
| W-0126 | `W-0126-ledger-supabase-record-store.md` | 🟡 FOLLOW-UP | Cloud Run region 결정만 남음 |
| W-0143 | `W-0143-query-by-example-pattern-search.md` | 🟢 COMPLETE | `AgentContextPack` 완료 |
| W-0139 | `W-0139-terminal-core-loop-capture.md` | 🟢 COMPLETE | terminal surface reads 완료 |
| W-0146 | `W-0146-lane-cleanup-and-merge-governance.md` | 🟡 REFERENCE | governance reference only |
| W-0141 | `W-0141-market-data-plane.md` | 🟡 ASSIST | workspace/data contract assist |
| W-0124 | `W-0124-engine-ingress-auth-hardening.md` | 🟠 DEFERRED | infra 변경, 별도 세션 |

---

## Canonical Lane Order (변경 없음)

이 축은 아래 `5 planes + runtime state plane` 으로 고정한다.

1. **Ingress** — raw provider fetch, cache, capability/freshness state
2. **Fact Plane** — `FactSnapshot`, reference stack, chain intel, confluence
3. **Search Plane** — corpus, scan, seed-search, catalog, candidate reports
4. **Agent Context** — `AgentContextPack`, bounded AI inputs
5. **Surface Plane** — terminal page, analyze workspace, save/setup UX

별도 plane:
- **Runtime State** — capture, pins, setups, research context, ledger, outcomes

---

## 현재 브랜치 상태

- active: `codex/w-0148-current-plan-refresh-20260424` (문서 정리 + `captures` benchmark-search route truth 복구 완료, merge 대기)
- 다음 브랜치: `codex/w-0200-core-loop-proof` (새로 생성)

---

## 인프라 미완 (사람 직접 실행 필요)

- [x] Supabase migration 018 실행 및 DB table/index 검증
- [x] Vercel preview branch env 정렬
- [x] deterministic wrapper로 `cogochi-2` preview 재배포 후 live alias/스모크 확인
- [ ] Cloud Run `asia-southeast1/cogotchi` 재배포 또는 `us-east4/cogotchi` 유지 결정
- [ ] Vercel EXCHANGE_ENCRYPTION_KEY 환경변수 설정 (프로덕션)
