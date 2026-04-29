# W-0273 — Circuit Breaker (Phase 3)

> Wave: Meta / Tooling | Priority: **P1** | Effort: S
> Parent: W-0270 §Pillar 6
> Status: ✅ COMPLETE
> Branch: feat/W-0272-tracing (Phase 2-4 묶음 PR)

## Goal

sub-agent 반복 실패를 자동으로 차단한다 (Nygard 2007 / Hystrix 패턴).
현재 수동 TaskStop 의존 → `circuit-breaker.sh check <key>`로 fail-fast.
3회 연속 실패 → OPEN → 30분 후 HALF-OPEN → 성공 시 CLOSED 복귀.

## Scope

### 구현 파일

| 파일 | 역할 |
|---|---|
| `tools/circuit-breaker.sh` | 상태 머신 + CLI |
| `state/circuit-breaker.json` | breaker 상태 저장 (런타임 생성) |

### 상태 머신

```
CLOSED (normal) ──── failure_count >= threshold ──→ OPEN (blocked)
OPEN             ──── timeout_sec elapsed        ──→ HALF-OPEN (probe)
HALF-OPEN        ──── success                    ──→ CLOSED
HALF-OPEN        ──── failure                    ──→ OPEN
```

- Default threshold: **3** failures
- Default timeout: **1800s** (30min) OPEN → HALF-OPEN
- Default probe window: **300s** (5min)

### Key Convention

```
agent:<A###>         # 특정 agent 세션 차단
task:<work-item>     # 특정 work item 차단
tool:<bash|git|...>  # 특정 tool 타입 차단
```

### Integration Points

```bash
# start.sh 또는 sub-agent launch 전
./tools/circuit-breaker.sh check "agent:$NEXT_ID" || exit 1

# agent 성공 시
./tools/circuit-breaker.sh success "agent:$NEXT_ID"

# agent 실패 시
./tools/circuit-breaker.sh failure "agent:$NEXT_ID" --msg "reason"
```

## Exit Criteria ✅

- [x] `status / check / success / failure / reset / timeout-check` 동작
- [x] 3회 실패 → OPEN 자동 전환
- [x] check OPEN → exit 1 (blocked)
- [x] reset → CLOSED 복귀
- [x] smoke test: failure×3 → OPEN → check blocked → reset → check OK

## References

- Parent: W-0270 §Pillar 6
- Nygard M. (2007). *Release It!* Chapter 5: Stability Patterns
- Hystrix (Netflix OSS): CLOSED/OPEN/HALF-OPEN state machine
