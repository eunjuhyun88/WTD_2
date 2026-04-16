# W-0053 Coin Screener Upstream Filter

## Goal

Define the first canonical Coin Screener lane so Binance alpha + futures symbols are scored against durable criteria, graded into A/B/C, and then used as an upstream filter for Pattern Engine scans and alerts.

## Owner

engine

## Scope

- define the engine-owned runtime model for coin screening
- define the minimum record/store shape for raw metrics, per-criterion scores, structural grade, timing score, and confidence state
- define how Screener output filters the live scan universe without breaking existing `binance_dynamic`
- define the first read contracts and deferred `/screener` product surface
- define a phased rollout so Sprint 1 ships with high-signal criteria only

## Non-Goals

- implementing all 11 criteria in one slice
- depending on high-cost APIs before core scoring works
- replacing Pattern Engine timing logic with Screener logic
- introducing a new live product page before engine output and route contracts are stable

## Canonical Files

- `AGENTS.md`
- `work/active/W-0053-coin-screener-upstream-filter.md`
- `docs/domains/coin-screener.md`
- `docs/domains/engine-pipeline.md`
- `docs/domains/scanner-alerts.md`
- `docs/product/pages/00-system-application.md`
- `docs/product/pages/06-screener.md`
- `engine/data_cache/token_universe.py`
- `engine/universe/loader.py`
- `engine/universe/config.py`
- `engine/scanner/scheduler.py`

## Facts

- the live scanner already reads a named universe through `engine/universe/loader.py`, and the default live universe is `binance_dynamic`
- the shared token-universe dataset already gives a ranked Binance futures symbol pool with price, volume, OI, market cap, and sector fields
- existing Pattern Engine and scanner jobs already run every 15 minutes, so Screener should not duplicate timing logic that already exists downstream
- the current product system does not have `/screener` as an active Day-1 page, so first rollout must work without a new primary surface
- several proposed criteria rely on expensive or brittle dependencies (`Twitter`, event crawlers, LLM sector judgment), so a useful first slice must degrade without them and still report uncertainty explicitly
- no engine Screener package exists yet, so the first code slice must establish types, store, and universe bridge before any collectors or UI can consume it

## Assumptions

- the first useful screener can ship with a partial criteria set if missing criteria are explicit and do not silently inflate grades
- Screener should produce a durable latest-grade view plus a historical run log
- live scan filtering should fall back to `binance_dynamic` when no fresh screener run is available

## Open Questions

- whether the first persistence store should be SQLite-only or ledger-backed from Day 1
- whether the first app surface should live under `/patterns`, `/terminal`, or a deferred dedicated `/screener` route
- whether Binance Alpha membership should be a hard source field in Sprint 1 or a later enrichment

## Decisions

- Screener is engine-owned and upstream of Pattern Engine; app surfaces only read Screener output and route into terminal/pattern pages
- first rollout should split scoring into `slow base criteria` and `fast live overlay criteria` instead of recomputing every criterion every 15 minutes
- canonical output must separate `structural_grade` from `timing_score`; Screener should not collapse "good symbol" and "good entry timing" into one opaque number
- Screener output must include an explicit `confidence` or `coverage` state so missing slow criteria cannot silently produce high-trust grades
- Sprint 1 includes only criteria with low dependency risk: market cap, drawdown, history, supply concentration, pattern, and onchain
- missing deferred criteria must remain visible as `unscored` with explicit freshness and provenance, not hidden behind fabricated neutral values
- universe filtering should add a new named universe path instead of redefining `binance_dynamic`; scanner adoption can switch by config after validation
- the first filtered universe contract should be `screened_ab`, with `screened_a` added only if alert throughput still needs tightening
- Screener needs a manual override plane for blacklist names, known Binance treasury wallets, symbol identity exceptions, and supply-concentration allow/deny adjustments
- Screener promotion value must be measured against baseline universes by downstream Pattern Engine outcomes, not assumed from intuitive scoring quality
- `/screener` is a deferred surface in the current system guide; first delivery priority is engine run/store/read contracts, then surface
- first implementation slice is engine-only: add `engine/screener` types, store, and aggregation helpers plus named universe support for `screened_ab` / `screened_a`
- read-only API routes are useful but optional after the engine store exists; do not block the first slice on app-facing route work
- branch context note: this design is being written on `task/w-0024-terminal-attention-implementation`, which already has unrelated terminal changes, so future implementation must stage Screener work carefully or move to an isolated branch

## Next Steps

1. implement `engine/screener` types, aggregation helpers, SQLite store, and tests for `structural_grade`, `timing_score`, `confidence`, and filtered symbol retrieval
2. wire `screened_ab` and `screened_a` into universe loading with explicit fallback to `binance_dynamic`
3. add read-only API routes and define the uplift evaluation loop comparing `screened_ab` against `binance_dynamic` on downstream Pattern Engine hit quality before broad UI rollout

## Exit Criteria

- Screener has a canonical runtime model aligned with existing universe/scanner infrastructure
- per-criterion score storage, run storage, override state, and read contracts are explicit enough to implement without re-deriving from chat
- rollout phases clearly separate Sprint 1 core criteria from later expensive enrichments
- universe filter semantics, confidence rules, and fallback behavior are documented
- engine can persist and read latest Screener listings and expose a filtered symbol set without requiring collectors to exist yet

## Handoff Checklist

- current branch: `task/w-0024-terminal-attention-implementation`
- verification status: doc-only slice; no engine or app runtime changes yet
- remaining blockers: choose persistence home, confirm first UI mounting surface, define how Binance Alpha membership is sourced, and decide where uplift evaluation artifacts live
