# W-0278 — 7-Pillar Integration Scenario (Phase 8)

> Wave: Meta / Tooling | Priority: **P1** | Effort: S
> Charter: ✅ governance / runbook (In-Scope)
> Status: 🟡 Design Draft (사용자 검토 대기)
> Parent: W-0270 §Phase 8 통합
> Created: 2026-04-28 by Agent A070
> Depends on: W-0271~W-0277 (모두 완료 후)

## Goal (1줄)

7-pillar 전체가 실제로 end-to-end로 작동하는지 하나의 표준 시나리오로 검증하고, 각 pillar 간 연결부(interface)의 gap을 발견·수정한다.

## Scope

### 표준 시나리오: "4 sub-agent parallel PR 묶음"

```
[Orchestrator - main agent]
  1. capability-issuer.mjs issue  →  token A, B, C, D  (Pillar 3)
  2. saga-coordinator.mjs start   →  saga "W-0275+W-0276+W-0277 impl"  (Pillar 5)
  3. Agent(isolation=worktree) × 4  →  각자 PR 생성  (W-0264 Orchestrator rule)
     ├── trace-emit.mjs start-span (Pillar 4)
     ├── conflict-detector.mjs claim (Pillar 2)
     ├── circuit-breaker.sh check (Pillar 6)
     └── … 작업 … commit … PR
  4. 각 sub-agent PR 완료 → saga step-done  (Pillar 5)
  5. quorum-validator.mjs open --quorum  →  2/3 PASS → merge  (Pillar 7)
  6. saga-coordinator.mjs complete  (Pillar 5)
  7. trace-emit.mjs end-span (Pillar 4)
  8. event store replay → 전체 인과 그래프 확인  (Pillar 1)
```

### 포함
- `tools/integration-test.sh` — 위 시나리오 자동 실행 (mock sub-agents 포함)
- `docs/runbooks/multi-agent-7pillar.md` — 7-pillar 운영 runbook
- 각 pillar 연결 인터페이스 gap 수정 (최소 코드 변경)

### 파일/모듈
- `tools/integration-test.sh` (신규 ~150줄)
- `docs/runbooks/multi-agent-7pillar.md` (신규 ~100줄)
- (선택) 발견된 gap에 따른 소량 수정

## Non-Goals

- ❌ 완전 자동화 CI에 통합 — 실행 시간 너무 길고 mock 의존; 수동 runbook으로 충분
- ❌ 새로운 기능 추가 — W-0278은 검증+문서화만
- ❌ 부하 테스트 — 1인 환경

## CTO 관점 (Engineering)

### Integration Interface Map

| From | To | Interface | 검증 방법 |
|---|---|---|---|
| capability-issuer → conflict-detector | `allowed_paths` → claim `files` | token scope ⊆ claim files | AC3 |
| conflict-detector → pre-commit | `claims.json` → `check-staged` | staged files × claims | AC4 |
| circuit-breaker → saga | step failure → `failure <key>` | step_failed → CB failure | AC5 |
| saga → event-store | all events → `appendEvent()` | event count 검증 | AC2 |
| trace-emit → event-store | span events → kind="span" | replay tree | AC6 |
| quorum → event-store | vote/decide → event | quorum events 검증 | AC7 |
| capability-issuer → saga | revoke_token compensating | revocation after saga fail | AC8 |

### Risk Matrix

| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| 인터페이스 mismatch 발견 | 높음 | 낮음 | 발견이 목적; gap 수정은 소량 |
| mock sub-agent가 실제와 다르게 동작 | 중 | 중 | mock은 실제 CLI 직접 호출 (subprocess) |
| 통합 테스트 실행 시간 과다 | 낮 | 낮 | timeout 60s; mock은 빠름 |

### Dependencies

- 선행: W-0271~W-0277 전체 완료
- 차단: 없음 (최종 단계)

### Rollback Plan

- `integration-test.sh` 실행 실패 → 해당 pillar 개별 smoke test로 진단
- runbook은 정보용; 삭제해도 시스템 영향 없음

### Files Touched (예상)

- `tools/integration-test.sh` — 신규 ~150줄
- `docs/runbooks/multi-agent-7pillar.md` — 신규 ~100줄
- 발견된 gap: pillar별 소량 수정 (예상 < 50줄 total)

## AI Researcher 관점 (Data/Model)

### Data Impact

- 없음 (product DB 무관)

### Statistical Validation

KPI 최종 측정 (W-0270 §KPI):

| 지표 | 베이스라인 | 목표 | 측정 방법 |
|---|---|---|---|
| agent action trace coverage | 0% | ≥ 95% | event store span count / expected actions |
| sub-agent timeout 도달률 | 미측정 | < 5% | circuit-breaker OPEN 횟수 |
| commit-time 충돌 | 1/세션 | 0 | conflict-detector check-staged 거절 횟수 |
| capability scope creep | 미측정 | 0 | token audit log 이탈 이벤트 |
| `/검증` 1-agent 의존도 | 100% | < 50% | quorum 사용 비율 |

### Failure Modes

1. **KPI 미달**: 해당 pillar 재설계 (falsifiable F1~F3 W-0270 §기준)
2. **통합 gap 발견**: 즉시 수정 (이 work item 범위 내)

## Decisions

- [D1] 통합 테스트 = mock sub-agents 사용 (실제 Claude API 호출 ✗ — 비용/시간)
- [D2] runbook = markdown (자동 실행 CI ✗ — 실행 시간 과다)
- [D3] gap 수정 = W-0278 내에서 처리 (별도 work item 분리 ✗ — small scope)

## Open Questions

- [ ] [Q1] mock sub-agent를 어떻게 구현? (shell script가 실제 CLI 직접 호출)
- [ ] [Q2] W-0278 완료 후 7-pillar를 `start.sh`에 자동 연결할 것인가? (W-0278 이후 별도 결정)

## Implementation Plan

1. `tools/integration-test.sh` — 표준 시나리오 mock 실행 스크립트
2. 각 pillar 인터페이스 gap 수정 (발견 시)
3. KPI 측정 및 W-0270 §Falsifiable F1~F3 검증
4. `docs/runbooks/multi-agent-7pillar.md` — 운영 runbook 작성
5. CURRENT.md + spec/PRIORITIES.md 업데이트 (7-pillar 완료 표시)

## Exit Criteria

- [ ] AC1: `integration-test.sh` 실행 → exit 0
- [ ] AC2: event store에 표준 시나리오 전체 이벤트 기록 확인 (replay 가능)
- [ ] AC3: capability token `allowed_paths` ↔ conflict-detector claim 연동 확인
- [ ] AC4: pre-commit hook W-0274 check 실제 충돌 차단 확인
- [ ] AC5: circuit-breaker step_failed → failure 기록 확인
- [ ] AC6: trace show-tree → 7-pillar 전체 span tree 출력
- [ ] AC7: quorum 2/3 PASS → auto-decide 확인
- [ ] AC8: saga compensate → token revoke + claim release 확인
- [ ] AC9: KPI 5개 측정값 기록 + W-0270 목표 대비 달성 여부
- [ ] AC10: `docs/runbooks/multi-agent-7pillar.md` 작성 완료
- [ ] AC11: PR merged + CURRENT.md `7-pillar 통합 완료` 표시

## References

- Parent: W-0270 §Phase 8
- 선행: W-0271 (#504), W-0272-274 (#515), W-0275, W-0276, W-0277
- 측정 기준: W-0270 §KPI + §Falsifiable F1~F3
