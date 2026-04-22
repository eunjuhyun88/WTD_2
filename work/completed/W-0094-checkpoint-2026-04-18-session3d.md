# W-0094 Checkpoint — 2026-04-18 Session 3d

## Session Summary

CTO 우선순위로 Phase C (verdict UI) 대신 **Phase E 슬라이스 + observability** 를 먼저 출하.
이유: axes 1-2 는 닫혔지만 입력 트래픽 0. 수도꼭지(C) 보다 수원(E) + 계기판(observability) 이 먼저.

## Commits

| hash | description |
|------|-------------|
| `96b96e8` | feat(W-0088-E1): flywheel cold-start — bulk import lane |
| `4ae5525` | feat(W-0088-E2): flywheel observability — /observability/flywheel/health |

## What Changed

### Slice 1 — Bulk import lane (96b96e8)
- `engine/api/routes/captures.py`
  - `POST /captures/bulk_import` — up to 1000 manual_hypothesis rows/call
  - 각 row → `CaptureRecord(status='pending_outcome')` 로 저장, outcome_resolver 가 다음 tick 에 처리
  - `_status_for_kind()` 헬퍼: pattern_candidate + manual_hypothesis → pending_outcome, chart_bookmark + post_trade_review → closed
- Tests (+4): manual_hypothesis pending, chart_bookmark closed, bulk rows, empty rejection

### Slice 2 — Observability endpoint (4ae5525)
- `engine/api/routes/observability.py` (new)
  - `compute_flywheel_health(now)` pure function → 6 KPI dict
  - `GET /observability/flywheel/health` FastAPI wrapper
  - KPI: captures_per_day_7d, captures_to_outcome_rate, outcomes_to_verdict_rate, verdicts_to_refinement_count_7d, active_models_per_pattern, promotion_gate_pass_rate_30d
- `engine/api/main.py` — router mount at `/observability`
- Tests (+8): empty state, per-day windowing, status-derived rate, verdict rate, refinement count, registry reflection, promotion rate, HTTP envelope

## Verified
- **787 engine tests green** (+28 new since session start, 0 regression)

## Flywheel Status
- Axis 1 (Capture): **CLOSED** — bulk import lane live (E1)
- Axis 2 (Outcome): **CLOSED** — resolver live
- Axis 3 (Verdict): open — Phase C pending user traffic
- Axis 4 (Refinement): open — Phase D pending verdicts
- Observability: **LIVE** — `/observability/flywheel/health` returns 6 KPIs

## Next Recommended

**Founder seeds 20-50 captures** via `/captures/bulk_import` → resolver fires hourly → `/observability/flywheel/health` shows:
  - `captures_per_day_7d > 0` ✓
  - `captures_to_outcome_rate` moving toward 1.0

그 이후에 Phase C (verdict inbox) 또는 Phase D (refinement_trigger) 둘 중 데이터가 요구하는 쪽으로 진행.
