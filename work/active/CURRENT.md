# CURRENT — 단일 진실 (2026-04-25 B)

> 이 파일 = 지금 무엇이 진행 중인지의 유일한 source of truth.
> 세션 시작 시 반드시 먼저 읽는다. 세션 종료 시 반드시 업데이트.

---

## main SHA

`e2fba18b` — PR #252, #253, #254, #256 모두 머지 완료

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
| #252 (W-0157) | `/jobs/feature_materialization/run` + `/jobs/raw_ingest/run` Cloud Scheduler HTTP endpoints |
| #253 (W-0162) | JWT P0 hardening — JWKS cache + circuit breaker |
| #254 (W-0200) | Core Loop Proof: range select → auto-analyze → find similar (10개) → outcome → save |
| #256 | Pattern similarity search UI |
| DB migration 019 | `audit_log` 테이블 Supabase에 적용 완료 |
| DB migration 020 | `capture_records`에 `definition_id`, `definition_ref_json`, `research_context_json` 컬럼 추가 |

---

## 활성 Work Items (우선순위 순)

| ID | 파일 | 상태 | 핵심 미완 |
|---|---|---|---|
| **W-0200** | `W-0200-core-loop-proof.md` | 🟢 COMPLETE — 머지됨 | GCP 재배포 + 프로덕션 스모크 테스트 |

---

## Deferred (루프 완성 이후 재개)

| ID | 상태 | 재개 조건 |
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
| W-0126 | `W-0126-ledger-supabase-record-store.md` | 🟡 FOLLOW-UP | Cloud Run region 결정만 남음 |
| W-0143 | `W-0143-query-by-example-pattern-search.md` | 🟢 COMPLETE | `AgentContextPack` 완료 |
| W-0139 | `W-0139-terminal-core-loop-capture.md` | 🟢 COMPLETE | terminal surface reads 완료 |
| W-0146 | `W-0146-lane-cleanup-and-merge-governance.md` | 🟡 REFERENCE | governance reference only |
| W-0141 | `W-0141-market-data-plane.md` | 🟡 ASSIST | workspace/data contract assist |
| W-0124 | `W-0124-engine-ingress-auth-hardening.md` | 🟠 DEFERRED | infra 변경, 별도 세션 |

---

## 현재 브랜치 상태

- `claude/strange-proskuriakova`: architecture improvements (이번 세션 작업, PR 대기)
- main: e2fba18b (모든 PR 머지 완료)

---

## 즉시 실행 순서 (사람)

1. **GCP Cloud Build trigger 확인**: `cogotchi-worker` 트리거 있는지 GCP 콘솔 확인 → 없으면 `/cloudbuild.worker.yaml` 트리거 추가
2. **Cloud Scheduler 등록** — `docs/runbooks/cloud-scheduler-setup.md` 참조
3. **Vercel `EXCHANGE_ENCRYPTION_KEY`** 프로덕션 환경변수 설정
4. **GCP `cogotchi` min-instances 확인** — `cloudbuild.yaml` 업데이트 후 재배포 시 자동 반영
5. **프로덕션 스모크 테스트**: 터미널 → 심볼 → 구간 드래그 → 패턴 저장 → 유사 패턴 표시 확인

---

## 인프라 미완 (사람 직접 실행 필요)

- [x] Supabase migration 018 (pattern_ledger_records)
- [x] Supabase migration 019 (audit_log)
- [x] Supabase migration 020 (capture_records definition columns)
- [x] Vercel preview branch env 정렬
- [ ] GCP cogotchi-worker Cloud Build trigger 설정 확인
- [ ] Vercel EXCHANGE_ENCRYPTION_KEY 환경변수 설정 (프로덕션)
- [ ] Cloud Scheduler HTTP jobs 등록 (`docs/runbooks/cloud-scheduler-setup.md`)
