# W-0151 — Active Variant Runtime Registry

## Goal

benchmark search / promotion gate 결과를 durable active-variant registry 로 연결해서, live runtime 이 더 이상 하드코딩된 `PROMOTED_PATTERNS` 목록이 아니라 gate-cleared variant truth 를 읽도록 만든다.

## Owner

engine

## Primary Change Type

Engine logic change

## Scope

- active pattern variant registry store 추가
- benchmark search completion 시 promotion gate 통과 variant 를 registry 에 반영
- live monitor / live signals 가 registry 기반 active variants 를 읽도록 전환
- targeted engine tests 추가

## Non-Goals

- app UI redesign
- full multi-tenant permissions / operator approval workflow
- ML model registry redesign
- promotion gate threshold 자체 재설계

## Canonical Files

- `AGENTS.md`
- `work/active/CURRENT.md`
- `work/active/W-0151-active-variant-runtime-registry.md`
- `docs/domains/pattern-engine-runtime.md`
- `engine/research/pattern_search.py`
- `engine/research/live_monitor.py`
- `engine/api/routes/live_signals.py`
- `engine/patterns/registry.py`

## Facts

1. benchmark search already computes a `promotion_report` and writes `promoted_variant_slug` / `promoted_family_ref` into the run handoff payload when the gate passes.
2. live runtime still reads a hardcoded `PROMOTED_PATTERNS` list in `engine/research/live_monitor.py`, so search winners do not become operational truth automatically.
3. `1h` canonical remains the overall TRADOOR/PTB search winner, while intraday variants can still matter as active family members for narrower scans.
4. commercial operation requires a durable activation plane: restart-safe, queryable, and not dependent on source edits.

## Assumptions

1. first slice can support a single active variant per `pattern_slug` with stored timeframe and watch phases.
2. auto-upserting only gate-cleared winners is safer than auto-activating every search winner.

## Open Questions

- whether later slices should support multiple concurrent active variants per pattern family (for example `1h` canonical plus `15m` intraday specialist) in the live monitor.

## Decisions

- add a dedicated registry store rather than overloading the generic pattern metadata registry.
- keep hardcoded defaults only as seed/fallback data; runtime reads the durable store first.
- let benchmark search auto-sync gate-cleared winners into the active registry so the research loop closes without manual code edits.
- branch split reason: this slice changes runtime activation semantics and should remain separable from W-0150 breakout tuning.

## Next Steps

1. add active-variant registry types/store and seed defaults from the current promoted list.
2. wire benchmark search promotion-gate success to upsert the registry.
3. switch live monitor/routes to registry-backed active patterns and verify with targeted tests.

## Exit Criteria

- gate-cleared benchmark search runs write the promoted variant into a durable active registry.
- live monitor can read active patterns without editing source code.
- tests cover registry fallback, auto-promotion sync, and live scan integration.

## Handoff Checklist

- active work item: `work/active/W-0151-active-variant-runtime-registry.md`
- branch: `codex/w-0151-active-variant-runtime-registry`
- verification: targeted tests for active registry, benchmark search sync, and live monitor route behavior
- remaining blockers: multi-variant-per-pattern runtime, operator approval workflow, and shared DB-backed registry remain future slices
