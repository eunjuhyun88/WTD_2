# CURRENT — 단일 진실 (2026-04-25)

> 이 파일 = 지금 무엇이 진행 중인지의 유일한 source of truth.
> 세션 시작 시 반드시 먼저 읽는다. 세션 종료 시 반드시 업데이트.

---

## main SHA

`219dc317` — current local `origin/main` ref (branch: `codex/w-0200-core-loop-proof` is 10 commits ahead)

## 완료 (이번 세션)

| PR | 내용 |
|---|---|
| #252 (W-0157) | `/jobs/feature_materialization/run` + `/jobs/raw_ingest/run` Cloud Scheduler HTTP endpoints |
| #254 (W-0200) | Core Loop Proof: range select → auto-analyze → find similar (10개) → outcome → save |
| DB migration 019 | `audit_log` 테이블 Supabase에 적용 완료 |
| DB migration 020 | `capture_records`에 `definition_id`, `definition_ref_json`, `research_context_json` 컬럼 추가 |

---

## 활성 Work Items (우선순위 순)

| ID | 파일 | 상태 | 핵심 미완 |
|---|---|---|---|
| **W-0200** | `W-0200-core-loop-proof.md` | 🟢 COMPLETE — PR #254 머지 대기 | PR 머지 후 GCP 재배포 + 프로덕션 스모크 테스트 |

> **다음 원칙**: W-0200 PR이 머지되고 프로덕션 스모크가 확인되면 deferred work items 재개 가능.

---

## Deferred (루프 완성 이후 재개)

아래 work item들은 코드/브랜치가 존재하나, W-0200 프로덕션 확인 전까지 진행 금지.
`work/active/` 파일은 유지하되, 이 index에서는 deferred 처리.

| ID | 상태 | 재개 조건 |
|---|---|---|
| W-0162 | 🟡 DEFERRED | search corpus → full `feature_windows` 업그레이드 (PR #253 JWT 선행) |
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

- active: `codex/w-0200-core-loop-proof` (10 commits ahead of origin/main, PR #254 open)
- `claude/strange-proskuriakova`: job endpoints PR #252 open
- 다음 브랜치: main에서 새로 시작 (W-0200 머지 후)

---

## 즉시 실행 순서 (사람 + 에이전트)

### 사람 실행 필요

1. **PR #252 머지** — job HTTP endpoints
2. **PR #254 머지** — W-0200 core loop
3. **GCP Cloud Run 재배포** — 새 code 반영
4. **Cloud Scheduler 등록** (2개 job):
   - `POST /jobs/feature_materialization/run` — 15분, `Authorization: Bearer <SCHEDULER_SECRET>`
   - `POST /jobs/raw_ingest/run` — 60분, 동일 auth
5. **Vercel `EXCHANGE_ENCRYPTION_KEY`** 프로덕션 환경변수 설정
6. **프로덕션 스모크 테스트**: 터미널 → 심볼 → 구간 드래그 → 패턴 저장 → 유사 패턴 표시 확인

### 에이전트 대기 (머지 후 재개)

- W-0162: full feature_windows 기반 corpus 업그레이드 (strangler pattern)
- W-0163: pattern scanner → feature_windows 읽기로 전환

---

## 인프라 미완 (사람 직접 실행 필요)

- [x] Supabase migration 018 (pattern_ledger_records)
- [x] Supabase migration 019 (audit_log) — 2026-04-25 적용 완료
- [x] Supabase migration 020 (capture_records definition columns) — 2026-04-25 적용 완료
- [x] Vercel preview branch env 정렬
- [ ] Cloud Run `asia-southeast1/cogotchi` 재배포 또는 `us-east4/cogotchi` 유지 결정
- [ ] Vercel EXCHANGE_ENCRYPTION_KEY 환경변수 설정 (프로덕션)
- [ ] Cloud Scheduler HTTP jobs 등록 (PR #252 머지 후)
