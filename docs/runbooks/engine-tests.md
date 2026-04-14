# Runbook: Engine Tests

## Standard Command

`cd engine && uv run pytest`

## Task-Level Strategy

- Run module-scoped tests first while iterating.
- Run full suite before merge for engine logic changes.

## Required for Engine Changes

- Feature/block/scanner changes must include test updates when behavior changes.
- Evaluation/scoring changes should include regression-focused assertions.
