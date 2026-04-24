# W-0147 — HTML Reference Pattern Engine Coverage

## Goal

HTML 레퍼런스에서 이식된 Alpha Terminal, Alpha Flow, Alpha Hunter, Signal Radar 계열 신호가 빠짐없이 `library.py` 패턴 slug 로 등록되고, runtime state machine 에서 실제 평가 가능한 block coverage 를 갖게 한다.

## Owner

engine

## Primary Change Type

Engine logic change

## Scope

- HTML 레퍼런스 기반 패턴의 `required` / `required_any` / `soft` block 이 `block_evaluator` runtime registry 에 연결되는지 검증
- 이미 구현된 building block 을 evaluator 에 등록
- funding / OI / volume directional block 이 feature-table 기반 replay 에서 false-only 로 죽지 않도록 입력 fallback 보강
- HTML 파일별 독립 신호/setupTag/S-layer 를 source-specific pattern slug 로 등록
- targeted engine tests 추가

## Non-Goals

- 신규 UI 구현
- benchmark pack/search run 대량 생성
- onchain/wallet provider 상시 수집 구현
- TRADOOR/PTB anchored breakout 재설계

## Canonical Files

- `AGENTS.md`
- `work/active/CURRENT.md`
- `work/active/W-0147-html-reference-pattern-engine.md`
- `docs/domains/pattern-engine-runtime.md`
- `docs/domains/multi-timeframe-autoresearch-search.md`
- `engine/scoring/block_evaluator.py`
- `engine/building_blocks/confirmations/negative_funding_bias.py`
- `engine/building_blocks/confirmations/oi_contraction_confirm.py`
- `engine/building_blocks/confirmations/volume_surge_bear.py`
- `engine/patterns/library.py`
- `engine/tests/test_html_reference_pattern_engine.py`

## Facts

1. `volatility-squeeze-breakout-v1`, `alpha-confluence-v1`, `radar-golden-entry-v1`, `institutional-distribution-v1`, `oi-presurge-long-v1`, `alpha-presurge-v1` are registered in `engine/patterns/library.py`.
2. Their referenced block implementations already exist for the main HTML-derived gaps, but `block_evaluator._BLOCKS` does not register `atr_ultra_low`, `liq_zone_squeeze_setup`, `volume_surge_bull`, `volume_surge_bear`, `negative_funding_bias`, or `oi_contraction_confirm`.
3. `negative_funding_bias` and `oi_contraction_confirm` currently read only `ctx.klines`, while replay/evaluation paths commonly carry funding/OI in `ctx.features`.
4. `volume_surge_bear` requires `taker_sell_base_volume`, but common kline frames may only provide `taker_buy_base_volume`.
5. After this slice, 42 HTML-reference pattern slugs are registered and have zero missing runtime block references in `block_evaluator._BLOCKS`.

## Assumptions

1. First slice should unblock executable state-machine coverage before benchmark promotion.
2. Missing feature columns should make a block return false, not raise and silently hide a wiring defect.

## Open Questions

- Which HTML-derived patterns should receive canonical benchmark packs first after runtime coverage is fixed?

## Decisions

- This work uses a new branch/worktree because the root worktree is already occupied by mixed lane cleanup and fact-plane changes.
- `library.py` remains the promoted pattern registry; this slice only ensures referenced blocks are executable.
- Benchmark/search validation is the next research slice after engine block coverage is proven.
- Feature-table columns are preferred for funding/OI confirmations because replay paths carry canonical perp-derived values in `ctx.features`.
- Source-specific HTML signals are registered as `html_ref` tagged runtime patterns even when their first version is a proxy over existing blocks; later benchmark/eval work must promote or reject them.

## Next Steps

1. Move the verified W-0147 engine patch through review/commit.
2. Start a separate research/eval work item for HTML-derived benchmark packs and search runs.
3. Promote each HTML-derived pack only after at least one positive and one near-miss/failure case are captured.

## Exit Criteria

- targeted tests prove all 42 HTML-reference pattern slugs have zero missing runtime block references.
- direct block tests prove funding/OI/sell-volume fallbacks work with feature-table inputs.
- touched engine tests pass in the isolated worktree.

## Handoff Checklist

- active work item: `work/active/W-0147-html-reference-pattern-engine.md`
- branch: `codex/w-0147-html-pattern-engine`
- verification:
  - `uv run pytest tests/test_html_reference_pattern_engine.py -q` → 7 passed
  - `uv run pytest tests/test_html_reference_pattern_engine.py tests/test_alpha_pipeline.py tests/test_institutional_distribution.py tests/test_patterns_replay.py tests/test_w0114_dalkkak.py tests/test_confirmations_autoresearch_blocks.py tests/test_var_building_blocks.py tests/test_absorption_and_alt_btc_blocks.py -q` → 145 passed
  - manual coverage check → 42 HTML-reference slugs, missing block count 0
- remaining blockers: benchmark packs/search runs and market-wide retrieval promotion remain follow-up work.
