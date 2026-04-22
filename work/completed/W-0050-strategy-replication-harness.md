# W-0050 Strategy Replication Harness

## Goal

Define the first canonical replication harness for external trading strategies so one strategy can be reimplemented, trade-level aligned against its source backtest, and then re-run under venue-specific execution costs with a reproducible report.

## Owner

research

## Scope

- define the first end-to-end workflow for one external strategy replication run
- define the minimum artifacts for source capture, local reimplementation, trade-level alignment, zero-cost replay, and venue-cost replay
- define the acceptance gate for calling a replicated strategy "aligned"
- keep the workflow compatible with the existing engine backtest and audit artifacts

## Non-Goals

- bulk-ingesting hundreds of TradingView strategies in this slice
- building a full PineScript parser or crawler in the first iteration
- proving product-market fit for copied public strategies
- changing the current engine thesis, scanner, or app surfaces in the first slice

## Canonical Files

- `AGENTS.md`
- `work/active/W-0050-strategy-replication-harness.md`
- `docs/domains/evaluation.md`
- `docs/domains/engine-pipeline.md`
- `research/thesis/current-thesis.md`
- `research/evals/strategy-replication-protocol-v0.md`
- `research/experiments/strategy-replication-pilot-2026-04-16.md`
- `research/datasets/strategy-replication/README.md`
- `engine/backtest/simulator.py`
- `engine/backtest/audit.py`
- `engine/scanner/pnl.py`
- `engine/api/schemas_backtest.py`

## Facts

- the repo already has a runnable backtest engine with trade artifacts and run metadata
- the repo already has an execution cost model with fees and slippage inputs
- the current canonical research thesis is baseline/verdict oriented, not source-strategy replication oriented
- there is not yet a canonical trade-level alignment gate between an external source backtest and local engine output
- trust in future strategy claims will depend on reproducible alignment before fee-sensitive performance claims

## Assumptions

- the first slice should target one manually selected strategy, not automation at scale
- the first source can be captured manually as code plus screenshot/export evidence if no direct API is available
- the first venue-cost replay may begin with fees-only and document slippage assumptions explicitly
- the first recommended target should minimize hidden state and reduce replication ambiguity

## Open Questions

- whether the first parity run should model source slippage as zero when the source only exposes commission settings
- whether the first implementation should live entirely under app-side research orchestration or add engine-side comparison helpers immediately
- whether the first pilot should record both bar-time and fill-price mismatches or just the aggregate aligned/misaligned counts

## Decisions

- start with one strategy and one reproducible report instead of building a crawler first
- treat trade-level alignment as a hard gate before any venue-cost performance claim
- reuse the existing engine backtest and audit spine rather than creating a parallel simulator
- separate zero-cost replay from venue-cost replay so fee impact is measurable and attributable
- store canonical source packs under `research/datasets/strategy-replication/<strategy-id>/`
- use a fixed replication protocol and a separate experiment-family note instead of burying the workflow only in the work item
- recommend a simple long-only BTC strategy as the first pilot target so the first slice tests the harness, not PineScript edge cases
- add a runnable source-pack preflight before local parity implementation so missing provenance and hidden assumptions are explicit
- this slice should merge as a research/eval unit separate from refinement control-plane code and separate from terminal capture UX work
- branch split reason: commit `7b845a7` mixed replication harness artifacts with refinement/control-plane and chart-range spec work, so this slice needs an isolated research/eval PR

## Next Steps

1. Run and maintain the source-pack preflight for the first pilot strategy under `research/datasets/strategy-replication/`.
2. Replace preflight blockers with captured source settings and executable logic.
3. Implement the alignment report defined in `research/evals/strategy-replication-protocol-v0.md`, then run parity, zero-cost, and venue-cost comparisons.

## Exit Criteria

- one external strategy can be reproduced locally from canonical inputs
- a trade-level alignment report exists with explicit pass/fail criteria
- zero-cost and venue-cost replays can be compared from the same local implementation
- future replication work can scale from this file without re-deriving the workflow from chat

## Handoff Checklist

- this slice is research/eval infrastructure, not product UI
- do not expand to multi-strategy crawling until one-strategy replication is trustworthy
- preserve reuse of `engine/backtest/*` and `engine/scanner/pnl.py` as the core execution path
