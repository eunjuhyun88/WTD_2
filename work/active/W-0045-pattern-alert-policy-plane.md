# W-0045 Pattern Alert Policy Plane

## Goal

Add an explicit alert policy plane so raw entry candidates and user-visible candidates are separated, with ML gating allowed only through an `active` pattern model.

## Owner

engine

## Scope

- Add a durable per-pattern alert policy store.
- Introduce policy modes: `shadow`, `visible`, `gated`.
- Keep raw state-machine candidates intact while deriving visible candidates through policy evaluation.
- Expose alert policy state and visible-vs-raw candidate metadata through pattern routes.
- Make `gated` mode rely only on `active` model scoring metadata, never `candidate`.

## Non-Goals

- No app/UI changes.
- No worker-control migration.
- No cooldown, BTC regime filter, or ranking policy in this slice.
- No Telegram formatting changes beyond consuming policy-filtered candidate sets.

## Canonical Files

- `AGENTS.md`
- `work/active/W-0045-pattern-alert-policy-plane.md`
- `docs/domains/pattern-ml.md`
- `docs/domains/scanner-alerts.md`
- `engine/patterns/alert_policy.py`
- `engine/patterns/scanner.py`
- `engine/api/routes/patterns.py`
- `engine/tests/test_pattern_candidate_routes.py`
- `engine/tests/test_patterns_scanner.py`

## Facts

- Pattern runtime currently exposes state-machine entry candidates without a separate visibility policy layer.
- Entry-time scoring now records `entry_rollout_state`, `entry_model_key`, and `entry_threshold_passed`.
- The previous slice introduced explicit `candidate` vs `active` model registry state.
- `candidate` models should remain comparison-only and must not gate visible alerts.
- This slice must stay engine-only because the worktree contains unrelated dirty app and memory changes.

## Assumptions

- Default policy should be `visible` to preserve current user-facing behavior until a pattern is explicitly gated.
- `gated` mode should hide candidates when there is no matching active-model score evidence.

## Open Questions

- Whether cooldown/ranking should live in the same policy object or a separate delivery plane later.

## Decisions

- Alert policy is stored separately from model registry and ledger records.
- `entry_candidates` becomes the visible candidate set; `raw_entry_candidates` remains available for debugging and audit.
- Candidate records stay exhaustive but carry `alert_visible`, `alert_mode`, and `alert_reason`.
- `gated` uses only `active` rollout scoring evidence from the matched entry outcome.

## Next Steps

1. Add alert policy store and policy-evaluation helper.
2. Thread policy metadata through candidate records and scan results.
3. Add get/set alert policy routes and targeted tests.

## Exit Criteria

- Per-pattern alert policy can be read and updated.
- Scan results expose both raw and visible candidate sets.
- Gated visibility depends only on active-model threshold evidence.
- Targeted engine tests pass.

## Handoff Checklist

- Active branch: `task/w-0024-terminal-attention-implementation`
- Verification status: pending targeted engine tests for this slice.
- Remaining blockers: none known.
