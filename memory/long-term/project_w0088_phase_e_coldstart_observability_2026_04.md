---
name: W-0088 Phase E slice 1-2 — cold-start + flywheel observability
description: CTO pivoted from Phase C (verdict UI) to Phase E (cold-start + KPIs). Reason — plumbed flywheel with zero input traffic. Bulk import lane + /observability/flywheel/health shipped instead. Main d6d20e1.
type: project
originSessionId: a7d7611b-82ac-4b43-8c49-2b074180b6c2
---
**Fact:** CTO priority call on 2026-04-18 (session 3d): before building verdict inbox (Phase C) or refinement trigger (Phase D), ship the cold-start seed lane and the measurement endpoint. Without traffic, Phase C/D are just cargo cult. Merged to main at `d6d20e1`.

**What exists now:**
- `POST /captures/bulk_import` — up to 1000 manual_hypothesis rows/call. Each becomes a CaptureRecord with `status='pending_outcome'` so outcome_resolver closes it on the next hourly tick. Located in `engine/api/routes/captures.py`.
- manual_hypothesis singleton captures (not just bulk) also enter as `pending_outcome` now — previous behavior was `closed` which skipped the resolver.
- `GET /observability/flywheel/health` → 6 KPIs: captures_per_day_7d, captures_to_outcome_rate, outcomes_to_verdict_rate, verdicts_to_refinement_count_7d, active_models_per_pattern, promotion_gate_pass_rate_30d. Pure `compute_flywheel_health(now)` for testability in `engine/api/routes/observability.py`.

**Why this order:** docs/product/flywheel-closure-design.md §Success Criteria lists 6 KPIs. Two of them (#5 active_models, #6 promotion_gate_pass_rate) are already positive from canonical-pack promotions. Four remaining need data. #1 `captures_per_day_7d > 0` is the binding constraint — it doesn't clear without either real users or founder bulk import. Nothing else moves without #1.

**How to apply:**
- Next session: ask founder whether they've seeded captures via `/captures/bulk_import`. Then call `/observability/flywheel/health` and let the numbers dictate Phase C vs D. If `captures_to_outcome_rate < 0.5` after seeding, resolver has a bug — fix before Phase C. If it clears 0.9, move to Phase C verdict inbox.
- Don't build Phase C UI without seeded data — verdict inbox of an empty list is waste.
- The `_status_for_kind()` helper in `captures.py` centralizes ingest-time status; extend it when adding new capture kinds.
