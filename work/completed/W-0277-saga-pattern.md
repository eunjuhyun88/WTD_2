# W-0277 — Saga Pattern (Phase 7)

> Wave: Meta / Tooling | Priority: **P1** | Effort: L
> Charter: ✅ governance / runbook (In-Scope)
> Status: 🟡 Design Draft (사용자 검토 대기)
> Parent: W-0270 §Pillar 5
> Created: 2026-04-28 by Agent A070
> Depends on: W-0271 ✅, W-0272 ✅, W-0273 ✅, W-0274 ✅, W-0275, W-0276

## Goal (1줄)

여러 sub-agent가 각자 PR을 만드는 "4 sub-agent PR 묶음" 시나리오를 **saga**로 관리해, 한 단계가 실패하면 이전 단계를 자동으로 보상(compensate)하고 시스템을 일관된 상태로 되돌린다.

## Scope

### 포함
- `tools/saga-coordinator.mjs` — saga 정의·실행·보상 CLI
- `state/sagas.json` — 진행 중인 saga 상태 (step별 완료/실패/보상 상태)
- Saga 정의 DSL (JSON) — step 목록 + 각 step의 compensating action 정의
- event store 연동 (saga start/step/compensate/complete 이벤트)
- circuit breaker 연동 (step 실패 시 해당 agent key failure 기록)

### Saga 구조 (Garcia-Molina 1987 간소화)
```json
{
  "saga_id": "sga_<ulid>",
  "trace_id": "trc_<ulid>",
  "name": "W-0275 + W-0276 + W-0277 parallel implementation",
  "status": "running | completed | compensating | failed",
  "steps": [
    {
      "step_id": "stp_001",
      "name": "W-0275 capability-tokens implementation",
      "agent_id": "A041",
      "work_item": "W-0275",
      "action": { "type": "create_pr", "branch": "feat/W-0275-*" },
      "compensating_action": {
        "type": "close_pr",
        "description": "close PR if W-0275 step fails after W-0276 merged"
      },
      "status": "pending | running | done | failed | compensated",
      "pr_number": null,
      "started_at": null,
      "completed_at": null,
      "error": null
    }
  ],
  "current_step": 0,
  "compensate_from": null,
  "started_at": "ISO",
  "completed_at": null
}
```

### Compensating Actions 목록
| 원래 Action | Compensating Action |
|---|---|
| `create_pr` | `close_pr` (PR 닫기) |
| `merge_pr` | 불가역 — saga failure 전에 merge 금지 또는 revert PR 생성 |
| `create_branch` | `delete_branch` |
| `commit` | `git revert` (자동) |
| `claim_files` | `release_claim` (conflict-detector) |
| `issue_token` | `revoke_token` (capability-issuer) |

### 파일/모듈
- `tools/saga-coordinator.mjs` (신규 ~400줄)
- `state/sagas.json` (런타임 생성)
- `tools/saga-definitions/` (신규 디렉토리 — JSON 정의 파일들)

## Non-Goals

- ❌ 2-phase commit (분산 DB 수준) — git PR 단위 saga면 충분
- ❌ 자동 revert merge — merge된 PR 자동 revert는 위험; 사용자 확인 필요
- ❌ saga 중첩 (nested saga) — 현재 워크로드에 불필요
- ❌ 외부 메시지 브로커 (Kafka/RabbitMQ) — local shell 환경에서 over-engineering

## CTO 관점 (Engineering)

### Risk Matrix

| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| compensating action도 실패 (double fault) | 낮 | 높음 | compensate 실패 시 `saga_id` + step 정보 출력 → 사용자 수동 처리 |
| merge된 PR의 보상 불가 | 중 | 높음 | saga 정책: **merge 전 모든 step 완료 확인**; merged는 보상 없음 |
| saga 상태 파일 corruption | 낮 | 중 | atomic write (tmp → rename) + event store에 중복 기록 |
| 장시간 saga (24h+) → stale | 중 | 중 | 24h timeout → 자동 FAILED; 사용자 알림 |

### Dependencies

- 선행: W-0271 Event Store ✅ — 모든 saga 이벤트 기록
- 선행: W-0273 Circuit Breaker ✅ — step 실패 시 agent key failure 기록
- 선행: W-0274 Conflict Detector ✅ — compensating action이 `release_claim` 포함
- 선행: W-0275 Capability Tokens — compensating action이 `revoke_token` 포함
- 차단: W-0278 통합 (saga가 7-pillar end-to-end 시나리오의 핵심)

### Rollback Plan

- `state/sagas.json` 삭제 → 영향 없음 (진행 중 saga는 FAILED로 간주)
- `tools/saga-coordinator.mjs` 미사용 → 기존 수동 sub-agent orchestration으로 fallback

### Files Touched (예상)

- `tools/saga-coordinator.mjs` — 신규 ~400줄 (가장 복잡한 도구)
- `state/sagas.json` — 런타임 생성
- `tools/saga-definitions/parallel-4agent.json` — 예시 saga 정의 (신규 ~60줄)

## AI Researcher 관점 (Data/Model)

### Data Impact

- 스키마 변경 없음 (product DB 무관)
- saga 이벤트 → event store → trace coverage KPI 개선

### Statistical Validation

- KPI: saga 완료율 ≥ 95% (실패 + 보상 성공 포함)
- 측정: `state/sagas.json` completed vs failed 비율

### Failure Modes

1. **step 실패 후 보상 시작**: compensate_from = 실패 step; 역순으로 compensating action 실행
2. **compensate 도중 실패**: human-in-the-loop; saga_id로 상태 확인 후 수동 처리
3. **merge 후 실패**: revert PR 생성 안내 (자동 아님) + 사용자 확인

## Decisions

- [D1] Saga 단위 = "PR 묶음" (work item 집합); 단일 commit ✗ (너무 세분)
- [D2] merge된 PR 보상 = 자동 불가, revert PR 안내만 제공
- [D3] compensating action 실행 순서 = 역순 (step N → N-1 → ... → 1)
- [D4] 24h saga timeout → auto FAILED (stale saga 누적 방지)

## Open Questions

- [ ] [Q1] saga 정의를 work item 설계문서에서 자동 생성 가능한가? (§Implementation Plan에서 추출)
- [ ] [Q2] sub-agent가 saga step 완료를 어떻게 coordinator에 보고하나? (event store event vs direct call)

## Implementation Plan

1. `tools/saga-coordinator.mjs` — `define / start / step-done / step-failed / status / compensate / list`
2. `state/sagas.json` — saga registry CRUD (atomic write)
3. `tools/saga-definitions/parallel-4agent.json` — 예시: W-0275~W-0277 병렬 구현 saga
4. circuit breaker + conflict detector + capability token 연동 (보상 action)
5. event store 연동 (saga_start / step_done / step_failed / compensate / saga_complete)
6. smoke test: 3-step saga → step2 fail → compensate step1 → saga FAILED (clean)

## Exit Criteria

- [ ] AC1: `saga-coordinator.mjs define <file.json>` → saga 정의 등록
- [ ] AC2: `saga-coordinator.mjs start <saga_id>` → status: running
- [ ] AC3: `saga-coordinator.mjs step-done <saga_id> <step_id>` → next step 진행
- [ ] AC4: `saga-coordinator.mjs step-failed <saga_id> <step_id>` → compensating 시작
- [ ] AC5: 역순 보상 완료 → status: failed (clean state)
- [ ] AC6: event store에 모든 saga 이벤트 기록
- [ ] AC7: smoke test (3-step saga failure + compensate)

## References

- Parent: W-0270 §Pillar 5
- Garcia-Molina H., Salem K. (1987). Sagas. SIGMOD Rec.
- Microservices.io Saga Pattern: choreography vs orchestration (orchestration 선택 이유: 단일 coordinator가 상태 추적 용이)
- 선행: W-0271 (#504), W-0272-274 (#515)
