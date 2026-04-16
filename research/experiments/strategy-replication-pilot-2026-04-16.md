# Strategy Replication Pilot

## Goal

Track the canonical experiment lineage for the first external-strategy replication harness.

## Status

Active design-ready experiment family. First source pack and first local run are still pending.

## Fixed protocol

This family uses `research/evals/strategy-replication-protocol-v0.md`.

## Pilot recommendation

Recommended first target:

- experiment target id: `rsi-overbought-long-btc-4h`
- source label: `RSI > 70 Buy / Exit on Cross Below 70`
- reason: simple deterministic rules, one symbol, one timeframe, long-only, low manual-audit burden

If the source cannot be captured cleanly, move to the next simple deterministic BTC or ETH strategy rather than taking a complex multi-state script first.

## Experiment set

### 1. Source capture

- experiment id: `replication-pilot-source-capture-2026-04-16`
- purpose: create the canonical source pack for the first target
- command: `npm --prefix app run research:replication-pilot:preflight`
- expected dataset path: `research/datasets/strategy-replication/rsi-overbought-long-btc-4h/`
- expected outputs:
  - `source-summary.md`
  - `source-code.pine`
  - `source-notes.md`
  - any supporting screenshots or trade exports
  - `docs/generated/research/report-replication-pilot-source-capture-2026-04-16.md`
  - `docs/generated/research/report-replication-pilot-source-capture-2026-04-16.json`
- current status: scaffolded locally; still pending external source capture and evidence

### 2. Parity and alignment run

- experiment id: `replication-pilot-parity-align-2026-04-16`
- purpose: run the first local implementation under source-parity assumptions and produce a trade-level alignment report
- planned implementation lane:
  - orchestration under `app/scripts/research/experiments/strategy-replication-pilot-2026-04-16/`
  - execution via `engine/backtest/*`
- expected outputs:
  - parity run metadata
  - alignment report JSON
  - alignment report markdown
- current status: pending

### 3. Zero-cost replay

- experiment id: `replication-pilot-zero-cost-2026-04-16`
- purpose: isolate pure strategy logic after the strategy passes alignment
- expected output: normalized replay summary with fees and slippage disabled
- current status: blocked on alignment pass

### 4. Venue-cost replay

- experiment id: `replication-pilot-venue-cost-2026-04-16`
- purpose: measure execution-cost sensitivity after the strategy passes alignment
- expected output: venue-cost replay summary and delta vs zero-cost replay
- current status: blocked on alignment pass

## Interpretation rule

- `not_aligned`: parity/alignment gate failed; no venue-cost claim allowed
- `aligned`: parity/alignment gate passed; zero-cost and venue-cost comparison is eligible
- `aligned_but_fee_fragile`: alignment passed, but venue-cost replay materially degrades performance

## Immediate next move

The next concrete step is to replace the scaffolded source pack with the actual external source, backtest settings, and evidence for `rsi-overbought-long-btc-4h`. Do not start with batch ingestion or PineScript automation before one manual pilot is trustworthy.
