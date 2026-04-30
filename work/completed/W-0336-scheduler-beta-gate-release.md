# W-0336 — Scheduler Beta Gate Release

> Wave: Core Closure | Priority: P0 | Effort: S | Owner: engine
> Status: Design Draft | Created: 2026-04-30

## Goal

프로덕션에서 꺼진 3개 flywheel 잡(outcome_resolver, refinement_trigger, fetch_okx_signals)을 기본 ON으로 전환한다.
현재 `_BETA_JOB_FLAGS` 전부 `"false"` 기본값 → 실제 outcome/verdict/refinement 루프가 프로덕션에서 돌지 않는 상태.

## Owner

Engine

## Scope

### 변경 파일

| 파일 | 변경 내용 |
|---|---|
| `engine/scanner/scheduler.py` | `_BETA_JOB_FLAGS` 3개 기본값 `"false"` → `"true"` |
| `engine/tests/test_scheduler_beta_gates.py` | 신규: 3 gates 기본 true 검증 |

### 변경 상세

`engine/scanner/scheduler.py` lines ~90-100:

```python
# Before
_BETA_JOB_FLAGS = {
    "outcome_resolver": os.environ.get("ENABLE_OUTCOME_RESOLVER_JOB", "false"),
    "refinement_trigger": os.environ.get("ENABLE_REFINEMENT_TRIGGER_JOB", "false"),
    "fetch_okx_signals": os.environ.get("ENABLE_FETCH_OKX_SIGNALS_JOB", "false"),
    ...
}

# After (3개만 변경)
_BETA_JOB_FLAGS = {
    "outcome_resolver": os.environ.get("ENABLE_OUTCOME_RESOLVER_JOB", "true"),
    "refinement_trigger": os.environ.get("ENABLE_REFINEMENT_TRIGGER_JOB", "true"),
    "fetch_okx_signals": os.environ.get("ENABLE_FETCH_OKX_SIGNALS_JOB", "true"),
    ...
}
```

## Non-Goals

- 다른 4개 beta gate (corpus_bridge_sync, feature_windows_prefetch, alpha_observer_cold, alpha_observer_warm) 건드리지 않음
- `_BETA_JOB_FLAGS` 구조 변경 없음
- 잡 로직 수정 없음

## Facts

- `engine/scanner/scheduler.py` 내 `_BETA_JOB_FLAGS` 딕셔너리: 7개 모두 현재 `"false"` 기본값
- `outcome_resolver` 잡: `engine/scanner/jobs/outcome_resolver.py` — `pending_outcome` capture 처리
- `refinement_trigger` 잡: `engine/scanner/jobs/refinement_trigger.py` — verdict 누적 후 모델 후보 생성
- `fetch_okx_signals` 잡: OKX 시그널 캐시 갱신 → `smart_money_accumulation` 블록 활성화

## Canonical Files

- `engine/scanner/scheduler.py`
- `engine/scanner/jobs/outcome_resolver.py`
- `engine/scanner/jobs/refinement_trigger.py`
- `engine/tests/test_scheduler_beta_gates.py` (신규)

## Assumptions

- Cloud Run 환경변수 ENABLE_*_JOB 미설정 → 기본값이 실제 실행 여부를 결정
- OKX 시그널 fetcher가 현재 API key 없이 돌 경우 graceful no-op 확인 필요 (PR에서 검증)

## Open Questions

- Q-0336-1: OKX fetch job이 API key 없는 환경에서 에러를 throw하는지, silently skip하는지?

## Decisions

- D-0336-1: corpus_bridge, feature_windows_prefetch, alpha_observer는 이번 scope 외. 별도 검토 후 ON.
- D-0336-2: 환경변수로 override 가능하게 유지 (opt-out 가능).

## Exit Criteria

- [ ] 3개 jobs default `"true"`, CI green
- [ ] `test_scheduler_beta_gates.py` pass
- [ ] Cloud Run 배포 후 로그에 outcome_resolver/refinement_trigger 실행 확인
- [ ] 24시간 내 새 outcome record ≥ 1 (observability로 확인)
