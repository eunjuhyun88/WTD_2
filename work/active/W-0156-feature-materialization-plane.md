# W-0156 — Feature Materialization Plane

## Goal

현재 `scanner.feature_calc` 가 즉석 계산한 bar feature 와 pattern/replay logic 사이에 비어 있는
`raw -> feature_windows -> pattern_events -> search_corpus_signatures` 저장 plane 을 실제 코드로 연다.
이번 슬라이스는 데이터엔진이 공통 feature 를 한 번 계산하고, 패턴/검색이 그 결과를 재사용할 수 있는
durable store 와 materializer skeleton 을 만든다.

## Owner

engine

## Primary Change Type

Engine logic change

## Scope

- canonical raw/feature/search materialization schema 를 engine store 로 추가
- hot-path raw source (`market bars`, `perp`, `orderflow`) upsert 경로 추가
- `feature_windows` 계산기 추가
- `pattern_events` / `search_corpus_signatures` first-write path 추가
- targeted engine tests 로 roundtrip 과 핵심 feature 계산 검증

## Non-Goals

- 이번 슬라이스에서 full UI cutover 수행
- full lower-timeframe live ingestion 완성
- pattern family search/ranking 전체 재작성
- shared Postgres 배포/운영 연결

## Canonical Files

- `AGENTS.md`
- `work/active/CURRENT.md`
- `work/active/W-0156-feature-materialization-plane.md`
- `work/active/W-0122-free-indicator-stack.md`
- `work/active/W-0141-market-data-plane.md`
- `engine/data_cache/loader.py`
- `engine/features/__init__.py`
- `engine/features/columns.py`
- `engine/features/compute.py`
- `engine/features/materialization.py`
- `engine/features/materialization_store.py`
- `engine/scanner/feature_calc.py`
- `engine/scanner/jobs/feature_materialization.py`
- `engine/research/pattern_search.py`
- `engine/scanner/scheduler.py`
- `engine/data_cache/fetch_binance_perp.py`
- `engine/tests/test_feature_materialization_store.py`
- `engine/tests/test_feature_materialization.py`
- `engine/tests/test_features_registry.py`

## Facts

1. 현재 엔진은 `scanner.feature_calc.compute_features_table()` 로 bar-level feature 는 계산하지만, 이를 canonical window store 로 영속화하지 않는다.
2. `research/pattern_search.py` 와 pattern replay 는 feature 계산 결과를 직접 읽지만, `feature_windows` / `search_corpus_signatures` 같은 reusable materialized layer 는 없다.
3. engine 내 durable store 패턴은 주로 SQLite 기반 `CaptureStore`, `PatternStateStore`, `ResearchStateStore` 로 구현돼 있어, 첫 slice 도 같은 방식이 가장 작고 안전하다.
4. first slice now persists a SQLite-backed schema for `raw_market_bars`, `raw_perp_metrics`, `raw_orderflow_metrics`, `feature_windows`, `pattern_events`, and `search_corpus_signatures`.
5. Binance perp cache now preserves raw `oi` alongside `funding_rate`, `oi_change_*`, and `long_short_ratio`, so window materialization no longer has to rely only on change-rate columns when cache coverage exists.

## Assumptions

1. first slice 는 SQLite-backed durable store 여도 충분하며, logical schema 를 고정하는 것이 우선이다.
2. `feature_windows` 는 우선 P0/P1 핵심 feature 를 계산하고, 나머지 필드는 nullable 로 남겨도 된다.
3. `pattern_events` 는 첫 slice 에서는 heuristic phase guess 와 evidence snapshot 저장까지만 닫아도 된다.

## Open Questions

- `feature_windows` 의 장기 physical owner 를 SQLite 에 둘지 Postgres/Supabase 로 올릴지는 후속 infra lane 에서 결정한다.
- lower-timeframe (`15m`) production ingestion 은 existing 1h cache 를 확장할지 별도 source lane 으로 둘지 후속 판단이 필요하다.

## Decisions

- common feature math 는 데이터엔진 소유이며, `pattern_events` 는 materialized feature 를 읽는 consumer 로만 다룬다.
- first executable slice 는 `raw_market_bars`, `raw_perp_metrics`, `raw_orderflow_metrics`, `feature_windows`, `pattern_events`, `search_corpus_signatures` 를 SQLite store 로 연다.
- worker entry 는 existing loader/features stack 위에 얹고, scheduler full wiring 은 이번 슬라이스에서 하지 않는다.
- `feature_windows` 계산은 reusable pure functions 로 두고, store write 는 별도 orchestrator 로 분리한다.
- first slice verification is `4 passed` on materialization/store tests and `10 passed` on existing features registry tests.

## Next Steps

1. extend the feature plane with `raw_onchain_metrics`, `raw_fundamental_metrics`, and `raw_macro_metrics` writers once source adapters are normalized.
2. add runtime-facing read models and routes (`/api/features/window`, bounded runtime state hooks) on top of this store.
3. close production 15m ingestion so the same materializer can run on true lower-timeframe bars instead of 1h-only cache lanes.

## Exit Criteria

- engine 에 canonical materialization store 가 실제로 존재한다.
- `feature_windows`, `pattern_events`, `search_corpus_signatures` write path 가 동작한다.
- targeted engine tests 가 통과한다.
- 후속 W-0122/W-0145/W-0143 가 이 저장 구조를 기준으로 이어질 수 있다.

## Handoff Checklist

- active work item: `work/active/W-0156-feature-materialization-plane.md`
- active branch: `codex/w-0156-feature-materialization-plane`
- verification:
  - `uv run --directory engine python -m pytest tests/test_feature_materialization_store.py tests/test_feature_materialization.py -q`
- blockers:
  - production-grade 15m ingestion is not closed in this slice
