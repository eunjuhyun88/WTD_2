# W-0143 — Query-by-Example Similar Pattern Search

## Goal

갑자기 급등한 코인 하나를 seed 로 받아, 가격/OI/펀딩/거래량/멀티 타임프레임/온체인/지갑/이벤트 맥락까지 읽고 구조적으로 유사한 사례를 재검색하는 canonical research/search architecture 를 정의한다.

## Owner

research

## Primary Change Type

Research or eval change

## Scope

- founder seed capture 를 query-by-example search input 으로 승격하는 canonical object 정의
- 시장 데이터, 파생 데이터, 온체인/지갑, 이벤트 컨텍스트를 합치는 retrieval/ranking pipeline 정의
- 성능/비용 최적화를 전제로 coarse-to-fine search, cache, enrichment gating 전략 정의
- benchmark pack / verdict / promotion 까지 닫히는 execution loop 정의

## Non-Goals

- 이번 슬라이스에서 full implementation 완료
- 신규 UI 시각 디자인
- GPU 기반 ML training track 구현

## Canonical Files

- `AGENTS.md`
- `work/active/CURRENT.md`
- `work/active/W-0143-query-by-example-pattern-search.md`
- `docs/domains/multi-timeframe-autoresearch-search.md`
- `docs/domains/autoresearch-ml.md`
- `docs/domains/query-by-example-pattern-search.md`
- `engine/research/pattern_search.py`
- `engine/patterns/library.py`
- `engine/scoring/block_evaluator.py`

## Facts

1. benchmark search and replay can now fan out into lower timeframes such as `15m`, but the default TRADOOR benchmark pack still persists `candidate_timeframes=["1h", "4h"]`, so the most important founder-described entry structure is still skipped unless the pack is overridden.
2. replay already requests only pattern-relevant blocks, but broader scan/eval paths still leave requested-block scoping incomplete.
3. current seed variants still mostly mutate `ARCH_ZONE`, `REAL_DUMP`, `ACCUMULATION`; `BREAKOUT` search axes remain underrepresented even though current PTB benchmark winners still stop at `ACCUMULATION`.
4. direct PTBUSDT replay over the recent market window still shows a live-search failure mode separate from the benchmark pack: `ARCH_ZONE` times out back to `FAKE_DUMP` before the second dump lands, so recent-window retrieval can miss `REAL_DUMP` entirely.
5. W-0142 now provides `manual_hypothesis.research_context`, so founder notes/images/phase annotations can serve as canonical seed evidence.
6. engine now has a Phase 1 `seed_search` slice: source capture → benchmark-pack draft → optional benchmark search → persisted candidate reports.
7. the current seed-search implementation uses sibling `manual_hypothesis` captures in the same `pattern_family` as holdout cases, which makes founder seeds immediately reusable for replay search.
8. terminal already has a `ChartViewportSnapshot` contract and selected-range capture builder, so chart segment selection can be promoted to seed-search input without inventing a new chart schema.
9. engine `seed_search` now accepts inline seed payloads, so a chart-selected range plus image refs can start a search even without a saved capture.
10. app now has `seedSearch` contracts/routes/server wrappers, so terminal-side range/image seeds can call the engine path without using raw engine payloads.
11. benchmark search now expands variants into lower timeframes such as `15m`, so seed packs that request `15m` no longer get silently collapsed back to `1h`.
12. replay now requests only pattern-relevant blocks from the block evaluator, reducing unnecessary external-data block work during seed-search/benchmark replay.
13. engine now has a pattern catalog layer that derives family, maturity, and coverage metadata from local `benchmark_packs` and `search_runs`, and seed-search can consume those defaults.
14. engine `/patterns/catalog` now merges that catalog with live candidate counts and ledger stats, and app terminal read paths consume it via `/api/patterns/catalog`.
15. terminal can now surface registered pattern slugs as catalog rows, terminal scan/server scan contracts accept optional `patternSlug`, and left-rail catalog rows / active Pattern Engine chips trigger pattern-aware scans that attach engine pattern context (`visible` / `raw` / `none`) into the result summary/highlights.
16. seed-search now runs a first-pass recent-window market retrieval across the cached universe and persists `market_candidate` reports before benchmark replay, but this slice intentionally stays on cache-safe timeframes (`1h` / `4h`) instead of sub-hour replay.
17. pattern-aware scan output must be fed into the terminal AI agent context pack, not only rendered as transient assistant messages.
18. engine now has a `pattern_family` registry plus `similar` verdict auto-promotion, so seed creation and candidate acceptance can regenerate family benchmark packs and refresh a winner variant automatically.
19. seed-search now performs a first broader historical retrieval pass over cached `1h/4h` history: cheap OHLCV + perp window signatures shortlist candidates, and only the shortlist is replayed into persisted `historical_candidate` reports.
20. terminal SaveStrip now wires real seed-search execution: reviewed ranges can be sent as inline seed evidence, market candidates/verdicts are shown in-surface, and completed searches are persisted as `seed_search` pins for restore.
21. broader retrieval is still bounded to cached universe/history and cache-safe timeframes; sub-hour history, richer enrichment lanes, and compare/pin workspace persistence for scan results remain missing.

## Assumptions

1. rule-first phase detection remains runtime authority; ML/reranking augments search and prioritization, not phase truth.
2. onchain and wallet enrichment should be lazy and gated, not part of every first-pass market scan.
3. the first production slice should win on market/derivatives similarity before adding expensive cross-source enrichment.

## Open Questions

- which onchain providers become canonical for wallet/entity labeling and token flow features?
- whether event/news context should be an explicit scoring lane in v1 or an explanation-only lane until coverage quality improves?

## Decisions

- this lane is a new active work item rather than an extension of W-0142 because the problem boundary moves from contract shape to full research/search architecture.
- canonical search will use a coarse-to-fine pipeline: cheap market-wide retrieval first, expensive enrichment only for top candidates.
- similarity is defined by event/phase structure plus supporting evidence, not by raw candle image resemblance.
- branch reuse: architecture docs remain on the current execution branch unless implementation scope later requires an isolated PR.
- Phase 1 implementation starts with engine-owned seed-search persistence and benchmark-pack generation rather than UI-first work.
- seed-search bootstrap uses the existing benchmark-pack search runtime before introducing a new market-wide retrieval engine.
- seed-search must accept both `source_capture_id` and inline seed payloads built from chart-selected segments and uploaded image references.
- pattern grouping must become executable metadata: each registered slug needs a canonical family plus artifact-backed maturity (`core` / `support` / `library_only`) derived from local benchmark-pack and search-run coverage.
- terminal scan/read paths should consume an engine-owned pattern catalog instead of inferring pattern buckets from alert regex or candidate side-effects.
- `/patterns/library` should embed catalog metadata inline and `/patterns/catalog` should expose the same catalog directly for app/research callers.
- the first market-wide retrieval slice should use cached recent windows and cache-safe timeframes before expanding into broader historical or sub-hour retrieval.
- terminal AI turns must receive current symbol/timeframe, active verdict/evidence, latest pattern-aware scan, and a bounded pattern catalog summary as a structured context pack.
- W-0143 stays in the search plane: broader provider replacement and reference metrics belong to W-0122 fact-plane work, while compare/pin UX belongs to surface work items.
- `library.py` should remain the promoted baseline set; family registration and evidence accumulation should live in a separate engine-owned family registry.
- broader historical retrieval should stay coarse-to-fine: cheap cached-window signatures first, replay only for top windows.
- the first broader historical retrieval slice stays inside `seed_search` and reuses cached klines/perp plus existing replay, instead of introducing a separate index service prematurely.
- immediate engine repair for the TRADOOR family is threefold: add an accumulation-anchored breakout trigger, make `BREAKOUT` a first-class search axis, and stop default packs from excluding `15m`.
- PTBUSDT revalidation must use two lenses, not one: benchmark-pack replay for family promotion and recent-window replay for live retrieval reliability.

## Next Steps

1. add an accumulation-anchored breakout block and wire TRADOOR `BREAKOUT` plus seed variants to use it.
2. update the default TRADOOR benchmark pack to search `15m` alongside `1h`/`4h`, then re-run targeted benchmark tests.
3. extend requested-block scoping from replay into broader scan/evaluation paths where safe, then return to compare/pin persistence and wider retrieval coverage.

## Exit Criteria

- canonical architecture doc exists and explains seed ingestion, feature retrieval, search/ranking, evaluation, and cost/performance controls.
- `CURRENT.md` lists W-0143 as an active work item with immediate execution priority.
- next implementation slices are explicit enough to start coding without relying on chat history.

## Handoff Checklist

- active work item: `work/active/W-0143-query-by-example-pattern-search.md`
- branch: `codex/w-0139-terminal-core-loop-capture`
- verification:
  - `uv run pytest tests/test_pattern_catalog.py -q`
  - `uv run pytest tests/test_engine_runtime_roles.py -q`
  - `uv run pytest tests/test_seed_search_routes.py -q`
  - `uv run pytest tests/test_seed_search_routes.py tests/test_pattern_family_routes.py tests/test_pattern_catalog.py -q`
  - `uv run pytest tests/test_patterns_replay.py -q`
  - `uv run pytest tests/test_pattern_search.py -q -k "timeframe or expand_results_across_candidate_timeframes"`
  - `npm run test -- src/lib/contracts/seedSearch.test.ts`
  - `npm run check`
- remaining blockers: compare/pin workspace persistence for pattern scans, wider scan-path block scoping, richer retrieval coverage beyond cached `1h/4h`, and TRADOOR-family breakout/live-window reliability remain
