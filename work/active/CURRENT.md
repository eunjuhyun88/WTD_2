# CURRENT — 단일 진실 (2026-04-25 C)

> 이 파일 = 지금 무엇이 진행 중인지의 유일한 source of truth.
> 세션 시작 시 반드시 먼저 읽는다. 세션 종료 시 반드시 업데이트.

---

## main SHA

`e2fba18b` — PR #252, #253, #254, #256 모두 머지 완료

## 완료 (이번 세션 C — 전체 데이터 아키텍처 설계)

| 변경 | 내용 |
|---|---|
| `docs/design/10_COMPLETE_DATA_ARCHITECTURE.md` | 전체 데이터 아키텍처 완성 (v1.2, §1-18): User Activity + Wiki + Stats Engine + Notification + Social + LLM Wiki (Karpathy pattern) + Indicator Viz 연결 |
| `docs/design/11_CTO_DATA_ARCHITECTURE_REALITY.md` | CTO 현실 검토: 설계 vs 실제 코드베이스 비교, 10개 CTO 결정, 구현 우선순위 P0/P1/P2/P3 |
| `engine/wiki/COGOCHI.md` | LLM Agent schema 문서 (17 sections): 에이전트 권한 모델, wiki 구조, closed-loop, Korean support |
| `docs/design/DESIGN_V3.2_KNOWLEDGE_ARCHITECTURE.md` | 4-layer knowledge architecture canonical patch |
| `docs/design/00_MASTER_ARCHITECTURE.md` | 마스터 아키텍처 (v3.0) |
| `docs/design/01~06, 09_*.md` | 패턴 모델, 엔진 런타임, 검색 엔진, AI 에이전트, 데이터 계약, reranker spec |

## 이번 세션 핵심 결정 (CTO)

| 결정 | 내용 |
|---|---|
| 검색 파이프라인 | 4-stage sequential 아님 — 3-layer blend (A/B/C) 유지 + LambdaRank는 Stage 4로 추가 |
| LightGBM 2개 분리 | Binary P(win) classifier (기존) + LambdaRank reranker (신규, verdict 50+ 이후) |
| engine/rag/ 이름 | 유지, docstring 추가 — 실제로는 deterministic 256-dim embedding (semantic RAG 아님) |
| Semantic RAG | Phase 3까지 불필요. 뉴스 ingestion 시 추가. |
| LLM Wiki | engine/wiki/ 신규 생성. COGOCHI.md = agent schema. §18 spec 참조. |
| Context Assembly | engine/agents/context.py 신규 필요 — LLM 호출 규칙 없음이 현재 가장 큰 갭 |
| Read/Display 분리 | Write/Storage와 완전히 다른 문제. WorkspacePayload BFF endpoint 필요 (P3) |

## 이전 세션 완료 (2026-04-25 B)

## 다음 P0 실행 순서 (코드)

| 우선순위 | 작업 | 이유 |
|---|---|---|
| P0-1 | Ledger → Supabase 이전 (`engine/ledger/supabase_store.py` 완성) | JSON files = Cloud Run 재시작 시 소실 위험 |
| P0-2 | DB migration system (`engine/db/migrations/*.sql`) | embedded DDL로 schema 변경 불가 |
| P1-1 | W-0156: feature_windows → search corpus 연결 완성 | Layer A 검색 재계산 없이 materialized 사용 |
| P1-2 | Stats Engine (`engine/stats/engine.py`) | pattern_stats_cache 없으면 Wiki 불가 |
| P2-1 | Context Assembly rules (`engine/agents/context.py`) | LLM call마다 어떤 context 주입할지 규칙 없음 |
| P2-2 | WikiIngestAgent (`engine/wiki/ingest.py`) | §18 spec 구현 |

## 이전 세션 완료 (2026-04-25 B)

| PR/변경 | 내용 |
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
