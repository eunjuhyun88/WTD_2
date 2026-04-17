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
- `engine/screener/types.py`
- `engine/screener/pipeline.py`
- `engine/screener/store.py`
- `engine/api/routes/screener.py`
- `engine/data_cache/token_universe.py`
- `engine/universe/loader.py`
- `engine/universe/screened.py`
- `engine/universe/config.py`
- `engine/scanner/scheduler.py`

## Facts

- the live scanner already reads a named universe through `engine/universe/loader.py`, and the default live universe is `binance_dynamic`.
- the shared token-universe dataset plus existing 15-minute scanner cadence give Screener an upstream base without duplicating downstream timing logic.
- the current product system does not need a Day-1 `/screener` page, and several deferred criteria still rely on expensive or brittle dependencies that must degrade explicitly.
- `engine/screener/*`, `engine/api/routes/screener.py`, and `engine/universe/screened.py` now provide canonical types, SQLite-backed latest/run/override storage, read-only routes, and `screened_ab` / `screened_a` fallback behavior.
- targeted Screener/universe pytest now passes on the current branch, but this branch still contains unrelated terminal/docs/ledger work and must not be merged as one unit.

## Assumptions

- the first useful screener can ship with a partial criteria set if missing criteria are explicit and do not silently inflate grades
- Screener should produce a durable latest-grade view plus a historical run log
- live scan filtering should fall back to `binance_dynamic` when no fresh screener run is available

## Open Questions

- whether the first app surface should live under `/patterns`, `/terminal`, or a deferred dedicated `/screener` route
- whether Binance Alpha membership should be a hard source field in Sprint 1 or a later enrichment
- where the first population job should run: ad hoc CLI, scheduler task, or a dedicated Screener refresh worker

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
- first implementation slice remains engine-only even though it now includes read-only engine routes; no app runtime dependency is required for the first merge
- SQLite WAL is the chosen Day-1 persistence home for Screener latest state, run logs, and overrides
- `screened_ab` / `screened_a` should return no symbols when the latest Screener run is stale, then fall back one layer up to `binance_dynamic` through the universe loader
- branch context note: this implementation is currently sitting on `task/w-0024-terminal-attention-implementation`, which already has unrelated terminal changes, so future merge work must extract the Screener files onto an isolated engine branch

## Next Steps

1. extract the Screener package, engine routes, universe bridge, and tests onto a clean engine-only branch from `origin/main`
2. add the first population path that writes Screener runs from token-universe inputs into the SQLite store
3. define the uplift evaluation loop comparing `screened_ab` against `binance_dynamic` on downstream Pattern Engine hit quality before any config switch or UI rollout

## Exit Criteria

- Screener has a canonical runtime model aligned with existing universe/scanner infrastructure
- per-criterion score storage, run storage, override state, and read contracts are explicit enough to implement without re-deriving from chat
- rollout phases clearly separate Sprint 1 core criteria from later expensive enrichments
- universe filter semantics, confidence rules, and fallback behavior are documented
- engine can persist and read latest Screener listings and expose a filtered symbol set without requiring collectors to exist yet

## Handoff Checklist

- current branch: `task/w-0024-terminal-attention-implementation`
- verification status:
  - `uv run --with pytest --with pandas --with fastapi --with httpx pytest engine/tests/test_screener_engine.py engine/tests/test_screener_pipeline.py engine/tests/test_screener_routes.py engine/tests/test_screener_store.py engine/tests/test_universe.py`
- remaining blockers: define the first population/refresh job, confirm first UI mounting surface, define how Binance Alpha membership is sourced, and decide where uplift evaluation artifacts live
