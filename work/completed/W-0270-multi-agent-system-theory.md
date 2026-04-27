# W-0270 — Multi-Agent System Theory Application (AI Researcher 정석)

> Wave: Meta / Tooling | Priority: **P1** (P0는 W-0265~W-0268 실용 patch 우선) | Effort: **L (1-2주 design + 2-3주 implementation)**
> Charter: ✅ governance / runbook / research
> Status: 🟡 Design Draft (사용자 검토 대기)
> Created: 2026-04-28
> Parent: W-0264 (실용 patch) → 본 work item이 이론적 정석 추가

---

## Goal (1줄)

W-0264 4-domain (W-0265~W-0268)이 "사고 차단 + 워크플로우 표준화" 실용 patch라면, 본 work item은 multi-agent system 학술/엔지니어링 정석 (event sourcing / optimistic concurrency / capability tokens / distributed tracing / consensus / saga / circuit breaker)을 Cogochi/WTD agent 시스템에 형식적으로 적용한다.

## Scope

### 7-Pillar 정석 적용

본 work item은 7개 pillar로 multi-agent 시스템을 재구조화:

| # | Pillar | 정석 출처 | 본 시스템 적용 |
|---|---|---|---|
| 1 | **Event-Sourced State** | CQRS / Event Store | memkraft jsonl 확장 → immutable agent action log |
| 2 | **Optimistic Concurrency** | CAS / MVCC / git refs | file-matrix는 pre-flight; commit time `git push --force-with-lease` 강제 + pre-commit hook |
| 3 | **Capability-Based Security** | Principle of Least Authority | work item별 scoped capability token (현 settings.json allowlist는 coarse-grained) |
| 4 | **Distributed Tracing** | OpenTelemetry parent_id/span_id | agent action에 `trace_id` + `parent_agent_id` 첨부 → 인과관계 reconstruction |
| 5 | **Saga Pattern** | distributed transaction | 4 sub-agent PR 묶음을 saga로 (한 단계 실패 시 compensating action 자동) |
| 6 | **Circuit Breaker** | Hystrix | sub-agent timeout / 반복 실패 시 자동 차단 (현 수동 TaskStop) |
| 7 | **Consensus / Quorum** | Raft / Paxos | `/검증` 결과를 다수결 (예: 2 of 3 검증 PASS 시만 머지) |

### Non-Scope

- ❌ W-0265~W-0268 실용 patch 대체 (병행 적용, 본 work item은 추가 layer)
- ❌ memkraft 자체 수정 (Frozen — Charter §Frozen). event store 확장은 별도 jsonl namespace
- ❌ 외부 multi-agent framework (AutoGen / LangGraph) 도입 — 직접 구현
- ❌ Byzantine fault tolerance (현 사용자 환경에선 over-engineering)

---

## CTO 관점 (Engineering)

### Architecture Diagram

```
                    ┌─────────────────────┐
                    │  Capability Issuer  │  (issues scoped tokens per work item)
                    └─────────┬───────────┘
                              │
                              ▼
                    ┌─────────────────────┐
                    │  Orchestrator Agent │  (parent, holds tokens for children)
                    │  + Saga Coordinator │
                    └─────┬─────┬─────┬───┘
                          │     │     │
              ┌───────────┘     │     └───────────┐
              ▼                 ▼                 ▼
        ┌─────────┐       ┌─────────┐       ┌─────────┐
        │ Worker A│       │ Worker B│       │ Worker C│
        │ (token) │       │ (token) │       │ (token) │
        └────┬────┘       └────┬────┘       └────┬────┘
             │                 │                 │
             ▼                 ▼                 ▼
        ┌──────────────────────────────────────────┐
        │     Event Store (memkraft jsonl ext)     │
        │  trace_id / parent / action / outcome    │
        └──────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────────┐
                    │  Consensus Validator│  (quorum on /검증 results)
                    └─────────────────────┘
```

### Risk Matrix

| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| 7-pillar 동시 도입 시 시스템 복잡도 폭발 | 높음 | 상 | phased rollout (Pillar 1 → 2 → 3 …) |
| 학술 정석이 1인 사용자 환경에 over-engineering | 중 | 중 | 각 pillar 별 min/max 적용 범위 명시 (예: consensus는 검증만, 모든 결정엔 X) |
| Event store가 memkraft와 중복 | 중 | 중 | namespace 분리 (memkraft = decision/incident, event store = agent action) |
| capability token 발급 시스템이 GitHub Issue mutex와 충돌 | 낮 | 중 | token = mutex의 superset, mutex 해제 시 token revoke |

### Dependencies

- 선행: W-0265~W-0268 실용 patch (P0) 머지 — 본 work item은 그 위 layer
- 선행: PR #491 (isolation rule), PR #487 (worktree registry SSOT)
- 차단 해제: 본 work item 완료 후 진짜 multi-agent orchestration 가능 (현 Orchestrator-Worker 단순 패턴 → 7-pillar 정석)

### Files Touched (예상)

#### Pillar 1 — Event-Sourced State
- `memory/events/` 신규 디렉토리 (jsonl namespace)
- `tools/event-store.mjs` 신규: append-only log + replay
- `tools/agent-action-log.sh` 신규: agent 진입/exit 자동 기록

#### Pillar 2 — Optimistic Concurrency
- `.githooks/pre-commit` 신규/enhance: 다른 sub-agent 변경 감지 → abort
- `tools/conflict-detector.mjs` 신규: runtime file lock + CAS

#### Pillar 3 — Capability Tokens
- `tools/capability-issuer.mjs` 신규: work item별 token JSON 발급
- `state/capabilities.json` 신규: 활성 token registry
- `.claude/agents/worker-with-capability.md` 신규: token-aware sub-agent 정의

#### Pillar 4 — Distributed Tracing
- `tools/trace-emit.mjs` 신규: agent action에 trace_id/parent_id/span_id 첨부
- `tools/trace-replay.mjs` 신규: trace 분석 + 인과관계 그래프

#### Pillar 5 — Saga Pattern
- `tools/saga-coordinator.mjs` 신규: 4 sub-agent PR 묶음 → saga
- 각 step 실패 시 compensating action 정의 (예: PR revert)

#### Pillar 6 — Circuit Breaker
- `tools/circuit-breaker.sh` 신규: sub-agent 실패 카운트 → 자동 차단 임계
- timeout enforcement (sub-agent ≥30분 = abort)

#### Pillar 7 — Consensus / Quorum
- `tools/quorum-validator.mjs` 신규: N개 sub-agent의 `/검증` 결과 집계 → 다수결
- 적용 범위 한정 (검증만, 모든 결정 X)

### Phased Rollout (8 sub-tasks)

| Phase | Pillar | Sub-Effort | 적용 범위 |
|---|---|---|---|
| 1 | Pillar 1 (Event Store) | M | agent action immutable log — 가장 기반 |
| 2 | Pillar 4 (Tracing) | M | Pillar 1 위에 trace 추가 |
| 3 | Pillar 6 (Circuit Breaker) | S | sub-agent 자동 차단 (현 수동 TaskStop 보강) |
| 4 | Pillar 2 (Optimistic Concurrency) | M | runtime conflict 감지 |
| 5 | Pillar 3 (Capability Tokens) | M-L | scoped permission |
| 6 | Pillar 7 (Consensus) | M | `/검증` 다수결 (적용 범위 한정) |
| 7 | Pillar 5 (Saga) | L | distributed transaction (가장 복잡) |
| 8 | 통합 | S | 7-pillar end-to-end 시나리오 검증 |

**총 8 implementation work item** 예상 (W-0271~W-0278).

### Rollback Plan

- 각 pillar 별 atomic, revert 단일 가능
- Phase 1 (Event Store)는 read-only append, 기존 시스템 무영향

---

## AI Researcher 관점 (Data/Model)

### Literature Survey

| 주제 | 정석 출처 | 본 시스템 적용 |
|---|---|---|
| **Orchestrator-Worker** | Anthropic sub-agents | ✅ W-0264에서 이미 |
| **Event Sourcing** | Fowler 2005 / Kafka 백서 | Pillar 1 |
| **CQRS** | Greg Young 2010 | Pillar 1+2 (read/write 분리) |
| **CAS / MVCC** | Lamport / Bernstein DB textbook | Pillar 2 |
| **Capability-based Security** | Dennis-Van Horn 1966 / Mark Miller | Pillar 3 |
| **Distributed Tracing** | Dapper (Google 2010) / OpenTelemetry | Pillar 4 |
| **Saga Pattern** | Garcia-Molina 1987 / Microservices.io | Pillar 5 |
| **Circuit Breaker** | Nygard 2007 (Release It) / Hystrix | Pillar 6 |
| **Raft Consensus** | Ongaro 2014 | Pillar 7 (간소화 quorum) |

### KPI 측정

| 지표 | 베이스라인 | 목표 |
|---|---|---|
| agent action trace coverage | 0% (jsonl 분산) | ≥ 95% |
| sub-agent 평균 timeout 도달률 | 측정 안 됨 | < 5% (circuit breaker) |
| 동시 sub-agent 충돌 (commit time) | 1/세션 (G1) | 0 (optimistic CC) |
| capability scope creep (의도 외 권한) | 측정 안 됨 | 0 (audit log) |
| `/검증` 결과 1-agent 의존도 | 100% | < 50% (quorum 필요시) |

### Failure Modes

1. **Event store 무한 성장**: jsonl 디렉토리 GB 단위 → query 느림
   - 완화: 일별 파티션 + 7d retention (memkraft pattern 따름)
2. **Capability token replay attack**: 만료된 token 재사용
   - 완화: token에 monotonic nonce + revocation list
3. **Circuit breaker false positive**: 정상 작업이 timeout
   - 완화: 점진 backoff, half-open state
4. **Quorum split-brain**: 2 of 3 검증 결과 분기
   - 완화: tie-breaker = 가장 최근 main SHA 기준 fresh agent

### Falsifiable Kill Criteria

- F1: Pillar 1 적용 후 agent action recovery 시뮬레이션 실패 (특정 시점 state 복원 불가) → event log 설계 결함, Phase 1 재설계
- F2: Pillar 2 적용 후에도 commit time conflict 발생 → optimistic CC 로직 결함, 즉시 disable + audit
- F3: Pillar 7 적용 후 quorum decision이 단일 agent보다 wall-clock 2x 느림 → over-engineering, 적용 범위 축소

---

## Decisions

| ID | 결정 | 거절 |
|---|---|---|
| D1 | 7-pillar phased rollout (Pillar 1부터) | 동시 도입 (✗ 복잡도 폭발) |
| D2 | Event store는 memkraft 확장 namespace | 별도 시스템 (✗ Frozen 위반) |
| D3 | Consensus 적용 범위 = `/검증`만 | 모든 결정 (✗ over-engineering for 1-user) |
| D4 | Capability token = work item 단위 scope | agent ID 단위 (✗ work item state machine과 mismatch) |
| D5 | 본 work item = 설계만, 구현은 W-0271~W-0278 | 통합 (✗ atomic axis 위반) |

## Open Questions

- [ ] Q1: Event store retention 7d (memkraft) vs 영구 (audit) — 어떤 정책?
- [ ] Q2: Capability token 발급권자 = main agent? 또는 별도 issuer agent?
- [ ] Q3: Pillar 7 quorum N (2 of 3? 3 of 5?) — 1인 환경에선 sub-agent quorum이 의미 있는가?
- [ ] Q4: 본 work item 실제 구현은 W-0264 patch 머지 후? 또는 동시?

## Implementation Plan (Meta)

본 work item은 **설계 only**. 구현은 8 phase = 8 work item:
- W-0271 Phase 1 Event Store
- W-0272 Phase 2 Tracing
- W-0273 Phase 3 Circuit Breaker
- W-0274 Phase 4 Optimistic Concurrency
- W-0275 Phase 5 Capability Tokens
- W-0276 Phase 6 Consensus / Quorum
- W-0277 Phase 7 Saga Pattern
- W-0278 Phase 8 통합 시나리오

각자 별도 design + implementation PR. 본 work item 머지 후 발번.

## Exit Criteria (이 work item)

- [ ] AC1: 7-pillar 각자 §Files Touched 명시
- [ ] AC2: Phase 1~8 sub-task 의존관계 그래프
- [ ] AC3: Literature 인용 5+ (Fowler / Lamport / Dennis-Van Horn / Dapper / Nygard)
- [ ] AC4: 베이스라인 KPI 5개 + 목표
- [ ] AC5: Falsifiable F1~F3 임계 명시
- [ ] AC6: PR diff = 설계문서 only (코드 변경 0)
- [ ] AC7: 사용자 검토 통과 → 8 phase work item 발번 가능

## References

- 부모 (실용 patch): W-0264 (PR #493) + W-0265~W-0268 (PR #499)
- 선행 인프라: PR #487 (worktree registry), PR #491 (isolation rule), PR #496 (G7 detection)
- Literature:
  - Fowler M. (2005). *Event Sourcing*. martinfowler.com
  - Greg Young. (2010). *CQRS Documents*. github.com/gregoryyoung/m-r
  - Lamport L. (1979). *How to Make a Multiprocessor Computer That Correctly Executes Multiprocess Programs*. IEEE TC.
  - Dennis J., Van Horn E. (1966). *Programming Semantics for Multiprogrammed Computations*. CACM.
  - Sigelman B. et al. (2010). *Dapper, a Large-Scale Distributed Systems Tracing Infrastructure*. Google Tech Report.
  - Garcia-Molina H., Salem K. (1987). *Sagas*. SIGMOD.
  - Nygard M. (2007). *Release It!: Design and Deploy Production-Ready Software*. Pragmatic.
  - Ongaro D., Ousterhout J. (2014). *In Search of an Understandable Consensus Algorithm (Raft)*. USENIX ATC.
- Anthropic docs: https://code.claude.com/docs/en/sub-agents.md
- 후속 work item: W-0271 ~ W-0278 (8 phase implementation)
