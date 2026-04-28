---
name: W-0088 Phase B — outcome resolver (flywheel axis 2)
description: Pattern flywheel axis 2 closed at d0b8f85. decide_outcome(entry_profitable_at_N) + resolve_outcomes job — hourly, idempotent, injectable klines_loader for tests.
type: project
originSessionId: a7d7611b-82ac-4b43-8c49-2b074180b6c2
---
**Fact:** W-0088 Phase B complete on branch `claude/gracious-diffie` (commits d0b8f85 + 29346b5, pushed 2026-04-18). Flywheel axis 2 (capture → outcome) is closed.

**Shape of the work:**
- `engine/patterns/outcome_policy.py` — `decide_outcome(entry_price, forward_closes, policy) → OutcomeDecision | None`. Defaults HIT=+15%, MISS=-10%, 72h window (matches `engine/ledger/store.py` constants). Per-pattern registry via `policy_for(slug)` / `register_policy(slug, policy)`.
- `engine/scanner/jobs/outcome_resolver.py` — `resolve_outcomes(now_ms_val, capture_store, ledger_store, klines_loader)` pure function + `outcome_resolver_job()` async APScheduler entrypoint. Walks `CaptureStore.list_due_for_outcome` per distinct policy window, derives entry_price from OHLCV at `captured_at_ms`, writes PatternOutcome + LEDGER:outcome + flips capture status to `outcome_ready`.
- `engine/capture/store.py` — added `list(status=...)`, `list_due_for_outcome`, `update_status(capture_id, status, outcome_id?, verdict_id?)`.
- Scheduler Job 3b `outcome_resolver` registered hourly.
- 13 new tests (759 total green, 0 regression).

**Why:** Design in `docs/product/flywheel-closure-design.md` §Outcome resolver. Axis 1 (Phase A, fb3ccf6) was useless without axis 2 — captured setups had no auto-closure path, so promotion gate couldn't see user-era labels. Phase B makes the flywheel turn through capture → outcome automatically.

**How to apply:** 
- When adding a new pattern slug, consider registering an `OutcomePolicy` if its HIT/MISS/window should differ from defaults.
- When writing new scheduler jobs, mirror the outcome_resolver shape: pure `resolve_*()` function with injectable stores + loader, plus thin `async *_job()` wrapper. Keeps tests fast (no APScheduler, no real data_cache).
- Axis 3 (verdict) and axis 4 (refinement_trigger) are the next phases — both still open as of this commit.
