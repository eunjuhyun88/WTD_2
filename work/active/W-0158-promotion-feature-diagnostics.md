# W-0158 — Promotion Feature Diagnostics

## Goal

`W-0156` 에서 열린 canonical feature plane 과 `W-0157` 의 feature ranking 소비를 promotion/search diagnostics 에도 연결해서, benchmark winner 의 promotion 판단이 기존 replay/stat metrics 외에 `oi/funding/volume/structure` feature truth를 함께 설명하도록 만든다.

## Owner

engine

## Primary Change Type

Engine logic change

## Scope

- promotion diagnostics 에 canonical feature snapshot/score 요약 추가
- benchmark winner / report summary 가 같은 canonical feature truth 를 재사용하도록 연결
- targeted engine tests 갱신

## Non-Goals

- promotion gate threshold 재설계
- app UI wiring
- shared DB or registry redesign
- new raw metric families beyond the `W-0156` subset

## Canonical Files

- `AGENTS.md`
- `work/active/CURRENT.md`
- `work/active/W-0156-canonical-feature-plane-foundation.md`
- `work/active/W-0157-similar-live-feature-ranking.md`
- `work/active/W-0158-promotion-feature-diagnostics.md`
- `docs/domains/pattern-engine-runtime.md`
- `engine/features/canonical_pattern.py`
- `engine/research/live_monitor.py`
- `engine/scanner/feature_calc.py`
- `engine/research/pattern_search.py`
- `engine/research/reporting.py`
- `engine/tests/test_feature_calc.py`
- `engine/tests/test_pattern_search.py`
- `engine/tests/test_refinement_reporting.py`

## Facts

1. `W-0156` added a narrow canonical feature subset and threads `canonical_feature_snapshot` through `VariantCaseResult`.
2. `W-0157` proved the same feature truth can be consumed safely in `similar-live` reranking without replacing replay/state-machine gates.
3. benchmark search already emits `promotion_report` and run-summary diagnostics in `engine/research/pattern_search.py`, so promotion/report consumption is a bounded engine-only follow-up.
4. current local cut moves canonical feature subset ownership into `engine/features/canonical_pattern.py`, then keeps `scanner.feature_calc` as the row materializer plus compatibility bridge for downstream consumers.
5. current local cut adds `canonical_feature_score`, reference/holdout breakdown, scored-case count, and aggregate canonical feature summary to `PromotionReport`, benchmark handoff payloads, and refinement report output.

## Assumptions

1. the first useful slice can reuse the existing `score_canonical_feature_snapshot()` heuristic rather than inventing a separate promotion-only feature score.
2. winner-level feature diagnostics are enough for the first cut; full per-case report expansion can remain a later slice if needed.

## Open Questions

- whether later slices should expose canonical feature diagnostics for multiple top candidates instead of winner-only promotion summaries.

## Decisions

- open a new execution lane because `W-0157` feature consumption in live ranking and promotion/report diagnostics are separate merge units.
- branch from `codex/w-0157-similar-live-feature-ranking` so the promotion diagnostic consumer reuses the already-validated feature ranking baseline instead of reimplementing the scoring path on `main`.
- keep the first promotion consumer narrow: reuse canonical feature score and snapshot summaries in diagnostics, not in gate policy thresholds.

## Next Steps

1. decide whether promotion diagnostics should stay winner-only or expand to multiple top candidates in future report surfaces.
2. widen canonical feature diagnostics only when a later lane needs per-case or per-family breakdown beyond the current summary payload.

## Exit Criteria

- promotion diagnostics expose canonical feature truth for the promoted/winning candidate.
- the promotion report reuses the same feature score family already proven in `similar-live`.
- targeted engine tests pass on the new branch.

## Handoff Checklist

- active work item: `work/active/W-0158-promotion-feature-diagnostics.md`
- branch: `codex/w-0158-promotion-feature-diagnostics`
- baseline branch: `codex/w-0157-similar-live-feature-ranking`
- baseline commit: `a3a8f2c0`
- verification: `uv run --group dev python -m pytest tests/test_feature_calc.py tests/test_pattern_search.py tests/test_live_monitor.py tests/test_refinement_reporting.py -q`
- remaining blockers: gate-threshold redesign, wider feature families, and operator workflow remain future slices
