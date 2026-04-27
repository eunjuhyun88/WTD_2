# W-0154 — Capture Benchmark Bridge

## Goal

Turn one `manual_hypothesis` capture with `research_context` into a persisted benchmark-pack draft, then optionally launch benchmark-search immediately, so founder notes, HTML/Telegram breakdowns, and chart-selected seeds can enter the replay/search loop without hand-writing JSON.

## Owner

engine

## Primary Change Type

Engine logic change

## Scope

- build a reusable engine helper that converts a source capture plus sibling captures into a `ReplayBenchmarkPack`
- derive phase path and candidate timeframes from `research_context` when present, with deterministic fallback to library phases
- add an engine route to draft/save a benchmark pack from a capture
- add a research CLI entrypoint for the same bridge
- add a second engine/CLI path that drafts the pack and immediately runs benchmark-search against it
- add focused tests for pack generation and route behavior

## Non-Goals

- app UI wiring
- automatic negative/near-miss market mining
- image OCR or chart segmentation
- onchain or wallet enrichment

## Canonical Files

- `AGENTS.md`
- `work/active/CURRENT.md`
- `work/active/W-0154-capture-benchmark-bridge.md`
- `engine/api/routes/patterns.py`
- `engine/capture/store.py`
- `engine/capture/types.py`
- `engine/research/pattern_search.py`
- `engine/research/cli.py`
- `engine/tests/test_pattern_candidate_routes.py`

## Facts

1. W-0142 added `research_context` to `manual_hypothesis` captures, including `pattern_family`, `phase_annotations`, and source text/image metadata.
2. Replay benchmark search already accepts a persisted `ReplayBenchmarkPack`, but pack creation is still manual JSON authoring.
3. Current market retrieval and replay infrastructure is useful only after a benchmark pack exists.
4. The current branch already has shared cache, market retrieval, and persistent retrieval index slices verified, so seed ingestion is now the highest leverage missing bridge.
5. Stopping at pack creation still leaves a manual control-plane gap because founders must trigger search in a second step.

## Assumptions

1. The first bridge can stay positive-only: one reference plus sibling holdouts from the same family.
2. If `phase_annotations` lack explicit timestamps, a deterministic centered fallback window around `captured_at_ms` is acceptable for the first draft.

## Open Questions

- Should future pack drafting pull sibling captures only from the same `pattern_family`, or also allow same `pattern_slug` fallback when family metadata is absent?

## Decisions

- `research_context.phase_annotations` order is the authority for expected phase path when present.
- Candidate timeframes default from the capture evidence itself rather than a global pattern default.
- The route persists the pack immediately so founder-generated seeds become reusable control-plane artifacts.
- The same bridge should expose an opt-in immediate benchmark-search path so captured seeds can produce a reusable winner artifact in one command.

## Next Steps

1. Implement the capture-to-pack builder and persistence path.
2. Expose route + CLI for both draft-only and draft+search flows, then verify with focused tests.
3. Use the search-capable bridge as the next handoff point for automatic promotion/search orchestration.

## Exit Criteria

- engine can persist a replay benchmark-pack draft from one capture id
- sibling captures in the same family become holdout cases automatically
- route and CLI both expose the same pack-building behavior
- engine can also run benchmark-search directly from the drafted pack without a second manual step

## Handoff Checklist

- active work item: `work/active/W-0154-capture-benchmark-bridge.md`
- branch: `codex/w-0154-capture-benchmark-bridge`
- verification:
  - `uv run python -m pytest tests/test_capture_benchmark.py tests/test_capture_routes.py tests/test_pattern_candidate_routes.py -q`
  - `uv run python -m research.cli pattern-benchmark-pack-from-capture --capture-id <id>`
  - `uv run python -m research.cli pattern-benchmark-search-from-capture --capture-id <id> --pattern-slug <slug>`
- remaining blockers: negative/near-miss mining, app UI wiring, image/selection ingestion, and automatic market search trigger remain separate slices
