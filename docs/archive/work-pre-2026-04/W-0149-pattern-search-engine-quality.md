# W-0149 — Pattern Search Engine Quality Slice

## Goal

TRADOOR/PTB형 query-by-example 검색의 첫 상용 품질 병목을 닫는다: post-dump/accumulation 기준 breakout 판정, pattern-scoped block evaluation, 15m benchmark axis를 실제 replay/search 경로에 연결한다.

## Owner

engine

## Primary Change Type

Engine logic change

## Scope

- TRADOOR/PTB `BREAKOUT`을 rolling-low 기반이 아니라 post-accumulation range 기반 trigger로 전환
- replay/search가 패턴에 필요한 block만 계산하도록 `evaluate_block_masks`에 scoped evaluation 추가
- TRADOOR/PTB default benchmark candidate timeframes에 `15m` 포함
- benchmark search seed variants에 breakout 축 추가
- targeted engine tests 추가

## Non-Goals

- app UI 구현
- onchain/wallet provider 상시 수집 구현
- HTML 42개 패턴 전체 benchmark pack 생성
- market-wide corpus/index 전체 구현

## Canonical Files

- `AGENTS.md`
- `work/active/CURRENT.md`
- `work/active/W-0149-pattern-search-engine-quality.md`
- `docs/domains/pattern-engine-runtime.md`
- `docs/domains/multi-timeframe-autoresearch-search.md`
- `engine/patterns/library.py`
- `engine/patterns/replay.py`
- `engine/scoring/block_evaluator.py`
- `engine/research/pattern_search.py`
- `engine/building_blocks/triggers/post_accumulation_range_breakout.py`
- `engine/tests/test_pattern_search_quality_slice.py`

## Facts

1. W-0147 registered 42 HTML-reference slugs with zero missing runtime block references, but benchmark/search validation remains separate.
2. TRADOOR/PTB currently requires `breakout_from_pullback_range` and `oi_expansion_confirm` for `BREAKOUT`.
3. `breakout_from_pullback_range` resets on recent rolling lows, not on the state machine's `REAL_DUMP -> ACCUMULATION` anchor.
4. `evaluate_block_masks` currently computes all runtime blocks for replay/search, including blocks unrelated to the current pattern.
5. Default benchmark packs still force `candidate_timeframes=["1h", "4h"]`.
6. Benchmark replay/search should not abort the whole run when one case is missing offline cache.

## Assumptions

1. The first quality slice should preserve existing rule-first state machine behavior and add a better block, not replace replay architecture.
2. 15m support should be enabled for TRADOOR/PTB benchmark search before broader market-wide retrieval.

## Open Questions

- Should post-accumulation breakout eventually consume explicit phase transition timestamps instead of inferring the range from feature/block masks?

## Decisions

- W-0149 is stacked on W-0147 commit `781da828` to keep HTML registration available while isolating search-quality work.
- The new breakout trigger will be a separate block so old `breakout_from_pullback_range` remains available for other patterns.
- Pattern-scoped evaluation will be optional and backwards-compatible; callers without requested blocks still receive all masks.
- Missing offline cache is downgraded to per-case `DATA_MISSING`, not a process-fatal benchmark failure.

## Next Steps

1. Start a separate data/corpus slice so benchmark search can read shared cached windows instead of degrading to `DATA_MISSING`.
2. Add real 15m PTB/TRADOOR benchmark cases once cache ownership is settled.
3. Extend the anchored-breakout/scoped-eval pattern to the next promoted families.

## Exit Criteria

- TRADOOR/PTB `BREAKOUT` uses a post-accumulation range trigger.
- Replay computes only referenced blocks when given a pattern.
- Default TRADOOR/PTB benchmark search considers `15m`, `1h`, and `4h`.
- Targeted tests pass from `engine/`.

## Handoff Checklist

- active work item: `work/active/W-0149-pattern-search-engine-quality.md`
- branch: `codex/w-0149-pattern-search-engine`
- verification:
  - `uv run pytest tests/test_pattern_search_quality_slice.py -q` → 6 passed
  - `uv run pytest tests/test_pattern_search_quality_slice.py tests/test_patterns_replay.py tests/test_html_reference_pattern_engine.py tests/test_alpha_pipeline.py tests/test_institutional_distribution.py -q` → 70 passed
  - `uv run pytest tests/test_pattern_search_quality_slice.py tests/test_html_reference_pattern_engine.py tests/test_alpha_pipeline.py tests/test_institutional_distribution.py tests/test_patterns_replay.py tests/test_w0114_dalkkak.py tests/test_confirmations_autoresearch_blocks.py tests/test_var_building_blocks.py tests/test_absorption_and_alt_btc_blocks.py -q` → 150 passed
  - `uv run python -m research.cli pattern-benchmark-search --slug tradoor-oi-reversal-v1 --warmup-bars 240` → completed; missing offline cache surfaced as `DATA_MISSING` instead of crashing
- remaining blockers: shared benchmark cache/corpus, image/selection ingestion, onchain enrichment, HTML benchmark packs
