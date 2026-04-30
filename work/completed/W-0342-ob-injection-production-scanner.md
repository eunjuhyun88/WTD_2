W-0342 — Orderbook Injection in Production Scanner
Wave: Core Closure | Priority: P1 | Effort: S | Owner: engine
Status: Implemented | Created: 2026-04-30

## Goal
`orderbook_imbalance_ratio` block was always-False in production because `ob_bid_usd`/`ob_ask_usd`
were never injected into the production scanner's feature DataFrame — only in the research scanner.
This wires the live injection into `universe_scan.py` so the block produces real signals.

## Root Cause
- `engine/research/pattern_scan/scanner.py` has `_inject_live_ob()` at lines 252-264
- `engine/scanner/jobs/universe_scan.py` calls `compute_features_table` but never injects OB after it
- Result: `orderbook_imbalance_ratio` gracefully returns all-False in every production scan

## Scope
**Modified:**
- `engine/scanner/jobs/universe_scan.py`
  - Import `fetch_orderbook_depth5` at module level
  - Add `_inject_ob_depth(features_df, symbol)` helper (perp → spot fallback, 0.0 on fail)
  - Call `_inject_ob_depth(features_df, symbol)` after `compute_features_table`

**Added:**
- `engine/tests/test_universe_scan_ob_injection.py` — 5 tests covering real values, None fallback, exception fallback, last-bar-only, spot fallback

## Non-Goals
- Injecting OB into historical feature_calc (feature_calc is for batch/offline)
- Changing orderbook_imbalance_ratio block logic
- Injecting OB depth for pattern_scan endpoints (already done in research scanner)

## Exit Criteria
- `pytest tests/test_universe_scan_ob_injection.py` → 5 passed
- `orderbook_imbalance_ratio` block fires for symbols with real bid/ask imbalance in next scan cycle
- Graceful: if Binance API fails → 0.0 defaults → block returns False (no crash)

## Decisions
- Perp-first, spot-fallback: matches research scanner pattern
- 0.0 on failure: block returns False for missing data (existing graceful behavior preserved)
- Last-bar-only: correct for live scanning — historical bars don't need real-time OB snapshots
