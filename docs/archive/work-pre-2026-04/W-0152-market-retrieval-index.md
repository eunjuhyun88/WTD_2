# W-0152 — Market Retrieval Index

## Goal

Add the first market-wide retrieval layer above the cached corpus so the engine can cheaply rank similar historical windows before replaying only the top candidates.

## Owner

engine

## Primary Change Type

Engine logic change

## Scope

- add a cheap window-signature retriever over cached symbols and recent history
- derive the reference query from a benchmark-pack reference case by default
- rerank only top-N retrieved windows with existing replay evaluation
- expose a CLI entrypoint for cached-corpus market search
- add focused tests for retrieval ranking and replay rerank behavior

## Non-Goals

- full-market persistent ANN/vector index
- image or user-selected chart ingestion
- onchain or wallet enrichment rerank
- raw 15m cache ingestion
- app UI changes

## Canonical Files

- `AGENTS.md`
- `work/active/CURRENT.md`
- `work/active/W-0152-market-retrieval-index.md`
- `docs/domains/multi-timeframe-autoresearch-search.md`
- `engine/research/pattern_search.py`
- `engine/research/live_monitor.py`
- `engine/research/cli.py`
- `engine/data_cache/loader.py`

## Facts

1. W-0151 already scans the cached corpus live, but only on the latest window per symbol.
2. The domain doc requires query-by-example search to become `cheap retrieval -> replay restore -> candidate surfacing`.
3. Cached corpus access is now shared across worktrees via W-0150.
4. The current replay evaluator is good enough to rerank a short candidate list, but too expensive to brute-force every window.
5. W-0152 now returns cached-corpus search candidates from `pattern-market-search`; a verified TRADOOR run surfaced `AIXBTUSDT`, `KOMAUSDT`, `BEATUSDT`, and `XANUSDT` as replay-reranked top windows under `breakout-range-soft`.

## Assumptions

1. The first retrieval slice can be limited to `1h` cached data even if benchmark packs include `15m`.
2. Recent-history retrieval over cached symbols is the correct bridge before a true market-wide persistent index.

## Open Questions

- Should the retrieval step require perp features, or degrade gracefully when only klines exist?

## Decisions

- Retrieval base timeframe for this slice is `1h`.
- Reference query defaults to the benchmark-pack reference case for the requested pattern.
- Replay remains the authority; retrieval only prunes the search space.
- The reference symbol is excluded from candidate output so query-by-example does not just echo the seed case.

## Next Steps

1. Replace per-run corpus scanning with a persistent retrieval index/store.
2. Extend retrieval beyond `1h` once raw lower-timeframe corpus exists.

## Exit Criteria

- engine can rank similar recent windows from the cached corpus without replaying all windows
- top retrieved windows are reranked with `evaluate_variant_on_case`
- CLI returns ranked market-search candidates for a pattern family

## Handoff Checklist

- active work item: `work/active/W-0152-market-retrieval-index.md`
- branch: `codex/w-0152-market-retrieval-index`
- verification:
  - `uv run pytest tests/test_market_retrieval.py -q`
  - `uv run pytest tests/test_market_retrieval.py tests/test_live_monitor.py tests/test_pattern_search_quality_slice.py -q`
  - `uv run python -m research.cli pattern-benchmark-search --slug tradoor-oi-reversal-v1 --warmup-bars 240`
  - `uv run python -m research.cli pattern-market-search --pattern-slug tradoor-oi-reversal-v1 --history-bars 168 --stride-bars 6 --top-k 8 --replay-top-k 4`
- remaining blockers: persistent market retrieval index, image/selection ingestion, onchain enrichment rerank, HTML benchmark packs, raw 15m corpus
