# W-0009 Pattern Entry ML Shadow Path

## Goal

Establish a canonical `pattern entry -> ML score -> ledger record` path without changing alert behavior yet, and fix verdict label leakage so future training data is trustworthy.

## Owner

engine

## Scope

- fix `ledger` auto-verdict leakage so evaluation only uses prices inside the configured post-entry window
- make auto-verdict safe for UTC-aware pattern timestamps emitted by the state machine
- add a shared feature-row scoring path for LightGBM so `patterns` can score entry snapshots without rebuilding bespoke snapshots
- persist pattern-entry ML metadata in the ledger for later training and audit
- keep pattern alerts in shadow mode: record ML decisions, do not suppress entry candidates yet

## Non-Goals

- changing the user-facing pattern summary payloads
- introducing threshold-based alert suppression in this slice
- unifying every existing ML CLI and research script
- migrating ledger storage off JSON

## Canonical Files

- `engine/ledger/store.py`
- `engine/ledger/types.py`
- `engine/patterns/scanner.py`
- `engine/scoring/lightgbm_engine.py`
- `engine/scoring/feature_matrix.py`
- `engine/tests/test_ledger_store.py`

## Decisions

- pattern-entry ML runs in shadow mode first; the ledger becomes the audit trail before any alert gating is enabled
- the canonical inference input for pattern-entry scoring is the stored feature row, not an ad hoc partial `SignalSnapshot`
- label evaluation must be bounded to `[entry_time, entry_time + evaluation_window]`; using pre-entry or post-window prices is invalid
- ledger records should store both rule context and ML context so training rows are reproducible later

## Next Steps

- add a dataset builder that converts ledger records into trainable `(X, y, meta)` rows
- add model/policy version fields to the future training job output
- add threshold calibration from shadow-mode precision/recall instead of hard-coding a production gate

## Exit Criteria

- `auto_evaluate_pending()` no longer leaks pre-entry or post-window prices into verdicts
- pattern entry saves ML metadata to the ledger when a model is available
- no user-visible alert filtering changes are introduced in this slice
- targeted engine tests cover the leakage fix and the new shadow-scoring persistence path
