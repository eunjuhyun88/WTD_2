# W-0151 — Cached Universe Live Scan

## Goal

Move promoted pattern monitoring from a hand-maintained symbol list to a cached-universe default. The engine should scan every symbol that already has canonical cached market data, not just a static shortlist.

## Owner

engine

## Primary Change Type

Engine logic change

## Scope

- add cached symbol inventory helper to `engine/data_cache/loader.py`
- make `research.live_monitor` default to cached universe when no explicit universe is supplied
- expose a CLI entrypoint for live promoted-pattern scanning
- resolve the default live-monitor variant from the latest benchmark-search winner artifact when available
- add focused tests for cached symbol discovery and monitor default behavior

## Non-Goals

- market-wide historical retrieval/index
- new provider ingestion
- app UI changes
- non-cached symbols network fetch

## Canonical Files

- `AGENTS.md`
- `work/active/CURRENT.md`
- `work/active/W-0151-cached-universe-live-scan.md`
- `engine/data_cache/loader.py`
- `engine/research/live_monitor.py`
- `engine/research/cli.py`
- `engine/tests/test_data_cache.py`
- `engine/tests/test_live_monitor.py`

## Facts

1. W-0150 made canonical shared cache readable across worktrees.
2. `research.live_monitor` previously defaulted to a static `DEFAULT_UNIVERSE` list.
3. Root shared cache already contains real symbols such as PTBUSDT, TRADOORUSDT, KOMAUSDT, DYMUSDT.
4. `pattern-live-monitor` now scans the cached corpus directly; a verification run scanned 84 cached symbols and surfaced `KOMAUSDT` as an `ACCUMULATION` candidate.
5. The live monitor previously defaulted TRADOOR to `__canonical` unless the winner variant was passed explicitly.
6. W-0151 generated benchmark-search artifact `6f3e9196-869b-4270-bb67-340bb56f8183` with winner `tradoor-oi-reversal-v1__breakout-range-soft`.

## Assumptions

1. Cached-universe coverage is the correct default before adding full market retrieval.
2. Monitoring should remain offline-only and skip symbols without cached 1h data.

## Open Questions

- Should cached-universe scan require perp cache by default for perp-dependent promoted patterns?

## Decisions

- Cached universe will be discovered from canonical 1h cache filenames.
- Explicit `universe` arguments still override the default cached-universe behavior.
- Empty cached inventory falls back to `DEFAULT_UNIVERSE` so the monitor stays usable in fresh environments.
- Default live scans should prefer the latest benchmark-search winner artifact for the requested pattern when one exists.

## Next Steps

1. Use cached-universe live monitor as the bridge until market-wide retrieval/index lands.
2. Replace artifact-directory winner lookup with a durable promoted-variant registry once market-wide retrieval/index exists.

## Exit Criteria

- live monitor uses cached universe by default
- CLI can run promoted-pattern live scan without hardcoded symbol maintenance
- tests cover inventory helper and live monitor default selection

## Handoff Checklist

- active work item: `work/active/W-0151-cached-universe-live-scan.md`
- branch: `codex/w-0151-cached-universe-live-scan`
- verification:
  - `uv run pytest tests/test_data_cache.py tests/test_live_monitor.py -q`
  - `uv run pytest tests/test_live_monitor.py tests/test_data_cache.py tests/test_pattern_search_quality_slice.py -q`
  - `uv run python -m research.cli pattern-benchmark-search --slug tradoor-oi-reversal-v1 --warmup-bars 240`
  - `uv run python -m research.cli pattern-live-monitor --pattern-slug tradoor-oi-reversal-v1 --staleness-hours 400`
  - `uv run python - <<'PY' ... resolve_live_variant_slug('tradoor-oi-reversal-v1') ... PY`
- remaining blockers: market-wide historical retrieval/index, image/selection ingestion, onchain enrichment, HTML benchmark packs
