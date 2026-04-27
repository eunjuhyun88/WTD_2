# W-0149 — Manual Hypothesis Benchmark Pack Draft

## Goal

`manual_hypothesis` capture 에 들어온 `research_context` 와 reviewed range 정보를 replay benchmark pack draft 로 변환하고, 그 draft를 즉시 benchmark search run 으로 실행할 수 있게 만들어 founder note → pack → search 결과 경로를 엔진에서 닫는다.

## Owner

research

## Primary Change Type

Research or eval change

## Scope

- engine 에 `manual_hypothesis` capture → benchmark pack draft builder 추가
- capture 기준 draft 생성 / benchmark search 실행 API route 추가
- benchmark pack draft 저장 경로를 canonical `pattern_search/benchmark_packs` 와 정렬
- capture-derived timeframe family 가 `15m/30m/1h/4h` search variants 로 실제 확장되도록 search axis 제한 보정
- targeted engine tests 추가

## Non-Goals

- benchmark pack 자동 holdout/negative discovery
- app UI / submit flow 작성
- BREAKOUT rule redesign

## Canonical Files

- `AGENTS.md`
- `work/active/CURRENT.md`
- `work/active/W-0149-manual-hypothesis-benchmark-pack-draft.md`
- `docs/domains/multi-timeframe-autoresearch-search.md`
- `engine/api/routes/captures.py`
- `engine/capture/store.py`
- `engine/research/pattern_search.py`
- `engine/tests/test_capture_routes.py`

## Facts

1. `manual_hypothesis` capture 는 optional `research_context` 와 phase annotation 을 engine canonical store 에 담을 수 있다.
2. current search stack has canonical `ReplayBenchmarkPack`, `BenchmarkCase`, `BenchmarkPackStore`, and `run_pattern_benchmark_search`.
3. `POST /captures/{capture_id}/benchmark_pack_draft` and `POST /captures/{capture_id}/benchmark_search` now close founder note ingestion through draft-pack persistence and immediate benchmark search execution.
4. capture-derived timeframe families now include `15m/30m/1h/4h`, and search timeframe expansion no longer drops sub-base timeframes.
5. targeted engine verification now passes on the capture route suite.

## Assumptions

1. first slice can generate a one-reference benchmark pack draft from a single capture and run benchmark search with default thresholds.
2. range bounds can be derived from phase annotation timestamps first, with viewport fallback if present.

## Open Questions

- none for this slice

## Decisions

- the routes stay capture-scoped: `POST /captures/{capture_id}/benchmark_pack_draft` and `POST /captures/{capture_id}/benchmark_search`.
- the first draft persists directly into the canonical benchmark pack store and is then reused immediately by benchmark search.
- capture-derived candidate timeframe families must be allowed to go below the base pattern timeframe so `15m` replay search becomes real, not metadata only.
- branch split required: current clean branch `codex/w-0122-market-cap-fact-cut` belongs to another work item, so W-0149 must run on a dedicated branch.

## Next Steps

1. add holdout / near-miss auto-generation so single-capture draft packs are not reference-only.
2. promote `BREAKOUT` redesign into the replay/search lane so PTB/TRADOOR benchmark search stops failing at the final phase.
3. expose benchmark search launch/results in app surface and operator runtime state.

## Exit Criteria

- a `manual_hypothesis` capture with `research_context` can be turned into a saved replay benchmark pack draft.
- the returned draft includes pattern slug, candidate timeframes, and at least one reference case with derived bounds.
- the same capture can launch a benchmark search run and return the saved run/artifact references.
- targeted engine tests cover draft generation, benchmark search launch, and invalid-capture failure cases.

## Handoff Checklist

- active work item: `work/active/W-0149-manual-hypothesis-benchmark-pack-draft.md`
- branch: `codex/w-0149-manual-hypothesis-benchmark-pack-draft`
- verification: `uv run --group dev python -m pytest tests/test_capture_routes.py -q`
- remaining blockers: holdout/negative auto-generation, BREAKOUT redesign, and live scanner promotion remain future slices
