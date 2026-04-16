# Strategy Replication Protocol v0

## Goal

Provide one fixed, low-overhead protocol for reproducing an external published strategy, checking trade-level alignment against the source backtest, and then measuring fee sensitivity under normalized and venue-specific execution assumptions.

## Research question

Can one externally published strategy be reimplemented locally with enough trade-level fidelity to trust a second-stage replay under zero-cost and venue-cost assumptions?

## Candidate selection rule

The first pilot should prefer a strategy with:

- explicit, deterministic entry and exit rules
- one symbol and one timeframe
- no pyramiding or partial exits in the first slice
- no opaque AI, external API, or hidden state
- a trade count large enough to test matching but small enough to audit manually

If multiple candidates satisfy the rule, prefer the one with the simplest state machine over the one with the highest reported APR.

## Fixed workflow

### 1. Source capture pack

For each replicated strategy, create `research/datasets/strategy-replication/<strategy-id>/` with:

- `source-summary.md`: source URL, author label, strategy label, symbol, timeframe, backtest window, timezone, initial capital, sizing mode, and visible source settings
- `source-code.pine`: the captured PineScript or equivalent source text when available
- `source-notes.md`: manual interpretation notes for ambiguous logic
- supporting evidence such as screenshots or exported trade lists when available

No strategy may advance to local implementation without a source pack.

### 2. Parity run

Implement the strategy locally and run it under source-parity assumptions as closely as the source allows. The parity run must record:

- same symbol and timeframe
- same backtest window
- same initial capital and visible sizing assumptions
- same visible commission settings when known
- explicit note for every assumption that could not be matched exactly

### 3. Trade-level alignment

The alignment report compares source trades and local trades after normalizing timestamps to UTC bar identity.

Required fields per trade when available:

- direction
- entry timestamp
- exit timestamp
- entry price
- exit price

`match_rate` is the fraction of source trades that found a local counterpart under the following gate:

- same direction
- entry timestamp within one bar
- exit timestamp within one bar
- entry price within `±1.0%`
- exit price within `±1.0%`

Additional gate:

- `trade_count_delta <= max(3, ceil(source_trade_count * 0.10))`

A strategy is `aligned` only when both of the following hold:

- `match_rate >= 0.70`
- trade count delta gate passes

If either gate fails, the strategy is not eligible for venue-cost claims.

### 4. Normalized zero-cost replay

For aligned strategies, re-run the same local implementation with:

- fees = `0`
- slippage = `0`
- same window and capital as the parity run

This run isolates pure strategy logic from execution friction.

### 5. Venue-cost replay

Re-run the same local implementation with a venue-specific cost profile. The first pilot should record:

- fee assumptions
- slippage assumptions
- venue label and date

If slippage is intentionally omitted, the report must say so explicitly and treat the result as `fees_only`.

## Acceptance outputs

Every replication attempt using this protocol should produce:

- source pack path
- parity run metadata path
- alignment report in machine-readable and markdown form
- zero-cost replay summary
- venue-cost replay summary
- short interpretation note: `aligned`, `not_aligned`, or `aligned_but_fee_fragile`

## Recommended first pilot target

Start with a simple long-only BTC strategy. Current recommendation:

- source label: `RSI > 70 Buy / Exit on Cross Below 70`
- canonical local id: `rsi-overbought-long-btc-4h`

Reason:

- deterministic rules
- no short leg
- low hidden-state risk
- likely low enough trade count for manual audit

If source capture reveals missing logic or unavailable code, choose the next simplest candidate rather than forcing this specific target.

## Implementation paths

- orchestration and experiment reporting: `app/scripts/research/experiments/*`
- execution engine and audit artifacts: `engine/backtest/*`
- execution-cost model: `engine/scanner/pnl.py`
- generated reports: `docs/generated/research/`

## Revision rule

If the alignment gate, tolerance, replay stages, or candidate-selection rule changes, create a new protocol file instead of silently rewriting this one.
