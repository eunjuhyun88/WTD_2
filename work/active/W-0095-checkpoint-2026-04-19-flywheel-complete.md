# W-0095 Checkpoint — 2026-04-19 Flywheel Closure Complete

## Session Summary

W-0088 전체 완료. 4축 + observability + CTO 리팩토링까지 엔진 사이드 전부 머지.

## Commits (this session)

| hash | description |
|------|-------------|
| `47afb72` | feat(W-0088-C): verdict labeling — POST /captures/{id}/verdict closes axis 3 |
| `f380610` | feat(W-0088-D): refinement trigger — data-driven flywheel axis 4 |
| `a97d019` | refactor(W-0088): CTO clean-up — eliminate duplication + dead code |
| merge commits | Phase C, D, refactor → main |

## Flywheel Status — ALL 4 AXES CLOSED

| Axis | Route / Job | Status |
|------|-------------|--------|
| 1 Capture | `POST /captures`, `POST /captures/bulk_import` | ✅ |
| 2 Outcome | `outcome_resolver_job` (Job 3b, hourly) | ✅ |
| 3 Verdict | `POST /captures/{id}/verdict` | ✅ |
| 4 Refinement | `refinement_trigger_job` (Job 3c, daily) | ✅ |
| Observability | `GET /observability/flywheel/health` (6 KPIs) | ✅ |

## Test Count

797 passed, 4 skipped — 0 regressions

## What Changed This Session

### Phase C — Verdict labeling (47afb72)
- `POST /captures/{capture_id}/verdict` — founder labels `outcome_ready` captures
- Body: `{user_verdict: "valid"|"invalid"|"missed", user_note?}`
- Writes `PatternOutcome.user_verdict`, appends `LEDGER:verdict`, advances status to `verdict_ready`
- Guard: 409 if not `outcome_ready`, 422 if no `outcome_id` linked
- Tests (+4): happy path, pending guard, not-found, missing outcome_id

### Phase D — Refinement trigger (f380610)
- `engine/scanner/jobs/refinement_trigger.py` — new daily Job 3c
- `check_refinement_gates()` — pure, injectable: returns eligible slugs
- Gate 1: `days_since_last_training_run >= 7` (default, `REFINEMENT_MIN_DAYS`)
- Gate 2: `verdict_count_since_last_run >= 10` (default, `REFINEMENT_MIN_VERDICTS`)
- Old verdicts before last training_run excluded from count
- Tests (+6): no verdicts, no-prior-run, day gate, stale count, multi-pattern

### CTO Refactor (a97d019)
- `ledger/store.py` — removed duplicate `HIT/MISS` constants; `auto_evaluate_pending()` now delegates to `outcome_policy.decide_outcome()` — single source of truth
- `capture/store.py` — added `count_by_status() -> dict[str, int]` (single GROUP BY SQL)
- `observability.py` — replaced 3× `list(limit=10000)` with `count_by_status()`; removed dead `outcome_capture_links` computation and `Path` import hack
- `refinement_trigger.py` — `training_runs[0]` → `most_recent_run` with explicit comment

## Architecture After W-0088

```
[App Save Setup]
    ↓ dual-write
[POST /captures]  ← CaptureRecord(status=pending_outcome)
    ↓ hourly
[outcome_resolver_job]  ← OHLCV → decide_outcome() → PatternOutcome
    ↓ LEDGER:outcome
[POST /captures/{id}/verdict]  ← founder labels valid/invalid/missed
    ↓ LEDGER:verdict
[refinement_trigger_job]  ← gates: 10 verdicts + 7 days
    ↓
[pattern_refinement_job]  ← auto_train_candidate=True
    ↓ LEDGER:training_run / LEDGER:model
[ModelRegistry]  ← promotion gate
```

## KPI Baseline (before seeding)

All 6 KPIs at 0.0 until founder seeds captures via `POST /captures/bulk_import`.

## Next Session — Verdict Inbox UI (W-0097)

엔진 사이드 완료. 남은 gap:

1. **Verdict Inbox UI** — app `/dashboard` 페이지. `GET /captures?status=outcome_ready` → 카드 리스트 → 버튼 클릭 → `POST /captures/{id}/verdict`. 이게 없으면 founder가 curl로만 레이블 가능.
2. **Founder seeding** — `POST /captures/bulk_import`으로 20-50개 역사적 셋업 주입.
3. **KPI 모니터링** — seeding 후 `GET /observability/flywheel/health` 로 axis 1-2 clearance 확인.

Phase E의 Public report publishing은 데이터가 충분히 쌓인 후.
