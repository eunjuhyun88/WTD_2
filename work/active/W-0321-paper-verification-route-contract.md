# W-0321 — Paper Verification Route Contract Test

> Wave: Wave4 | Priority: P1 | Effort: XS
> Status: Review
> Issue: #682

## Goal

Pin the V-PV-01 `POST /patterns/{slug}/verify-paper` route so the core-loop verification surface cannot regress while V-PV-03/V-PV-04 are built.

## Owner

Codex A091 — engine route verification.

## Scope

- Add FastAPI `TestClient` coverage for `verify-paper`.
- Use a fake ledger store with deterministic outcome records.
- Verify response shape, counts, win rate, and pass gate.

## Non-Goals

- Do not implement V-PV-03 historical backtest yet.
- Do not add new persistence.
- Do not change paper gate thresholds.

## Canonical Files

- `engine/api/routes/patterns.py`
- `engine/verification/executor.py`
- `engine/verification/types.py`
- `engine/tests/verification/test_executor.py`
- `engine/tests/test_pattern_paper_verification_route.py`

## Facts

- V-PV-01 exists and was merged as W-0298 / PR #604.
- Current executor tests cover `run_paper_verification` directly.
- No route-level test currently pins `/patterns/{slug}/verify-paper`.

## Assumptions

- Route should remain sync JSON with `ok: true` and scalar metrics.

## Open Questions

- [ ] V-PV-03 should decide whether backtest and outcome-ledger verification share one endpoint or separate endpoints.

## Decisions

- **[D-0321-1]** Add route contract test before building V-PV-03. Reason: route shape is the app/engine coupling point.

## Next Steps

1. Done — route test with fake ledger store.
2. Done — executor + route tests.
3. Pending — PR/CI/merge.

## Exit Criteria

- [x] `POST /patterns/{slug}/verify-paper` route returns deterministic gate metrics in test.
- [x] `cd engine && uv run pytest tests/test_pattern_paper_verification_route.py tests/verification/test_executor.py -q` passes.
- [ ] CI green.

## Handoff Checklist

- [ ] PR merged
- [ ] CI green
- [ ] V-PV-03 remains next implementation item
