# CURRENT — 단일 진실 (2026-04-25 B)

> 이 파일 = 지금 무엇이 진행 중인지의 유일한 source of truth.
> 세션 시작 시 반드시 먼저 읽는다. 세션 종료 시 반드시 업데이트.

---

## main SHA

`bf34e913` — current local `origin/main` ref after PR #217

## 완료 (이번 세션 — 아키텍처 개선)

| 변경 | 내용 |
|---|---|
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
| **W-0147** | `W-0147-html-reference-pattern-engine.md` | 🟢 VERIFIED | 42 HTML-reference slugs registered; benchmark/search validation remains separate research/eval work |
| **W-0139** | `W-0139-terminal-core-loop-capture.md` | 🟡 QA-BLOCKED | manual browser QA + lab autorun/watch activation rule |
| **W-0141** | `W-0141-market-data-plane.md` | 🔴 IN-PROGRESS | chart/analyze/AI/backend source 를 하나의 canonical data plane 으로 재정의 |
| **W-0140** | `W-0140-analyze-tab-consolidation.md` | 🔴 IN-PROGRESS | 하단 ANALYZE 탭 follow-up QA / shared study contract 추가 정리 |
| **W-0126** | `W-0126-ledger-supabase-record-store.md` | 🟡 FOLLOW-UP | migration 018 + live preview redeploy + post-cutover stats hotfix 완료, canonical engine region 결정만 남음 |
| **W-0122** | `W-0122-free-indicator-stack.md` | 🟡 IN-PROGRESS | Confluence Phase 2 (engine scorer + flywheel weights) |
| **W-0124** | `W-0124-engine-ingress-auth-hardening.md` | 🟠 DEFERRED | GCP ingress 인증 — infra 변경, 별도 세션 |

---

## Deferred (루프 완성 이후 재개)

1. **W-0147** — HTML-derived pattern runtime block coverage + targeted engine tests
2. **W-0139** — `/terminal` Save & Open Lab manual QA + lab autorun/watch activation rule
3. **W-0141** — app-side pure producer 다음 단계로 backend workspace bundle producer 착수
4. **W-0126** — canonical engine region (`asia-southeast1` 복구 vs `us-east4` 유지) 결정만 정리

---

## 브랜치 매핑

| 브랜치 | Work Item | 상태 |
|---|---|---|
| main | — | 최신 (`7397cbb5`) |
| codex/w-0147-html-pattern-engine | W-0147 | ACTIVE |
| codex/w-0139-terminal-core-loop-capture | W-0139 | ACTIVE |
| codex/w-0141-market-data-plane | W-0141 | MERGED INTO `main` |
| codex/w-0138-engine-runtime-role-split | W-0138 | MERGED (#190) |
| codex/w-0140-analyze-tab-consolidation | W-0140 | MERGED (#189) |

---

## 인프라 미완 (사람 직접 실행 필요)

- [x] Supabase migration 018 (pattern_ledger_records)
- [x] Supabase migration 019 (audit_log)
- [x] Supabase migration 020 (capture_records definition columns)
- [x] Vercel preview branch env 정렬
- [ ] GCP cogotchi-worker Cloud Build trigger 설정 확인
- [ ] Vercel EXCHANGE_ENCRYPTION_KEY 환경변수 설정 (프로덕션)
- [ ] Cloud Scheduler HTTP jobs 등록 (`docs/runbooks/cloud-scheduler-setup.md`)
