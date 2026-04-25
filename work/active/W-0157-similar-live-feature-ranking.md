# W-0157 — Similar-Live Feature Ranking

## Goal

`similar-live` 결과가 replay/state-machine 점수만으로 정렬되지 않고, `W-0156` 에서 열린 canonical feature plane(`oi/funding/volume/structure`)을 실제 랭킹 보정에 소비하도록 만들어 live state match가 더 설명 가능한 순서로 정렬되게 한다.

## Owner

engine

## Primary Change Type

Engine logic change

## Scope

- `similar-live` 랭킹에 canonical feature alignment 보정 점수 추가
- replay similarity / feature alignment / final ranking score 진단값 노출
- targeted engine tests 갱신

## Non-Goals

- promotion diagnostics/report redesign
- new raw metric families beyond the `W-0156` subset
- app UI wiring
- shared DB or operator workflow changes

## Canonical Files

- `AGENTS.md`
- `work/active/CURRENT.md`
- `work/active/W-0156-canonical-feature-plane-foundation.md`
- `work/active/W-0157-similar-live-feature-ranking.md`
- `docs/domains/pattern-engine-runtime.md`
- `engine/research/live_monitor.py`
- `engine/api/routes/patterns.py`
- `engine/tests/test_live_monitor.py`
- `engine/tests/test_pattern_candidate_routes.py`

## Facts

1. `W-0156` landed a narrow canonical feature subset and threads it through `VariantCaseResult` / `LiveScanResult`, but `search_pattern_state_similarity()` still sorts on replay score + depth/fidelity only.
2. the current `similar-live` route already returns per-result diagnostics, so adding ranking diagnostics is a bounded engine-only change.
3. replay/state-machine score remains the structural truth for state matching, so the new feature score should refine ranking rather than replace the replay gate.
4. the clean baseline for this lane is branch `codex/w-0156-feature-plane-foundation` commit `6ae2f566`, and this follow-up runs on `codex/w-0157-similar-live-feature-ranking`.
5. the current local cut adds `replay_similarity_score`, `canonical_feature_score`, and `ranking_score` to `LiveScanResult`, and targeted `live_monitor` / route tests pass on this branch.

## Assumptions

1. the first consumer can live inside `engine/research/live_monitor.py` without extracting a new shared feature-ranking module yet.
2. a compact heuristic from the existing canonical subset is enough to improve ordering before a fuller learned ranker exists.

## Open Questions

- whether promotion diagnostics should later reuse the same feature-alignment score or keep a separate reporting-only summary.

## Decisions

- open a new execution lane because feature export (`W-0156`) and feature consumption (`W-0157`) are separate merge units.
- keep the existing replay similarity threshold as the hard filter and use canonical features only to adjust ranking within viable matches.
- preserve replay similarity as a visible diagnostic and add separate feature/final ranking fields instead of silently changing the meaning of one score.

## Next Steps

1. decide whether the same canonical feature score should be reused by promotion/report diagnostics or stay `similar-live` specific for now.
2. widen the canonical consumer set only after this ranking cut lands cleanly.

## Exit Criteria

- [x] `similar-live` ordering consumes canonical feature truth under the existing replay similarity gate.
- [x] returned results expose enough diagnostics to explain the adjusted ordering.
- [x] targeted engine tests pass on the new branch.

## Handoff Checklist

- active work item: `work/active/W-0157-similar-live-feature-ranking.md`
- branch: `codex/w-0157-similar-live-feature-ranking`
- baseline branch: `codex/w-0156-feature-plane-foundation`
- baseline commit: `6ae2f566`
- verification: `uv run --group dev python -m pytest tests/test_live_monitor.py tests/test_pattern_candidate_routes.py -q`
- remaining blockers: promotion diagnostics consumption, wider raw metric families, and shared feature-plane storage remain future slices
