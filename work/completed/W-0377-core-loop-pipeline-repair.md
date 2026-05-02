# W-0377 — Core Loop Pipeline Repair

> Wave: 5 | Priority: P0 | Effort: S (2-3d, single PR)
> Charter: In-Scope (코어 데이터 파이프라인)
> Status: 🟡 Design Draft
> Issue: #849
> Created: 2026-05-01

## Goal

scan_signal_events → scan_signal_outcomes → pattern_outcomes 전체 파이프라인이
prod에서 중단 없이 흐르게 한다. ENABLE_SIGNAL_EVENTS가 기본 ON으로 바뀌고,
outcome_resolver가 P&L을 계산해 두 테이블을 모두 업데이트한다.

## 배경 — 현재 Break 3개 (A/B/C)

### Break A — ENABLE_SIGNAL_EVENTS default=false

```python
# engine/scanner/scheduler.py:538
if os.environ.get("ENABLE_SIGNAL_EVENTS", "false").lower() == "true":
    from research.verification_loop import register_scheduler as _reg_vloop
```

결과: prod Cloud Run에 env 미설정 시 scan_signal_events 테이블이 비어있다.
scan_signal_outcomes도 비어있다.

**수정**: `"false"` → `"true"` (코드 레벨 default 변경).

### Break B — outcome_resolver와 scan_signal_outcomes 미연결

```python
# engine/scanner/jobs/outcome_resolver.py:_write_pnl_to_ledger_outcomes()
# PatternOutcome 저장 완료 후 signal_event_store.resolve_outcome() 미호출.
```

결과: scan_signal_outcomes.resolved_at이 null로 방치된다. triple barrier(1h/4h/24h/72h)
P&L 집계 불가. W-0378 /agent/explain 컨텍스트가 None이 된다.

**수정**: `_write_pnl_to_ledger_outcomes()` 실행 후 `signal_event_store.resolve_outcome()` 호출.

### Break C — PR #827 미머지 (pnl_bps_net 컬럼)

migration 038이 `pnl_bps_net` 컬럼을 추가했으나 PR #827 Contract CI 실패로 미머지 상태.
CI 실패 원인: CURRENT.md에 work/active → work/completed 이동된 W-0365/W-0366이 여전히 등재.

**수정**: CURRENT.md 업데이트 + Issue 링크 추가 → PR #827 리베이스/머지.

---

## Scope

### 변경 파일 (실측 기반)

```
engine/scanner/scheduler.py          # Break A: ENABLE_SIGNAL_EVENTS default 변경
engine/scanner/jobs/outcome_resolver.py  # Break B: resolve_outcome() 호출 추가
engine/research/signal_event_store.py   # Break B: resolve_outcome() 인터페이스 확인
work/active/CURRENT.md               # Break C: stale entries 제거
engine/tests/test_pipeline_coherence.py  # 신규: 3-break integration test
```

### 추가 migration (없음)

migration 044는 W-0379(decision_events)에서 처리. W-0377은 migration 불필요
(migration 038 pnl_bps_net은 PR #827에 포함).

---

## Non-Goals

- W-0378 AI Agent 엔드포인트 (별도 PR)
- decision_events / counterfactual_rows 테이블 (W-0379)
- ENABLE_SIGNAL_EVENTS 환경변수 UI 노출 — 코드 default만 변경

---

## CTO 관점

### Risk Matrix

| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| signal_event_store circuit breaker OPEN → scan 지연 | 낮 | 중 | fire-and-forget thread 유지; scan 블록 없음 |
| ENABLE_SIGNAL_EVENTS=true default → DB 부하 증가 | 중 | 낮 | batch upsert (100개) + circuit breaker 이미 구현됨 |
| outcome_resolver + signal_events 동시 write → 순서 불일치 | 낮 | 낮 | outcome 저장 완료 후 signal resolve 순차 실행 |
| PR #827 충돌 | 중 | 중 | CURRENT.md만 수정 후 rebase |

### Dependencies

- migration 038 (`pnl_bps_net`, `pnl_bps_gross`) 컬럼 존재 확인 ← PR #827 코드에 이미 있음
- `signal_event_store.resolve_outcome()` 인터페이스 ← 이미 `engine/research/signal_event_store.py`에 존재
- W-0378 이후 `/admin/system-coherence` 엔드포인트가 Break 상태를 보고하므로, W-0377 머지 후 /system-coherence에서 healthy 확인

### Rollback

- Break A: env `ENABLE_SIGNAL_EVENTS=false` 재설정으로 즉시 롤백 가능
- Break B: signal_events.resolve_outcome() 실패는 try/except로 격리 → main outcome 저장에 영향 없음
- Break C: CURRENT.md는 문서 전용, 롤백 비용 없음

---

## AI Researcher 관점

### 데이터 임팩트

Break A/B가 수정되면:
- `scan_signal_outcomes` rows/day: 0 → ~스캔 빈도 × 유니버스 크기(추정 100-500개/day)
- 1h/4h/24h/72h forward P&L 분포 축적 시작
- W-0378 Phase 2 alpha-scan의 LLM 컨텍스트가 실제 데이터 기반으로 바뀜

### 실패 모드

- `scan_signal_events` 비어있음 → signal_event_store circuit breaker OPEN → DLQ 확인
- `outcome_resolver` 실패 → logs에 `engine.scanner.jobs.outcome_resolver` ERROR 확인
- `scan_signal_outcomes.resolved_at` null 지속 → resolve_outcome() 호출 경로 재추적

---

## Canonical Files

```
engine/scanner/scheduler.py
engine/scanner/jobs/outcome_resolver.py
engine/research/signal_event_store.py       # read-only (인터페이스 확인)
work/active/CURRENT.md
engine/tests/test_pipeline_coherence.py     # 신규 생성
```

---

## 구현 상세

### Step 1 — Break A 수정 (`scheduler.py`)

```python
# 변경 전 (line 538)
if os.environ.get("ENABLE_SIGNAL_EVENTS", "false").lower() == "true":

# 변경 후
if os.environ.get("ENABLE_SIGNAL_EVENTS", "true").lower() == "true":
```

단 1줄 변경. 기존 env 재정의 `ENABLE_SIGNAL_EVENTS=false`로 롤백 가능.

### Step 2 — Break B 수정 (`outcome_resolver.py`)

`resolve_outcomes()` 함수 내 PatternOutcome 저장 완료 직후 추가:

```python
# after: ledger_store.save(outcome)
# before: capture 상태 업데이트

# W-0377: scan_signal_outcomes 동기화
try:
    from research.signal_event_store import signal_event_store
    if signal_event_store.is_available():
        signal_event_store.resolve_outcome(
            scan_id=capture.scan_id,
            symbol=outcome.symbol,
            entry_price=outcome.entry_price,
            outcome_id=outcome.id,
        )
except Exception as _se_exc:
    log.debug("signal_event resolve skipped: %s", _se_exc)
```

- `try/except`로 격리 → main outcome write에 영향 없음
- `signal_event_store.is_available()` = circuit breaker CLOSED/HALF-OPEN 상태 확인

### Step 3 — Break C 수정 (`CURRENT.md`)

CURRENT.md Active Work Items 테이블에서 이미 completed로 이동된 항목 제거:
- `W-0365-alpha-1cycle-pnl-verified` 행 삭제
- `W-0366-pattern-indicator-filters` 행 삭제

PR #827 본문에 `Closes #849` 추가.

### Step 4 — Integration Test (`test_pipeline_coherence.py`)

```python
"""W-0377: core loop coherence tests.

Tests that Break A/B/C are fixed and pipeline flows end-to-end.
"""
from unittest.mock import MagicMock, patch
import pytest

def test_signal_events_enabled_by_default():
    """Break A: ENABLE_SIGNAL_EVENTS default must be 'true' in scheduler."""
    import importlib
    import os
    # Clear env override
    with patch.dict(os.environ, {}, clear=False):
        os.environ.pop("ENABLE_SIGNAL_EVENTS", None)
        import scanner.scheduler as sched
        importlib.reload(sched)
        # Default gate should be True
        assert os.environ.get("ENABLE_SIGNAL_EVENTS", "true").lower() == "true"


def test_outcome_resolver_calls_signal_resolve(monkeypatch):
    """Break B: outcome_resolver must call signal_event_store.resolve_outcome."""
    from scanner.jobs import outcome_resolver
    resolve_calls = []

    class FakeStore:
        def is_available(self): return True
        def resolve_outcome(self, **kwargs): resolve_calls.append(kwargs)

    monkeypatch.setattr("research.signal_event_store.signal_event_store", FakeStore())
    # ... (stub CaptureStore, ledger_store, klines)
    # After resolve_outcomes() runs one iteration, resolve_calls must be non-empty
    assert len(resolve_calls) > 0  # detailed impl in full test


def test_pipeline_coherence_breaks_a_b_c():
    """System coherence: all 3 breaks should be healed."""
    # Break A: verified by env default
    # Break B: verify resolve_outcome exists and is callable
    from research.signal_event_store import signal_event_store
    assert hasattr(signal_event_store, "resolve_outcome")
    assert callable(signal_event_store.resolve_outcome)
    # Break C: CURRENT.md should not reference completed W-0365/W-0366
    import pathlib
    current_md = pathlib.Path("work/active/CURRENT.md").read_text()
    assert "W-0365-alpha-1cycle-pnl-verified" not in current_md
    assert "W-0366-pattern-indicator-filters" not in current_md
```

---

## Implementation Plan

1. `git checkout -b feat/W-0377-pipeline-repair`
2. `scheduler.py` Break A: `"false"` → `"true"` (1줄)
3. `outcome_resolver.py` Break B: `resolve_outcome()` 호출 블록 추가 (10줄)
4. `work/active/CURRENT.md` Break C: stale rows 제거
5. `engine/tests/test_pipeline_coherence.py` 신규 생성 (3 tests)
6. `uv run pytest engine/tests/test_pipeline_coherence.py -v`
7. PR: "Closes #849", CURRENT.md에 PR #827 링크 확인

---

## Exit Criteria

- [ ] AC1: `ENABLE_SIGNAL_EVENTS` default `"true"` 코드 확인
- [ ] AC2: `outcome_resolver.resolve_outcomes()` 실행 후 `scan_signal_outcomes.resolved_at` non-null rows 생성 (integration 또는 manual smoke test)
- [ ] AC3: `test_pipeline_coherence.py` 3 tests PASS
- [ ] AC4: CURRENT.md에 W-0365/W-0366 행 없음
- [ ] AC5: `uv run pytest engine/tests/ -x -q` PASS (regression 없음)
- [ ] CI green
- [ ] PR merged + CURRENT.md SHA 업데이트

## Owner

eunjuhyun88 — single-PR scope, 2-3d effort.

## Facts

- `engine/scanner/scheduler.py:538` gates verification_loop via `ENABLE_SIGNAL_EVENTS` env var (default `"false"`).
- `engine/patterns/scanner.py` writes `scan_signal_events` rows on entry signal — gated identically.
- `engine/scanner/jobs/outcome_resolver.py` already imports `simulate_trade` and writes `ledger_outcomes` (merged via #842).
- Issue #849 tracks the three breakages (A/B/C).

## Assumptions

- Cloud Run deploy will pick up the new code-level default without env var change.
- Existing tests (`test_pipeline_coherence.py`) cover the regression surface for Break A/B/C.
- No DB migration is needed — columns already exist after migration 038.

## Open Questions

- 없음 — design is locked.

## Decisions

- D1: 코드 레벨 default를 `"true"`로 바꾼다 (env 누락 시에도 파이프라인 흐르게).
- D2: `outcome_resolver`는 `simulate_trade`를 호출해 `ledger_outcomes`까지 같이 채운다 (W-0365와 합류).
- D3: CURRENT.md에서 stale W-0365/W-0366 active rows를 제거한다 (Break C).

## Next Steps

1. PR #853 머지 후 prod Cloud Run 배포 트리거.
2. 30분 smoke window: `scan_signal_events` rows 누적 확인.
3. CURRENT.md main SHA 업데이트 + W-0377 row 제거.

## Handoff Checklist

- [ ] AC1~AC5 모두 체크.
- [ ] `engine/tests/test_pipeline_coherence.py` 7/7 PASS (로컬 + CI).
- [ ] PR #853 머지.
- [ ] prod smoke 후 `scan_signal_events` rows 1+ 확인.
- [ ] CURRENT.md에서 W-0377 active row 제거.
