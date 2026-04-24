# W-0159 — Canonical Raw Plane Ingestion

## Goal

provider fetch 결과를 기존 CSV cache 에만 남기지 않고, replay/audit 가능한 canonical raw plane 으로 실제 저장해서 이후 `feature_windows` / pattern/search / AI 가 같은 raw truth 위에서 올라가게 만든다.

## Owner

engine

## Primary Change Type

Engine logic change

## Scope

- `raw_market_bars` SQLite canonical table 추가
- `raw_orderflow_metrics` SQLite canonical table 추가
- `raw_perp_metrics` SQLite canonical table 추가
- `raw_liquidation_events` SQLite canonical table 추가
- `market_liquidation_windows` SQLite rolling aggregate table 추가
- Binance kline / perp fetch 결과를 normalized raw rows 로 쓰는 ingestion path 추가
- Binance `forceOrders` recent history를 optional user-private liquidation event rows 로 쓰는 ingress path 추가
- optional user-private liquidation events에서 1h / 4h rolling window aggregates를 materialize 하는 path 추가
- Binance user-data liquidation credential source를 engine runtime에서 deterministic 하게 resolve / diagnose 하는 helper 추가
- contract / coin query 를 canonical symbol 로 resolve 하는 search helper 추가
- resolve 결과를 기존 raw ingress 로 연결하는 on-demand ingestion helper 추가
- high-QPS search를 위한 persisted local market search index 추가
- repeated query hot path를 위한 process-local search result memoization 추가
- multi-instance hot path를 위한 shared Redis search cache 추가
- bounded scheduler/job 기반 index refresh 추가
- actual user-facing universe read route를 local search index path로 cutover
- search query path에서 cold full-universe build를 피하는 bounded enrichment path 추가
- targeted engine tests 추가

## Non-Goals

- `feature_windows` materialization
- search signature persistence
- onchain / fundamental / macro raw planes
- scheduler full cutover
- broad app/UI redesign

## Canonical Files

- `AGENTS.md`
- `work/active/CURRENT.md`
- `work/active/W-0159-canonical-raw-plane-ingestion.md`
- `work/active/W-0148-cto-data-engine-reset.md`
- `docs/domains/terminal-ai-scan-architecture.md`
- `engine/data_cache/fetch_binance.py`
- `engine/data_cache/binance_credentials.py`
- `engine/data_cache/fetch_binance_perp.py`
- `engine/data_cache/fetch_binance_liquidations.py`
- `engine/data_cache/fetch_dexscreener.py`
- `engine/data_cache/liquidation_windows.py`
- `engine/data_cache/loader.py`
- `engine/cache/market_search_cache.py`
- `engine/data_cache/market_search.py`
- `engine/data_cache/raw_store.py`
- `engine/data_cache/raw_ingest.py`
- `engine/api/routes/universe.py`
- `engine/api/routes/jobs.py`
- `engine/scanner/scheduler.py`
- `app/src/components/terminal/workspace/SymbolPicker.svelte`
- `engine/tests/test_jobs_routes.py`
- `engine/tests/test_scheduler.py`
- `engine/tests/test_universe_routes.py`
- `engine/tests/test_market_search.py`
- `engine/tests/test_raw_store.py`
- `engine/tests/test_raw_ingest.py`

## Facts

1. current engine persists market/perp history primarily as CSV cache files under `engine/data_cache/cache/`, not as canonical queryable raw tables.
2. Binance kline responses already contain enough per-bar fields to materialize both `raw_market_bars` and a first `raw_orderflow_metrics` slice.
3. current perp fetch path already merges funding, OI, and long/short ratio into a normalized DataFrame, so the first `raw_perp_metrics` slice can reuse that fetch shape.
4. `W-0148` fixed the policy that provider blobs are not canonical truth; normalized raw rows with provenance/freshness metadata are.
5. `W-0158` landed clean at `e51ab067`, so this raw-plane slice now has its own execution branch without sharing a mixed dirty tree.
6. the current local cut adds a SQLite canonical raw store at `engine/state/canonical_raw.sqlite`, direct Binance raw ingestion helpers, and a CLI entrypoint at `python -m data_cache.raw_ingest`.
7. live fetch succeeded for `BTCUSDT 1h`, writing `75,990` market bars, `75,990` orderflow rows, and `637` normalized perp rows into the canonical raw store.
8. the user requirement is not "store every top DEX token forever" but "search by contract or coin and pull normalized raw on demand".
9. the current local cut adds `python -m data_cache.market_search`, which resolves symbol/contract queries through DexScreener + alpha watchlist metadata and then attempts on-demand Binance raw ingestion.
10. live query fetch succeeded for `AERO`, resolving to `AEROUSDT` and writing `12,125` market bars, `12,125` orderflow rows, and `575` normalized perp rows into the canonical raw store.
11. the current local cut also persists `market_search_index` inside the canonical raw SQLite store, so repeated symbol/contract lookups can hit local indexed rows before any live provider fallback.
12. live index refresh succeeded in this workspace, building `569` indexed rows in `engine/state/canonical_raw.sqlite`.
13. after the refresh, both `AERO` and contract `0x940181a94a35a4569e4529a3cdfb74e38fd98631` resolved from the local index with `--no-live-fallback`.
14. the current local cut adds scheduler/job refresh plumbing plus `/universe?q=...` search handling, and SymbolPicker now sends `q` to the same engine route instead of loading the full universe and filtering contract queries only on the client.
15. repeated symbol/contract queries can still waste work on SQLite lookups and candidate mapping even after the local index exists, so a bounded process-local memoization layer is useful on the read hot path.
16. `GET /universe?q=` currently does not need a cold full-universe rebuild to answer a local-index hit; enrichment can stay cache-only unless the caller explicitly requests refresh.
17. engine lifespan already warms a shared Redis pool for other cache paths, so market search can reuse the same runtime dependency for cross-instance query caching.
18. once query traffic spans multiple engine instances, process-local memoization alone is insufficient; the next performance tier is a shared cache layer that sits above the SQLite index and below route handlers.
19. the current local cut adds a Redis-backed shared search cache with TTL-bounded query payloads and generation-based invalidation on full index refresh.
20. the current local cut also adds process-local single-flight and best-effort shared build locking so hot misses do not fan out into duplicate SQLite/live work by default.
21. market search now emits cache-path and contention metrics into the existing observability counter/timing store.
22. liquidation truth is still app-bridge oriented today, even though the canonical architecture doc already names `raw_liquidation_events` as the durable raw family.
23. Binance `Query Users Force Orders` is a `USER_DATA` endpoint for a specific account, not public market-wide liquidation truth.
24. because `forceOrders` is user-scoped, it cannot be the canonical market-wide liquidation source for fact/search/AI planes.
25. the current local cut keeps Binance force-orders only as an optional user-private diagnostic lane, and the broader raw ingest path remains usable when that lane is disabled or unavailable.
26. liquidation events alone are still expensive for downstream consumers that only need regime/window truth, so a rolling aggregate read model is useful once a valid liquidation source exists.
27. the current local cut adds `market_liquidation_windows` and materializes 1h / 4h windows from stored user-private event truth during raw ingestion.
28. current workspace inspection shows no `BINANCE_*` key names in tracked local env files that `engine/env_bootstrap.py` loads, so credential resolution needs to be explicit and diagnosable rather than implicit.
29. the current local cut adds a small engine-owned Binance credential resolver with explicit env aliases and exposes the resolved liquidation credential state in raw-ingest results.

## Assumptions

1. the first useful canonical raw plane can use SQLite under `engine/state/` before any shared Postgres migration exists.
2. a first ingestion slice limited to Binance bars/perp is more valuable than waiting for every raw family to land at once.

## Open Questions

- whether the next raw family after this slice should be liquidation aggregates or on-chain/fundamental snapshots.

## Decisions

- canonical raw storage lives outside `engine/data_cache/cache/`; cache stays TTL/file-backed, canonical raw goes to SQLite under `engine/state/`.
- the first executable slice materializes `raw_market_bars`, `raw_orderflow_metrics`, and `raw_perp_metrics` only.
- ingestion code may refresh the legacy CSV cache as a side effect, but canonical raw rows are the durable truth for this lane.
- orderflow in this slice is restricted to taker buy/sell bar metrics derivable from exchange kline payloads; no synthetic pattern semantics belong here.
- searchability is a separate concern from raw retention: use live DEX/alpha discovery to resolve query → canonical symbol, then fetch raw only for the resolved target.
- high-throughput search should read a persisted local index first and use live provider fetch only as bounded fallback or refresh input.
- known token address maps should feed the same refresh path so common contract queries can also hit the local index.
- cutover should preserve the existing `/universe` response contract so current clients can opt into server-side search without a separate payload shape.
- search hot-path memoization must stay bounded and disposable; SQLite index remains the durable source of truth.
- query-driven universe search should enrich from cached universe data only, unless the caller explicitly opts into a forced refresh.
- the search read path should be `L1 process cache -> L2 shared Redis cache -> L3 SQLite index -> L4 live fallback`.
- index-wide refresh should invalidate shared cache by version/generation, not by destructive key scan.
- targeted live fallback warmups may populate shared cache for the queried key, but should not invalidate the whole shared cache namespace.
- miss-path work is coalesced with process-local single-flight first and best-effort shared Redis build locking second.
- cache telemetry records `l1/l2/l3/l4`, wait, and contention paths inside the existing observability snapshot.
- Binance `forceOrders` remains user-private and opt-in only; it is not the canonical market-wide liquidation fact source.
- optional user-private liquidation events are append/upsert truth, not timeframe-slice rewrite truth, so repeated recent-window refreshes may accumulate local diagnostic history over time.
- Binance force-orders auth failures must degrade the optional liquidation slice to `unavailable`, not fail the broader symbol raw ingestion path.
- liquidation read performance should come from engine-owned `market_liquidation_windows` materialized from stored events, not repeated ad hoc scans over raw event rows in app bridges.
- liquidation window materialization runs from stored events, so event fetch availability and window recompute are decoupled once local truth exists.
- Binance force-order auth should resolve from a small explicit env alias list and expose which alias, if any, was actually used.
- the raw-ingest CLI should report liquidation credential state explicitly so local-env issues are diagnosable without reading secret values.
- the default raw-ingest path should not touch user-private liquidation APIs unless explicitly opted in.
- commit/merge for this lane must run from a clean `W-0159` branch/worktree because the active local worktree currently also contains uncommitted `W-0160` contract changes.

## Next Steps

1. widen query resolution beyond Binance/DexScreener only when a concrete search gap appears.
2. choose a true market-wide liquidation source before promoting liquidation windows beyond optional user-private diagnostics.
3. decide whether market search metrics should also be surfaced in a dedicated route or stay inside observability snapshot only.

## Exit Criteria

- [x] canonical raw SQLite tables exist for market bars, orderflow metrics, and perp metrics.
- [x] optional user-private SQLite table exists for liquidation events.
- [x] rolling aggregate table exists for user-private liquidation windows.
- [x] ingestion helpers write provider-fetched rows with provenance/freshness metadata.
- [x] optional Binance user-private ingestion can persist recent force-order events without app-side bridge ownership.
- [x] optional liquidation ingress also refreshes 1h / 4h liquidation windows from stored event truth.
- [x] targeted engine tests pass.
- [x] at least one live symbol has been fetched into the canonical raw store in this workspace.
- [x] contract / coin query can be resolved into one or more canonical ingest targets without preloading the whole universe.
- [x] repeated market queries can be served from a persisted local index without live provider fan-out.
- [x] bounded scheduler/job hooks can refresh the local market search index without shell-only intervention.
- [x] `/universe?q=` can answer token/contract search from the local index while preserving `UniverseResponse`.
- [x] repeated market queries can be shared across engine instances through a bounded Redis cache without making Redis the source of truth.
- [x] hot misses are coalesced by default and emit cache-path telemetry for later tuning.

## Handoff Checklist

- active work item: `work/active/W-0159-canonical-raw-plane-ingestion.md`
- branch: `codex/w-0159-canonical-raw-plane-ingestion`
- verification:
  - `uv run --group dev python -m pytest tests/test_binance_credentials.py tests/test_liquidation_windows.py tests/test_fetch_binance_liquidations.py tests/test_market_search.py tests/test_raw_store.py tests/test_raw_ingest.py tests/test_fetch_binance_perp.py tests/test_data_cache.py tests/test_alpha_pipeline.py tests/test_jobs_routes.py tests/test_scheduler.py tests/test_universe_routes.py -q`
  - `uv run python -m data_cache.raw_ingest BTCUSDT --timeframe 1h --liquidation-lookback-hours 4 --db-path /tmp/wtd-binance-credential-check.sqlite --no-cache-refresh`
  - `npm --prefix app run check` (`0 errors`, existing warnings only)
- remaining blockers: Binance `forceOrders` is user-private and cannot serve as market-wide liquidation truth; a public or market-wide liquidation source is still needed before liquidation can graduate beyond optional diagnostics
