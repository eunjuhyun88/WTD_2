# W-0037 Pattern Capture Record

## Goal

Make `Save Setup` capable of creating a canonical engine-side `CaptureRecord` that links user judgment to a durable pattern phase transition.

## Owner

engine

## Scope

- Add engine capture types and local durable store.
- Require `candidate_transition_id` for pattern candidate captures.
- Validate that the referenced transition exists in `PatternStateStore`.
- Preserve chart context, feature snapshot, block scores, user note, scan id, and candidate id.
- Add a small engine API route for create/get/list capture records.

## Non-Goals

- No app `/terminal` rewiring in this slice.
- No ChallengeRecord projection in this slice.
- No outcome/verdict UI.
- No migration of existing challenge or ledger data.

## Canonical Files

- `AGENTS.md`
- `work/active/W-0037-pattern-capture-record.md`
- `work/active/W-0035-pattern-transition-persistence.md`
- `docs/domains/pattern-engine-gap-hardening.md`
- `engine/patterns/state_store.py`
- `engine/patterns/types.py`
- `engine/capture/types.py`
- `engine/capture/store.py`
- `engine/api/routes/captures.py`
- `engine/api/main.py`
- `engine/tests/test_capture_store.py`
- `engine/tests/test_capture_routes.py`

## Facts

- Durable phase transitions have stable `transition_id`, `scan_id`, `feature_snapshot`, and `block_scores`.
- Active execution branch is the cleaned `codex/w-0037-pattern-capture-record-clean`; unrelated app persistence files remain outside this PR.
- `CaptureRecord` must reference a durable transition for `pattern_candidate` captures.
- Same transition may be captured by multiple users, so the relationship is many captures to one transition.
- `engine/capture` persists capture records in SQLite and `/captures` exposes create/get/list routes.

## Assumptions

- SQLite local-first storage is acceptable for capture records in this slice.
- `engine/state/pattern_capture.sqlite` can be separate from `pattern_runtime.sqlite` for reversible implementation.
- App rewiring can happen later through `/api/engine/captures`.

## Open Questions

- Whether later Challenge projection should live in `engine/capture/projection.py` or `engine/challenge/`.
- Whether capture status should become a richer state machine after outcome/verdict linkage.

## Decisions

- Use a clean branch reconstructed from `origin/main` plus the engine capture commits, because the original worktree mixed this slice with app persistence work.
- Keep capture engine-owned; app only submits user action and renders returned record.
- Fail closed for `pattern_candidate` captures without a valid transition id.
- Use separate local DB files for runtime transitions and capture records in this slice.

## Next Steps

1. Open PR for capture store/API plus candidate metadata.
2. Wire app Save Setup to `/api/engine/captures` after this PR lands.
3. Keep terminal persistence rollout split from this engine slice.

## Exit Criteria

- Creating a capture with a valid transition id succeeds.
- Creating a pattern candidate capture with a missing/invalid transition id fails.
- Capture records persist chart context, feature snapshot, and block scores.
- Targeted capture and pattern state tests pass.

## Handoff Checklist

- Active branch: `codex/w-0037-pattern-capture-record-clean`
- Verification status: `uv run pytest tests/test_capture_store.py tests/test_capture_routes.py tests/test_pattern_candidate_routes.py tests/test_patterns_scanner.py tests/test_pattern_state_store.py tests/test_patterns_state_machine_durable.py` passes from `engine/`.
- Remaining blockers: app Save Setup is not yet rewired to the capture route.
