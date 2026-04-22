# W-0083 Multi-Timeframe AutoResearch Search

## Goal

Define the engine architecture that can discover one trader-described pattern across multiple timeframes automatically, instead of assuming a single fixed bar interval.

## Owner

research

## Scope

- define how capture evidence becomes a multi-timeframe benchmark pack
- define how the pattern runtime searches across 15m/1h/4h-style timeframe families
- define the promotion gate for pattern variants discovered through parallel autoresearch
- keep the design aligned with the existing core-loop, pattern runtime, and ledger boundaries

## Non-Goals

- implementing the full multi-timeframe runtime in this slice
- replacing the existing rule-first pattern engine with an ML-only detector
- redesigning the app surfaces in this slice

## Canonical Files

- `AGENTS.md`
- `work/active/W-0083-multi-timeframe-autoresearch-search.md`
- `docs/domains/multi-timeframe-autoresearch-search.md`
- `docs/product/core-loop-system-spec.md`
- `docs/domains/pattern-ml.md`
- `engine/patterns/types.py`
- `engine/patterns/scanner.py`
- `engine/scoring/block_evaluator.py`

## Facts

- the reference TRADOOR/PTB pattern was described as an event sequence, not as a single-bar snapshot
- the user explicitly expects the engine to find the pattern even when the operative timeframe varies, including 15m-like structures
- the current pattern runtime is anchored to one pattern timeframe and latest-bar evaluation unless replay is added upstream
- the current phase contract requires exact block matches and does not yet encode multi-timeframe equivalence or one-of transition logic
- the search problem is multi-axis: timeframe, wall-clock duration, and historical search horizon all vary independently

## Assumptions

- pattern search should normalize across a bounded timeframe family such as `15m/1h/4h`, not arbitrary continuous scales in the first slice
- saved captures can provide enough seed evidence to score candidate timeframe variants without requiring full model training first

## Open Questions

- whether the first benchmark pack should be seeded only from manually confirmed captures or may include high-confidence replay-discovered positives

## Decisions

- treat timeframe as a searchable pattern dimension, not a fixed static field
- keep the runtime rule-first, but let autoresearch generate and evaluate multiple timeframe-conditioned pattern variants in parallel
- require holdout robustness across symbols and periods before promoting a discovered timeframe variant
- define the search problem as `query-by-example` over normalized event sequences instead of fixed candle heuristics only
- separate incremental refinement from reset-search so the system can escape local optima
- store negative search results as first-class records so repeated dead ends are not rediscovered endlessly
- position the product as infrastructure first: canonical pattern runtime + search + ledger + promotion, with user-facing tuning as an overlay layer rather than the core system

## Next Steps

1. Lock the benchmark-pack, pattern-variant, and search-run schemas in a domain doc.
2. Implement replay-first pattern restoration and score-based phase contracts for the first reference family.
3. Add worker-control search lanes for incremental refinement, reset search, and negative-result memory.
4. Define the control-plane boundary between canonical managed defaults and per-user overlays.

## Exit Criteria

- the multi-timeframe search design is explicit enough to implement without relying on chat
- the relationship between capture evidence, replay evaluation, and pattern promotion is clear
- the design explains how a 15m-origin pattern can still be found when replayed or monitored on adjacent timeframe families

## Handoff Checklist

- this slice is architecture only
- preserve the rule-first runtime and ledger boundaries
- do not collapse timeframe search into a single heuristic threshold tweak
- keep the first implementation slice narrow: replay restore, score-based `ACCUMULATION`, and failure-aware ledgering
- keep user customization out of the canonical runtime contract; treat it as an overlay or forked variant record
