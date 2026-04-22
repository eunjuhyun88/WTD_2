---
title: W-0111 - COT Parser + CME OI Blocks
owner: engine
status: planned
created: 2026-04-20
---

# W-0111: COT Parser + CME OI Building Blocks

## Goal

Integrate CME Commitments of Traders (COT) data as a new external API source. Add OI-related building blocks to enrich pattern signals with macro positioning data.

Exit: `cot_parser.py` + 2–3 new OI blocks (cot_large_spec_short, cot_commercial_net_long, etc.) + baseline tests.

## Scope

### W-0111-A: COT Parser CLI
- **Task**: Build `engine/research/cot_parser.py`
- **Goal**: Fetch weekly COT reports from CFTC (public API), parse into symbol-keyed dataframes
- **API**: CFTC COT endpoint (weekly, 2-day lag)
- **Output**: DataFrame with symbol, large_spec_long/short, commercial_net, open_interest_changes
- **Caching**: Store parsed COT in `engine/data_cache/cot/` (pickle, weekly updates)
- **Est**: 1 day (API integration + caching layer)
- **Exit**: `cot_parser.py` with `fetch_cot_report(symbol, week_ago=0)` method

### W-0111-B: COT Building Blocks (2–3 new)
- **Block 1: `cot_large_spec_short`**
  - Trigger: Large specs short positioning > 70th percentile (crowded short)
  - Use case: Reversal entry gate (shorts are over-committed)
  - Formula: (large_spec_short - 20-week mean) / std > 0.8
  
- **Block 2: `cot_commercial_net_long`**
  - Trigger: Commercials (hedgers) net long > 50th percentile
  - Use case: Institutional accumulation signal
  - Formula: commercial_net / open_interest > 0.05
  
- **Block 3: (Optional) `cot_positioning_flip`**
  - Trigger: Large specs flip from net-short to net-long (week-over-week)
  - Use case: Sentiment reversal
  - Formula: (large_spec_long - large_spec_short) WoW > 0
  
- **Est**: 1.5 days (block design + tests + integration)
- **Exit**: 3 blocks in block_evaluator.py, 15+ unit tests

### W-0111-C: Pattern Integration (Optional, may defer)
- **Task**: Add COT blocks to existing patterns or create new CME Gap Fill pattern
- **Goal**: Test COT signal utility via paradigm baseline
- **Est**: 1.5 days (if included)
- **Defer**: If COT data is limited or blocks underperform

## Non-Goals

- Real-time COT streaming (weekly lag is acceptable)
- Alternative CFTC endpoints (focus on main COT report)
- Equity/commodity COT (crypto-futures only: BTC, ETH)
- Full W-0111-C (pattern integration deferred to W-0112)

## Canonical Files

**New:**
- `engine/research/cot_parser.py` — COT fetch + parse + cache
- `engine/tests/test_cot_parser.py` — parser unit tests
- `engine/scoring/blocks/cot_*.py` — 3 new block files (or inline in block_evaluator.py)

**Modified:**
- `engine/scoring/block_evaluator.py` — register 3 new blocks
- `engine/patterns/library.py` — (W-0111-C only) add blocks to patterns

## Facts

1. **CFTC COT API**: Public endpoint, weekly updates every Friday (~2-day lag)
2. **Data frequency**: Weekly (vs. hourly candles) → smoothing/lagging necessary
3. **Symbol coverage**: BTC, ETH, XAU, crude, indices (check CFTC availability)
4. **Positioning insight**: Large specs = retail/momentum traders; commercials = institutions/hedgers
5. **Paradigm-testable**: COT can be backfilled; historical data available from 2006+

## Assumptions

1. CFTC COT API is publicly accessible (no API key needed)
2. BTC/ETH COT data is available (vs. other cryptos)
3. Weekly COT data can be mapped to hourly candles via nearest Friday
4. COT blocks have non-trivial predictive power (vs. noise)

## Open Questions

1. **Symbol mapping**: Does CFTC use "BTC Futures", "Bitcoin", or different naming? (API docs)
2. **Data lag**: How should we handle the 2-day lag (use Friday's data on Monday–Friday)?
3. **Normalization**: Should COT metrics be normalized per-symbol or globally? (empirical test)
4. **Crypto coverage**: Are all 20+ alts available, or just BTC/ETH? (API scan)

## Decisions

- **W-0111-A first, B second, C optional**: Parser must work before blocks can be tested
- **Weekly granularity accepted**: 2-day lag is acceptable for macro positioning data
- **3 blocks minimum**: Experimentation phase; depth will guide future COT patterns
- **Crypto-only focus**: BTC/ETH get priority; alts backfilled if data available

## Next Steps

1. **W-0111-A (1 day)**: Research CFTC API, write parser, test caching
2. **W-0111-B (1.5 days)**: Define 3 blocks, write tests, register in evaluator
3. **W-0111-C (optional, 1.5 days)**: Integrate blocks into patterns, paradigm baseline

## Exit Criteria

- ✅ COT parser fetches, parses, caches weekly data
- ✅ 3 COT blocks registered in block_evaluator.py
- ✅ Tests: ≥15 (parser caching, block logic, edge cases)
- ✅ BTC/ETH COT data backfilled (2020–present)
- ✅ Documentation: COT data freshness policy + block thresholds
- ✅ (Optional) Paradigm baseline for COT blocks ≥0.60 (lower bar than patterns)

## Handoff Checklist

- [ ] W-0111-A: cot_parser.py, fetch_cot_report() API, caching layer
- [ ] W-0111-B: 3 block definitions, tests, block_evaluator.py integration
- [ ] W-0111-C: (Optional) 1–2 patterns updated; paradigm baseline docs
- [ ] Data: BTC/ETH COT cached locally for 2020–present
- [ ] Memory: W-0111 completion checkpoint + next priorities (W-0112, W-0113, W-0114)
