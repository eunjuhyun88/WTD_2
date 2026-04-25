# CURRENT — 단일 진실 (2026-04-25)

> 이 파일 = 지금 무엇이 진행 중인지의 유일한 source of truth.
> 세션 시작 시 반드시 먼저 읽는다. 세션 종료 시 반드시 업데이트.

---

## main SHA

`2a2995db` — current local `origin/main` ref after PR #217

## 완료 (이번 세션 — 아키텍처 개선)

| 변경 | 내용 |
|---|---|
| #279 | feat(ci): PR 머지 시 MemKraft + CURRENT.md 자동 동기화 |
| `cloudbuild.yaml` | `--min-instances 1` 추가 — API cold start 제거 |
| `cloudbuild.worker.yaml` | `--concurrency 1` + `--timeout 900` 추가 — job 중복 방지 |
| `engine/search/similar.py` | W-0162 Layer A 업그레이드: feature_snapshot 우선 사용 (3→40+ dims) + FeatureWindowStore batch enrichment |
| `docs/runbooks/cloud-scheduler-setup.md` | Cloud Scheduler 등록 runbook 신규 작성 |

## 이전 세션 완료

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
| #217 (W-0140) | bottom ANALYZE thesis/evidence/execution board aligned to `workspaceEnvelope` contract |

---

## 활성 Work Items (우선순위 순)

| ID | 파일 | 상태 | 핵심 미완 |
|---|---|---|---|
| **W-0148** | `W-0148-cto-data-engine-reset.md` | 🔴 IN-PROGRESS | Phase 0 boundary program: docs/governance normalize + plane contract skeleton + proxy split |
| **W-0122** | `W-0122-free-indicator-stack.md` | 🔴 IN-PROGRESS | fact plane mainline: `GET /ctx/fact` expansion + canonical `/facts/*` routes + `indicator_catalog.py` inventory owner |
| **W-0145** | `W-0145-operational-seed-search-corpus.md` | 🔴 IN-PROGRESS | corpus accumulation + canonical `/search/*` route family |
| **W-0150** | `W-0150-breakout-production-lane.md` | 🔴 IN-PROGRESS | TRADOOR/PTB final-phase miss correction: breakout redesign + benchmark replay validation |
| **W-0151** | `W-0151-active-variant-runtime-registry.md` | 🔴 IN-PROGRESS | gate-cleared benchmark winners를 live runtime activation registry로 연결 |
| **W-0152** | `W-0152-pattern-state-similarity-search.md` | 🔴 IN-PROGRESS | active variant 기준 live universe를 state/phase similarity로 직접 랭크하는 query path 추가 |
| **W-0156** | `W-0156-canonical-feature-plane-foundation.md` | 🔴 IN-PROGRESS | perp/orderflow canonical feature plane 첫 슬라이스: raw metrics contract + reusable derived features + targeted engine cut |
| **W-0159** | `W-0159-canonical-raw-plane-ingestion.md` | 🔴 IN-PROGRESS | canonical raw ingress + persisted market search index + L1/L2 query cache + scheduler refresh + universe query cutover |
| **W-0157** | `W-0157-similar-live-feature-ranking.md` | 🔴 IN-PROGRESS | canonical feature snapshot을 `similar-live` ranking score에 실제 반영하는 consumption slice |
| **W-0158** | `W-0158-promotion-feature-diagnostics.md` | 🔴 IN-PROGRESS | canonical feature score/snapshot truth를 promotion report와 refinement report diagnostics에 재사용 |
| **W-0149** | `W-0149-manual-hypothesis-benchmark-pack-draft.md` | 🔴 IN-PROGRESS | capture research context를 replay benchmark pack draft로 변환하는 runtime/research bridge |
| **W-0142** | `W-0142-manual-hypothesis-research-context.md` | 🔴 IN-PROGRESS | runtime state APIs for capture / pins / setups / research context / ledger |
| **W-0160** | `W-0160-pattern-draft-query-transformer-contract.md` | 🔴 IN-PROGRESS | `PatternDraft -> SearchQuerySpec` contract + parser/transformer/agent boundary freeze |
| **W-0143** | `W-0143-query-by-example-pattern-search.md` | 🟡 BLOCKED-ON-A-B-C | agent/search integration after fact/search/runtime lanes merge |
| **W-0139** | `W-0139-terminal-core-loop-capture.md` | 🟡 BLOCKED-ON-UPSTREAM | surface closeout after agent/runtime/fact contracts freeze |
| **W-0140** | `W-0140-analyze-tab-consolidation.md` | 🟡 BLOCKED-ON-UPSTREAM | bottom ANALYZE slimming after surface contract cutover |

---

## Deferred (루프 완성 이후 재개)

1. **W-0153** — persistent cached-window retrieval index + query-time reuse for market search
2. **W-0152** — cached corpus cheap retrieval + top-N replay rerank over recent history
3. **W-0151** — cached symbol inventory + live monitor CLI over canonical shared cache
4. **W-0150** — shared cache root discovery for benchmark/search/scanner lanes
5. **W-0149** — TRADOOR/PTB anchored breakout + pattern-scoped replay + 15m benchmark axis
6. **W-0147** — HTML-derived pattern runtime block coverage + targeted engine tests
7. **W-0139** — `/terminal` Save & Open Lab manual QA + lab autorun/watch activation rule
8. **W-0141** — app-side pure producer 다음 단계로 backend workspace bundle producer 착수
9. **W-0126** — canonical engine region (`asia-southeast1` 복구 vs `us-east4` 유지) 결정만 정리

---

## 브랜치 매핑

| 브랜치 | Work Item | 상태 |
|---|---|---|
| W-0162 | 🟢 PARTIAL — Layer A 업그레이드 완료 | search corpus → FeatureWindowStore 완전 전환 (W-0162 남은 slice) |
| W-0160 | 🟡 DEFERRED | runtime capture/ledger scope policy, legacy backfill policy |
| W-0148 | 🟡 DEFERRED | broader plane contract/governance owner 작업 |
| W-0122 | 🟡 DEFERRED | fact-plane canonical routes |
| W-0145 | 🟡 DEFERRED | corpus/search store |
| W-0150 | 🟡 DEFERRED | breakout production lane |
| W-0151 | 🟡 DEFERRED | active variant registry |
| W-0152 | 🟡 DEFERRED | state/phase similarity search |
| W-0156 | 🟡 DEFERRED | feature plane foundation |
| W-0157 | 🟡 DEFERRED | similar-live feature ranking (core endpoints landed in PR #252) |
| W-0158 | 🟡 DEFERRED | promotion feature diagnostics |
| W-0159 | 🟡 DEFERRED | next raw family 우선순위 결정 |
| W-0149 | 🟡 DEFERRED | W-0200에 흡수 완료 |
| W-0142 | 🟡 DEFERRED | runtime state API 확장 |
| W-0140 | 🟡 DEFERRED | bottom ANALYZE slimming |

## Reference / Assist

| ID | 파일 | 상태 | 역할 |
|---|---|---|---|
| **W-0146** | `W-0146-lane-cleanup-and-merge-governance.md` | 🟡 REFERENCE | merge governance / queue audit reference, not an execution lane |
| **W-0141** | `W-0141-market-data-plane.md` | 🟡 ASSIST | workspace/data contract assist lane, not top-level architecture owner |
| **W-0153** | `W-0153-protocol-doc-recovery.md` | 🟡 ASSIST | recovered protocol doc set for future protocol lane, not active execution |

## Deferred / Blocked

| ID | 파일 | 상태 | 핵심 미완 |
|---|---|---|---|
| **W-0126** | `W-0126-ledger-supabase-record-store.md` | 🟡 FOLLOW-UP | migration 018 + live preview redeploy + post-cutover stats hotfix 완료, canonical engine region 결정만 남음 |
| **W-0124** | `W-0124-engine-ingress-auth-hardening.md` | 🟠 DEFERRED | GCP ingress 인증 — infra 변경, 별도 세션 |

---

## 현재 브랜치 상태

- `claude/strange-proskuriakova`: architecture improvements (이번 세션 작업, PR 대기)
- main: e2fba18b (모든 PR 머지 완료)

---

## 즉시 실행 순서 (사람)

- current doc lane `codex/w-0153-protocol-doc-recovery` was split and pushed clean at `44431562`
- engine baseline remains `codex/w-0151-active-variant-runtime-registry` at `f5dec6c1`
- `W-0156` foundation landed clean at `6ae2f566` on `codex/w-0156-feature-plane-foundation`
- `W-0157` landed clean at `a3a8f2c0` on `codex/w-0157-similar-live-feature-ranking`
- `W-0158` landed clean at `e51ab067` on `codex/w-0158-promotion-feature-diagnostics`
- active execution lane is `codex/w-0159-canonical-raw-plane-ingestion`
- `W-0159` local cut adds canonical raw SQLite tables, query-driven Binance raw ingestion, persisted local market search index, process-local + shared Redis query caching, bounded index refresh job, and `/universe?q=` local-search read path

---

## 즉시 실행 순서

1. **W-0148 / PR0.1** — docs/governance normalize
2. **W-0148 / PR0.2** — plane contract skeleton + plane-specific app proxies (`facts/search/runtime`)
3. **W-0122 / Lane A** — fact-plane canonical sub-routes + app compatibility bridges
4. **W-0145 / Lane B** — corpus/search stores + canonical `/search/*`
5. **W-0142 / Lane C** — runtime repositories + canonical `/runtime/*`
6. **W-0160 / Contract lane** — `PatternDraft` / `SearchQuerySpec` + parser/transformer boundary for live agent/search turns
7. **W-0143 / Lane D** — `AgentContextPack` loader + agent route unification
8. **W-0139 + W-0140 / Lane E** — terminal surface slimming after upstream merge
9. **Supabase migration 018** — `app/supabase/migrations/018_pattern_ledger_records.sql` (MCP or psql)

---

## 브랜치 매핑

### Active / Existing

| 브랜치 | Work Item | 상태 |
|---|---|---|
| main | — | local `main` = `27952d95` |
| origin/main | — | local remote-tracking ref = `41a72eef` |
| codex/w-0148-data-engine-reset | W-0148 | active Phase 0 lane; bounded engine fact landing zone + governance/contract split |
| codex/w-0122-fact-plane-mainline | W-0122 | clean main-based execution lane |
| codex/w-0122-market-cap-fact-cut | W-0122 | active Lane A slice; engine market-cap fact route + macro consumer fallback cut |
| codex/w-0151-active-variant-runtime-registry | W-0149 / W-0150 / W-0151 / W-0152 | active stacked engine commercialization lane |
| codex/w-0153-protocol-doc-recovery | W-0153 | protocol doc recovery reference lane; pushed clean |
| codex/w-0156-feature-plane-foundation | W-0156 | active engine lane for canonical perp/orderflow/structure feature foundation |
| codex/w-0157-similar-live-feature-ranking | W-0157 | active engine lane for canonical feature consumption in similar-live ranking |
| codex/w-0158-promotion-feature-diagnostics | W-0158 | active engine lane for canonical feature diagnostics in promotion/report artifacts |
| codex/w-0159-canonical-raw-plane-ingestion | W-0159 | active engine lane for canonical raw plane ingestion and query-driven symbol resolution |
| codex/parking-20260423-mixed-lanes | parking | preservation-only mixed snapshot |
| codex/stack-20260423-mixed-terminal-stack | parking | preservation-only stacked history |
| codex/w-0139-terminal-core-loop-capture | mixed stack | preserved only; do not reuse for new work |
| codex/w-0139-terminal-core-loop-capture-mainline | W-0139 | prior clean lane |

### Planned After `PR0.2`

| 브랜치 | Work Item | 상태 |
|---|---|---|
| codex/w-0145-corpus-plane | W-0145 | planned parallel search lane |
| codex/w-0142-runtime-state-plane | W-0142 | planned parallel runtime lane |
| codex/w-0160-pattern-draft-transformer-contract | W-0160 | planned contract lane for parser/search boundary freeze before live agent cutover |
| codex/w-0143-agent-search-integration | W-0143 | planned post-A/B/C integration lane |
| codex/w-0139-surface-closeout | W-0139 | planned post-agent surface lane |

---

## 인프라 미완 (사람 직접 실행 필요)

- [x] Supabase migration 018 (pattern_ledger_records)
- [x] Supabase migration 019 (audit_log)
- [x] Supabase migration 020 (capture_records definition columns)
- [x] Vercel preview branch env 정렬
- [ ] GCP cogotchi-worker Cloud Build trigger 설정 확인
- [ ] Vercel EXCHANGE_ENCRYPTION_KEY 환경변수 설정 (프로덕션)
- [ ] Cloud Scheduler HTTP jobs 등록 (`docs/runbooks/cloud-scheduler-setup.md`)
