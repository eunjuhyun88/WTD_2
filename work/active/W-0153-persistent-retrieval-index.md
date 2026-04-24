# W-0153 — Persistent Retrieval Index

## Goal

Persist cached-corpus window signatures so market search can reuse a prebuilt retrieval index instead of rescanning the corpus on every query.

## Owner

engine

## Primary Change Type

Engine logic change

## Scope

- add a persisted market retrieval index artifact store under the pattern-search control plane
- build cached-window signature indices for fixed retrieval configs
- make `pattern-market-search` reuse the latest matching index before falling back to live corpus scanning
- expose a CLI command to build and inspect the retrieval index
- add focused tests for index build/load and index-backed query execution

## Non-Goals

- ANN/vector database
- raw 15m corpus ingestion
- image/query capture ingestion
- onchain or wallet rerank
- app UI changes

## Canonical Files

- `AGENTS.md`
- `work/active/CURRENT.md`
- `work/active/W-0153-persistent-retrieval-index.md`
- `docs/domains/multi-timeframe-autoresearch-search.md`
- `engine/research/market_retrieval.py`
- `engine/research/cli.py`
- `engine/research/pattern_search.py`
- `engine/tests/test_market_retrieval.py`

## Facts

1. W-0152 added cheap retrieval plus replay rerank, but still scans every cached symbol window on each run.
2. The retrieval signature is generic enough to persist independently of a specific pattern family.
3. The cached corpus is already shared across worktrees, so index build can become a reusable control-plane artifact.
4. Current market search only needs `1h` support to be useful because lower-timeframe raw cache is not available yet.
5. W-0153 now persists cached-window signatures and reuses them in `pattern-market-search`; a verified TRADOOR run switched from `source=live_scan` to `source=index` using index `52dbf4e1-4ece-4a02-a10a-f8ec62755c89`.

## Assumptions

1. A fixed-config index keyed by `timeframe + history_bars + stride_bars + window_bars` is the right first persistence boundary.
2. Query-time reference signature computation should remain live; only candidate window enumeration should be persisted.

## Open Questions

- Should future index reuse require exact universe-match, or allow subset/superset reuse with metadata only?

## Decisions

- The first persistent index is generic and pattern-agnostic.
- `pattern-market-search` should prefer the newest matching index artifact and fall back to live scan if none exists.
- Index artifacts live beside benchmark/search artifacts in the existing research control-plane directory.

## Next Steps

1. Move from fixed-config JSON index artifacts to a shared, incrementally refreshable retrieval store.
2. Extend the retrieval corpus beyond `1h` once raw lower-timeframe cache exists.
3. Add index freshness policy so stale corpora are rebuilt automatically before live product use.

## Exit Criteria

- engine can build a persisted cached-window retrieval index for a fixed config
- market search reuses the persisted index when available
- CLI supports index build and index-backed market search

## Handoff Checklist

- active work item: `work/active/W-0153-persistent-retrieval-index.md`
- branch: `codex/w-0153-persistent-retrieval-index`
- verification:
  - `uv run python -m pytest tests/test_market_retrieval.py -q`
  - `uv run python -m pytest tests/test_market_retrieval.py tests/test_live_monitor.py tests/test_pattern_search_quality_slice.py -q`
  - `uv run python -m research.cli pattern-market-index-build --history-bars 168 --stride-bars 6 --window-bars 61`
  - `uv run python -m research.cli pattern-market-search --pattern-slug tradoor-oi-reversal-v1 --history-bars 168 --stride-bars 6 --top-k 8 --replay-top-k 4`
- remaining blockers: lower-timeframe raw corpus, shared/incremental retrieval store, image/selection ingestion, onchain enrichment rerank, benchmark pack depth for HTML families
