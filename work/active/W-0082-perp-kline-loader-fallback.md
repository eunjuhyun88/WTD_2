# W-0082 Perp Kline Loader Fallback

## Goal

Allow engine pattern scans to evaluate Binance perpetual-only symbols by falling back from spot klines to futures klines when the symbol is invalid on spot.

## Owner

engine

## Scope

- add a canonical futures-kline fetch path in `engine/data_cache`
- make `load_klines(..., offline=False)` persist 1h price data for perp-only symbols
- verify the TRADOOR/PTB reference-pattern scan can evaluate those symbols instead of dropping them before block evaluation

## Non-Goals

- redesigning the pattern state machine or phase thresholds
- changing alert policy, ledger semantics, or app routes
- broadening the cache format beyond the existing `{SYMBOL}_1h.csv` contract

## Canonical Files

- `AGENTS.md`
- `work/active/W-0082-perp-kline-loader-fallback.md`
- `docs/product/core-loop.md`
- `engine/data_cache/loader.py`
- `engine/data_cache/fetch_binance.py`
- `engine/data_cache/fetch_binance_perp.py`
- `engine/tests/test_data_cache.py`
- `engine/patterns/scanner.py`

## Facts

- the reference pattern is defined for Binance perp symbols such as `TRADOORUSDT` and `PTBUSDT`
- `load_klines(..., offline=False)` currently fetches only Binance spot klines via `api.binance.com`
- perp data already uses `fapi.binance.com` and the cache already contains `*_perp.csv` files for `TRADOORUSDT` and `PTBUSDT`
- live validation currently fails before pattern evaluation because spot returns `HTTP 400 {"code":-1121,"msg":"Invalid symbol."}` for `PTBUSDT`
- after adding perp-kline fallback, live scans evaluate both symbols successfully, but the current rule set still leaves both in `FAKE_DUMP` and historical replay reaches `REAL_DUMP` for `PTBUSDT` only before timing out

## Assumptions

- futures klines should be acceptable as the canonical price source for perp-only pattern scans
- keeping the existing `*_1h.csv` filename is preferable to introducing a second on-disk format in this slice

## Open Questions

- whether spot-listed symbols should continue preferring spot over futures when both exist

## Decisions

- keep spot as the first fetch path and add futures as an explicit fallback for invalid-spot symbols
- keep the change limited to data-cache loading and targeted tests
- treat the post-fix replay result as evidence that data access was a blocker, but phase/block tuning is a separate follow-up slice

## Next Steps

1. Inspect why the reference replay does not satisfy `ACCUMULATION`, especially the `funding_flip` requirement after `REAL_DUMP`.
2. Decide whether replay/backfill should become a first-class engine tool instead of an ad hoc verification script.
3. Keep the perp data path stable while phase/block tuning happens separately.

## Exit Criteria

- perp-only symbols can populate `*_1h.csv` through the engine loader
- targeted data-cache and pattern tests pass
- a live scan evaluates `PTBUSDT` and `TRADOORUSDT` instead of returning zero evaluated symbols

## Handoff Checklist

- this slice is an engine logic change only
- do not change pattern semantics while fixing data access
- report whether the live scan reaches a phase or still produces no entry candidate after evaluation
