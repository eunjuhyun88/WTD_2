# W-0150 — Shared Cache Corpus for Pattern Search

## Goal

Benchmark replay, search, scanner, and query-by-example lanes should read the same canonical cached market data across worktrees. Eliminate worktree-local `DATA_MISSING` failures when shared offline cache already exists in the main repo.

## Owner

engine

## Primary Change Type

Engine logic change

## Scope

- add canonical shared cache root discovery to `engine/data_cache/loader.py`
- prefer shared cache for offline reads when running inside git worktrees
- keep tests and monkeypatched `CACHE_DIR` behavior stable
- add loader tests for shared-cache fallback and shared-cache write target
- verify benchmark search now reads real cached PTB/TRADOOR data from shared root

## Non-Goals

- market-wide retrieval/index implementation
- provider fetch expansion
- benchmark pack authoring beyond verifying shared-cache consumption
- app/UI changes

## Canonical Files

- `AGENTS.md`
- `work/active/CURRENT.md`
- `work/active/W-0150-shared-cache-corpus.md`
- `engine/data_cache/loader.py`
- `engine/tests/test_data_cache.py`
- `engine/research/pattern_search.py`

## Facts

1. Root repo cache exists at `/Users/ej/Projects/wtd-v2/engine/data_cache/cache` and contains PTBUSDT/TRADOORUSDT/KOMAUSDT/DYMUSDT 1h + perp CSVs.
2. New worktrees have their own `engine/data_cache/cache` directory and currently do not see root cached files.
3. W-0149 benchmark search now finishes without crashing, but missing cache degrades cases to `DATA_MISSING`.
4. `load_klines(..., offline=True)` currently checks only `CACHE_DIR` and raises `CacheMiss` immediately if that one path is absent.
5. Running TRADOOR benchmark search from this worktree should exercise automatic git-worktree shared-cache discovery because no `WTD_SHARED_CACHE_DIR` override is set.

## Assumptions

1. Shared-cache discovery should be automatic for git worktrees, with optional env override for future deployment wiring.
2. Monkeypatched `CACHE_DIR` in tests should continue to isolate test fixtures unless an explicit shared-cache override is set.

## Open Questions

- Should production eventually separate read cache and write cache contracts, or is one canonical cache root sufficient for Phase A?

## Decisions

- W-0150 is stacked on W-0149 because shared cache is the immediate blocker for real benchmark search.
- Loader will support `WTD_SHARED_CACHE_DIR` override plus automatic git-worktree discovery.
- Offline reads will search canonical shared roots before declaring `CacheMiss`.

## Next Steps

1. Start the next corpus/search slice now that worktrees can consume one canonical offline cache.
2. Add dedicated 15m benchmark cases instead of inferring from 1h-only pack windows.
3. Extend shared-cache policy to scheduler/worker deployment docs and env contracts.

## Exit Criteria

- worktree benchmark search reads root cache without manual file copying
- loader tests cover shared-cache fallback
- TRADOOR benchmark search produces real phase results instead of `DATA_MISSING` for cached symbols

## Handoff Checklist

- active work item: `work/active/W-0150-shared-cache-corpus.md`
- branch: `codex/w-0150-shared-cache-corpus`
- verification:
  - `uv run pytest tests/test_data_cache.py -q` → 12 passed
  - `uv run pytest tests/test_data_cache.py tests/test_pattern_search_quality_slice.py tests/test_patterns_replay.py -q` → 20 passed
  - `uv run python -m research.cli pattern-benchmark-search --slug tradoor-oi-reversal-v1 --warmup-bars 240` → completed with real cached data; winner `tradoor-oi-reversal-v1__breakout-range-soft`, reference score `0.540`, holdout score `0.673333`
- remaining blockers: market-wide corpus/index, image/selection ingestion, onchain enrichment, HTML benchmark packs
