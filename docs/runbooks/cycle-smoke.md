# Runbook: cycle-smoke — 1사이클 회귀 검증

## 목적

`tools/cycle-smoke.py`는 패턴→검증→gate→알림 1사이클의 핵심 경로가 깨지지 않았는지 5개 AC로 검증한다. PR 머지 전 또는 GAP 관련 코드 변경 후 실행.

## 실행 방법

```bash
# engine 디렉토리에서 uv run으로 실행 (venv 필요)
cd engine && uv run python ../tools/cycle-smoke.py
```

## 5개 AC (Acceptance Criteria)

| AC | 검증 내용 | 실패 시 의미 |
|---|---|---|
| AC1: GateV2DecisionStore roundtrip | save True/False → load 동일값 | W-0284 GAP-C regression |
| AC2: _fetch_btc_returns TTL cache | Binance API 2회 호출 → 1회만 실제 호출 | GAP-A regression (rate limit 위험) |
| AC3: offline=False 소스 그렙 | runner.py에 offline=False 존재, offline=True 없음 | GAP-A regression |
| AC4: Alert suppression | gate_validated=False → 억제, None → 통과 | GAP-C regression |
| AC5: 인프라 env var 힌트 | ENABLE_PATTERN_REFINEMENT_JOB 등 scheduler.py 존재 | GAP-B 코드 삭제 경보 |

## 호출 시점

- engine/ 아래 `runner.py`, `actuator.py`, `scheduler.py` 수정 후
- PR 머지 전 최종 확인
- 의심스러운 V-track 동작 디버깅 시

## 기대 출력 (성공)

```
========================================================
  1-Cycle Pattern Finding Smoke Test
========================================================
AC1: GateV2DecisionStore roundtrip
  [PASS] missing run_id → None (pass-through)
  [PASS] save True → load True
  [PASS] save False → load False
  [PASS] overwrite True→False
AC2: _fetch_btc_returns TTL cache
  [PASS] load_klines called with offline=False
  [PASS] returns non-empty Series
  [PASS] Binance called exactly once (TTL cache hit on 2nd call)
  [PASS] both calls identical
AC3: offline=False regression guard
  [PASS] offline=False present in runner.py
  [PASS] offline=True NOT present (regression — must stay offline=False)
  [PASS] TTL cache variable present
  [PASS] TTL constant present
AC4: Alert suppression logic
  [PASS] gate_validated=False → alert suppressed (gate is False)
  [PASS] missing gate data → None → alert passes through (backward compat)
  [PASS] gate_validated=True → alert passes through
AC5: Infra env var hints (Cloud Run checklist)
  [PASS] ENABLE_PATTERN_REFINEMENT_JOB var exists in scheduler
  [PASS] ENABLE_SEARCH_CORPUS_JOB var exists in scheduler

========================================================
  Results: 17 passed | 0 failed
========================================================
  ✓ 1-cycle smoke test PASS
```

## 실패 시 대응

| 실패 AC | 조치 |
|---|---|
| AC1 | `engine/research/validation/actuator.py` GateV2DecisionStore 확인 |
| AC2/AC3 | `engine/research/validation/runner.py:40` `offline=` 값 확인 |
| AC4 | `GATE_V2_ALERT_FILTER` env var + actuator.py store.load() 반환값 확인 |
| AC5 | `engine/scanner/scheduler.py:70,78` 삭제 여부 확인 |

## 관련 runbook

- `docs/runbooks/post-edit-hook.md` — engine test 자동 실행 hook
- `docs/runbooks/cloud-run-env-vars.md` — GAP-B/D env var 적용
