# W-0156 — Canonical Feature Plane Foundation

## Goal

TRADOOR/PTB commercialization stack 위에 재사용 가능한 canonical feature plane 을 추가해서, pattern replay / similarity / promotion 이 더 이상 ad hoc block-level feature naming 에만 의존하지 않고 `perp + orderflow + structure` 파생 피처를 공용 truth 로 읽게 만든다.

## Owner

engine

## Primary Change Type

Engine logic change

## Scope

- perp/orderflow raw metric contract 의 첫 reusable shape 정의
- existing feature calc 위에 canonical derived features 첫 묶음 추가
- first slice 대상 피처를 replay/search/runtime 에서 읽을 수 있는 engine truth 로 노출
- targeted engine tests 추가

## Non-Goals

- full shared DB migration
- operator approval / rollback workflow
- multi-variant runtime redesign
- protocol doc lane merge
- every planned feature family implementation in one slice

## Canonical Files

- `AGENTS.md`
- `work/active/CURRENT.md`
- `work/active/W-0156-canonical-feature-plane-foundation.md`
- `work/active/W-0148-cto-data-engine-reset.md`
- `docs/domains/pattern-engine-runtime.md`
- `engine/scanner/feature_calc.py`
- `engine/data_cache/loader.py`
- `engine/data_cache/registry.py`
- `engine/research/live_monitor.py`
- `engine/research/pattern_search.py`
- `engine/tests/test_live_monitor.py`
- `engine/tests/test_pattern_search.py`

## Facts

1. the commercialization baseline already closes `manual_hypothesis -> benchmark search -> promotion -> active registry -> similar-live`, so this lane can stay engine-only and avoid new app surface work.
2. the first canonical subset on top of `compute_features_table()` is `oi_raw`, `oi_zscore`, `funding_rate_zscore`, `funding_flip_flag`, `volume_percentile`, `pullback_depth_pct`, and `cvd_price_divergence`.
3. live/search/promotion consumers already carry `canonical_feature_snapshot`, so they can adopt the feature-plane owner without changing their higher-level contracts.
4. the current local cut moves canonical subset materialization/extraction/scoring to `engine/features/canonical_pattern.py` and keeps `scanner.feature_calc` as the row materializer plus compatibility bridge.
5. targeted engine verification passes for the ownership split on `test_feature_calc.py`, `test_live_monitor.py`, `test_pattern_search.py`, and `test_refinement_reporting.py`.

## Assumptions

1. the first useful slice can stay file-backed/in-memory and does not require shared DB tables yet.
2. adding a narrow canonical feature subset is more valuable than attempting the full raw/derived schema in one pass.

## Open Questions

- which runtime consumer should be first to require the new features directly: similarity ranking or promotion/report diagnostics.

## Decisions

- open a new execution lane because canonical feature-plane work is a different primary change type from the saved commercialization baseline, even though it builds directly on that baseline.
- branch from `f5dec6c1` rather than `main`, because the new feature plane must sit on top of the already validated runtime loop.
- keep the first slice narrow: canonicalize a handful of perp/orderflow/structure features before widening into DB schema or operator tooling.
- extend the existing perp cache contract with `oi_raw` instead of creating a new raw-perp store in the first cut.
- prove adoption by threading the canonical feature subset into `VariantCaseResult` / `LiveScanResult` rather than redesigning replay scoring immediately.
- canonical feature-plane ownership now moves to a dedicated `engine/features/*` module; `scanner.feature_calc` may materialize rows but must delegate canonical subset math and helper exports to that owner.

## Next Steps

1. decide when `canonical_feature_version` should be threaded into runtime/search artifacts as a stable cross-plane reference instead of an internal module constant only.
2. widen the raw contract beyond perp into liquidation/orderflow inputs only if the next consumer demonstrably needs them.
3. keep the slice narrow and land shared-DB or operator workflow follow-ups as separate lanes after the ownership split.

## Exit Criteria

- [x] a named canonical feature subset exists in engine code and tests.
- [x] at least one runtime/search path reads the new canonical features directly.
- [x] canonical feature subset ownership lives under `engine/features/*`, not duplicated inside downstream consumers.
- [x] targeted engine tests pass on the first slice.

## Handoff Checklist

- active work item: `work/active/W-0156-canonical-feature-plane-foundation.md`
- branch: `codex/w-0156-feature-plane-foundation`
- baseline branch: `codex/w-0151-active-variant-runtime-registry`
- baseline commit: `f5dec6c1`
- verification: `uv run --group dev python -m pytest tests/test_fetch_binance_perp.py tests/test_data_cache.py tests/test_feature_calc.py tests/test_live_monitor.py tests/test_pattern_candidate_routes.py tests/test_pattern_search.py -q`
- remaining blockers: shared DB registry/state, operator workflow, liquidation/orderflow raw planes, and multi-variant runtime stay out of scope
