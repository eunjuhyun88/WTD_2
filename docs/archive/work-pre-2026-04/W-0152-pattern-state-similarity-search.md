# W-0152 — Pattern State Similarity Search

## Goal

이미지 유사도가 아니라 replay/state-machine 기반 `시장 상태/패턴 구조 유사도`를 live universe 에서 직접 검색할 수 있게 만들고, 실제 현재 후보를 반환하는 query path 까지 붙인다.

## Owner

engine

## Primary Change Type

Engine logic change

## Scope

- pattern family 기준 live state-similarity search 함수 추가
- active variant registry 를 기본 truth 로 사용해 pattern-specific live query 제공
- similarity score / phase progress / observed path 를 응답에 포함
- targeted engine tests와 실제 universe smoke 실행

## Non-Goals

- 차트 이미지 유사도
- full UI wiring
- corpus scheduler 장기 운영 최적화
- 새로운 pattern family 자체 설계

## Canonical Files

- `AGENTS.md`
- `work/active/CURRENT.md`
- `work/active/W-0152-pattern-state-similarity-search.md`
- `docs/domains/multi-timeframe-autoresearch-search.md`
- `engine/research/live_monitor.py`
- `engine/api/routes/patterns.py`
- `engine/tests/test_live_monitor.py`
- `engine/tests/test_pattern_candidate_routes.py`

## Facts

1. `challenge` lane is snapshot/cosine oriented and does not directly expose phase-sequence similarity.
2. `scan_universe_live()` already replays the active variant over live windows and computes phase fidelity, depth progress, and per-case score under the hood.
3. active variant registry now provides a durable runtime truth for which variant/timeframe to scan per pattern family.
4. user requirement is to find symbols in the same market state / structural phase flow, not to match candle images.
5. user-defined state meaning is feature-bundle based: `price + OI + funding + volume + structure`, with orderflow / onchain / macro as later enrichments.
6. real smoke on 2026-04-23 showed the route works, but offline cache freshness can zero out default `48h` live scans; widening staleness or refreshing local cache is required for meaningful operator smoke when data is older than the runtime SLA.

## Assumptions

1. the existing replay score (`VariantCaseResult.score`) is an acceptable first live similarity score.
2. a pattern-specific search route can rank all scanned symbols by structure similarity while live-signals remains the cross-pattern watchlist route.

## Open Questions

- whether later slices should blend corpus/historical similarity with the live replay score into one combined ranker.

## Decisions

- reuse replay-based phase score instead of building a second bespoke similarity model.
- default to the active variant registry for variant/timeframe resolution.
- keep this slice additive: new search path, not a breaking change to current live-signals route.
- branch reuse reason: this is the next commercialization slice on top of the uncommitted active-registry lane, so splitting again mid-stack would create a dirtier merge boundary than value.
- the first production similarity ranker will surface structural truth already encoded in replay, while richer feature layers such as CVD/liquidation/onchain remain upstream ingestion/feature-engineering follow-ups rather than blockers for this route.

## Next Steps

1. add pattern-specific live state similarity search function and result fields.
2. add `/patterns/{slug}/similar-live` read route.
3. run targeted tests and one real universe smoke query, recording cache-staleness caveat.

## Exit Criteria

- the engine can return current symbols ranked by pattern-state similarity for one pattern family.
- responses include observed path, current phase, and similarity score.
- targeted tests pass and one real live smoke query runs successfully.

## Handoff Checklist

- active work item: `work/active/W-0152-pattern-state-similarity-search.md`
- branch: `codex/w-0151-active-variant-runtime-registry`
- verification: targeted live-monitor/pattern-route tests + real live smoke query
- remaining blockers: corpus-backed historical similarity and multi-variant blended ranking remain future slices
