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
- Binance kline / perp fetch 결과를 normalized raw rows 로 쓰는 ingestion path 추가
- contract / coin query 를 canonical symbol 로 resolve 하는 search helper 추가
- resolve 결과를 기존 raw ingress 로 연결하는 on-demand ingestion helper 추가
- high-QPS search를 위한 persisted local market search index 추가
- repeated query hot path를 위한 process-local search result memoization 추가
- bounded scheduler/job 기반 index refresh 추가
- actual user-facing universe read route를 local search index path로 cutover
- search query path에서 cold full-universe build를 피하는 bounded enrichment path 추가
- targeted engine tests 추가

## Non-Goals

- `feature_windows` materialization
- search signature persistence
- liquidation / onchain / fundamental / macro raw planes
- scheduler full cutover
- broad app/UI redesign

## Canonical Files

- `AGENTS.md`
- `work/active/CURRENT.md`
- `work/active/W-0159-canonical-raw-plane-ingestion.md`
- `work/active/W-0148-cto-data-engine-reset.md`
- `docs/domains/terminal-ai-scan-architecture.md`
- `engine/data_cache/fetch_binance.py`
- `engine/data_cache/fetch_binance_perp.py`
- `engine/data_cache/fetch_dexscreener.py`
- `engine/data_cache/loader.py`
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

## Next Steps

1. add scheduler/job-backed `market_search_index` refresh on a bounded cadence.
2. cut the user-facing universe search read path over to the local index while preserving the existing response contract.
3. widen query resolution beyond Binance/DexScreener only when a concrete search gap appears.

## Exit Criteria

- [x] canonical raw SQLite tables exist for market bars, orderflow metrics, and perp metrics.
- [x] ingestion helpers write provider-fetched rows with provenance/freshness metadata.
- [x] targeted engine tests pass.
- [x] at least one live symbol has been fetched into the canonical raw store in this workspace.
- [x] contract / coin query can be resolved into one or more canonical ingest targets without preloading the whole universe.
- [x] repeated market queries can be served from a persisted local index without live provider fan-out.
- [x] bounded scheduler/job hooks can refresh the local market search index without shell-only intervention.
- [x] `/universe?q=` can answer token/contract search from the local index while preserving `UniverseResponse`.

## Handoff Checklist

- active work item: `work/active/W-0159-canonical-raw-plane-ingestion.md`
- branch: `codex/w-0159-canonical-raw-plane-ingestion`
- verification:
  - `uv run --group dev python -m pytest tests/test_market_search.py tests/test_raw_store.py tests/test_raw_ingest.py tests/test_fetch_binance_perp.py tests/test_data_cache.py tests/test_alpha_pipeline.py tests/test_jobs_routes.py tests/test_scheduler.py tests/test_universe_routes.py -q`
  - `npm --prefix app run check` (`0 errors`, existing warnings only)
- remaining blockers: feature window materialization, wider provider families, app contract cutover beyond `/universe`, and shared DB migration remain out of scope
