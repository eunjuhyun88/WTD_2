# W-0150 — Breakout Production Lane

## Goal

TRADOOR/PTB 계열 패턴이 실제 리플레이에서 마지막 `BREAKOUT` phase 를 놓치는 문제를 줄이기 위해 breakout contract 를 post-accumulation 구조 중심으로 재정의하고, canonical benchmark replay/search 에서 `15m` 와 `1h` 둘 다 실제로 `BREAKOUT` 까지 도달하는 production-safe 경로를 만든다.

## Owner

engine

## Primary Change Type

Engine logic change

## Scope

- `BREAKOUT` phase 의 required block 을 post-accumulation breakout 전용 trigger 로 보강 또는 교체
- pre-dump false positive 를 줄이는 trigger 구현
- default replay/search lane 이 `15m` family 를 실제 평가하도록 정렬
- targeted block / replay / benchmark validation 추가

## Non-Goals

- full live promotion gate 구현
- negative / holdout auto-discovery 전체
- app UI wiring
- every pattern family redesign

## Canonical Files

- `AGENTS.md`
- `work/active/CURRENT.md`
- `work/active/W-0150-breakout-production-lane.md`
- `docs/domains/pattern-engine-runtime.md`
- `engine/building_blocks/triggers/breakout_from_pullback_range.py`
- `engine/building_blocks/triggers/*`
- `engine/patterns/library.py`
- `engine/research/pattern_search.py`
- `engine/tests/test_triggers_breakout_from_pullback_range.py`
- `engine/tests/test_patterns_replay.py`

## Facts

1. current TRADOOR/PTB replay reaches `ACCUMULATION` but often misses `BREAKOUT`.
2. current `breakout_from_pullback_range` resets on rolling lows and can fire on pre-dump rally structure, not only on post-accumulation breakout.
3. benchmark search now accepts capture-derived `15m` packs, but the default pattern contract still governs actual replay quality.
4. a commercializable engine must prefer missing noisy detections over promoting structurally wrong breakouts.
5. after the first breakout lane fix, `1h` canonical replay reaches `BREAKOUT` on the reference case, but `15m` canonical replay still stalls at `ACCUMULATION`.
6. the original `15m` evaluation bug was partly a data-contract bug: sub-hour requests were being served from resampled `1h` bars, which fabricated intraday structure.
7. after switching sub-hour loading to native cache/fetch and filling `15m`/`30m` caches for the benchmark symbols, the real `15m` failure moved earlier: `REAL_DUMP` missed because intraday volume spike and OI spike landed in the same dump cluster but not on the same 15m bar.

## Assumptions

1. a first production fix can be made with a stateless post-accumulation breakout trigger that references recent accumulation evidence and local range breakout.
2. existing OI re-expansion confirmation remains useful and should stay as a breakout co-signal.

## Open Questions

- whether a later slice should pass phase-anchor metadata into block Context instead of approximating post-accumulation structure from recent bars only.
- whether the remaining `15m` miss is best solved by timeframe-scaled trigger windows alone or by adding a dedicated breakout-oriented seed/search variant for the TRADOOR family.

## Decisions

- use a new post-accumulation breakout trigger rather than overloading the current rolling-low breakout trigger again.
- keep the current trigger available for other pattern families; TRADOOR-specific `BREAKOUT` can switch independently.
- validate on targeted tests first, then on replay search smoke against the existing benchmark pack.
- treat `15m` canonical replay parity as the current blocker for declaring this lane production-safe.
- stop pretending sub-hour timeframes can be derived from `1h`; `15m` / `30m` must come from native cache or fetch.
- keep `1h` canonical untouched where it is already strong, and add an intraday-only dump-cluster variant rather than weakening the base contract for all timeframes.

## Next Steps

1. validate the full benchmark search winner set with the real `15m` / `30m` caches now present.
2. decide whether KOMA/DYM holdouts need a second intraday variant around `ARCH_ZONE -> REAL_DUMP` or should remain `1h`-first in production promotion.
3. record the validated production lane and remaining architecture follow-ups without widening scope into promotion-gate work.

## Exit Criteria

- TRADOOR `BREAKOUT` contract no longer depends solely on the generic rolling-low breakout trigger.
- targeted tests cover both pre-dump false positives and post-accumulation breakout detection.
- replay or benchmark validation shows the new contract executes without regressions in the target pack.
- sub-hour search uses native intraday data rather than fake `1h` resamples.
- the benchmark search runtime evaluates `15m` / `30m` / `1h` / `4h` honestly and can surface an intraday winner variant without degrading the `1h` canonical lane.

## Handoff Checklist

- active work item: `work/active/W-0150-breakout-production-lane.md`
- branch: `codex/w-0150-breakout-production-lane`
- verification:
  - `uv run --group dev python -m pytest tests/test_capture_routes.py -q`
  - `uv run --group dev python -m pytest tests/test_triggers_breakout_from_pullback_range.py -q`
  - targeted replay / benchmark smoke for `tradoor-oi-reversal-v1`
- remaining blockers: phase-anchor-in-context architecture, holdout auto-generation, and live promotion gate
