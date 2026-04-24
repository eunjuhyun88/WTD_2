# W-0160 — Pattern Definition Plane

## Goal

`Pattern Research Operating System`의 첫 contract family로 `/runtime/definitions/*` read model을 열어, built-in pattern library / registry metadata / capture-linked research evidence를 하나의 canonical pattern definition shape로 읽을 수 있게 한다.

## Owner

engine

## Primary Change Type

Contract change

## Scope

- `/runtime/definitions` list/detail read route 추가
- pattern library + registry metadata를 합친 canonical definition read model 추가
- `manual_hypothesis` capture `research_context`에서 thesis / tags / source / phase annotation evidence를 linked evidence로 노출
- runtime captures 와 첫 search-plane consumer 가 `definition_id` / `definition_ref`를 읽도록 contract 정렬
- research runs / benchmark search artifacts / handoff payload 가 `definition_ref`를 저장하도록 contract 정렬
- bounded refinement runs, train handoff payload, and training-ledger artifacts 가 같은 `definition_ref`를 유지하도록 contract 정렬
- direct `/patterns/*` train/promote model paths 와 `/runtime/ledger/*` projection 이 같은 `definition_ref`를 읽고 노출하도록 contract 정렬
- runtime ledger store 와 pattern stats/model-registry read model 이 `definition_ref`를 first-class metadata 로 저장/노출하도록 정렬
- runtime ledger history 와 pattern model history / registry views 가 `definition_id` 기준 query/list 를 지원하도록 contract 정렬
- capture truth 와 outcome truth 가 canonical `definition_ref` 를 write time 에 저장하도록 정렬
- per-pattern stats / record-family summary 가 stored `definition_id` 기준 fully definition-scoped aggregate 를 지원하도록 정렬
- targeted engine tests 추가

## Non-Goals

- 새 definition write path 추가
- 별도 Postgres/SQLite definition table 도입
- app UI 연결
- promotion / outcome / judgment plane 구현

## Canonical Files

- `AGENTS.md`
- `work/active/CURRENT.md`
- `work/active/W-0160-pattern-definition-plane.md`
- `docs/domains/terminal-ai-scan-architecture.md`
- `engine/api/routes/runtime.py`
- `engine/api/schemas_runtime.py`
- `engine/patterns/library.py`
- `engine/patterns/definitions.py`
- `engine/patterns/registry.py`
- `engine/capture/store.py`
- `engine/tests/test_runtime_routes.py`

## Facts

1. current `runtime` plane already owns captures, setups, research contexts, and ledger reads, but it has no canonical `definitions` family yet.
2. built-in phase graphs already exist in `engine/patterns/library.py` and lightweight metadata already exists in `engine/patterns/registry.py`.
3. founder/manual hypothesis notes already land in canonical capture storage via `research_context`, including thesis, phase annotations, and research tags.
4. existing `/patterns/{slug}` read is pattern-engine oriented and does not present a runtime-plane definition object with linked research evidence.
5. current local cut adds `PatternDefinitionService` plus `/runtime/definitions` list/detail routes that compose pattern library, registry metadata, and capture-linked research evidence without adding a new write store.
6. current local cut also adds runtime capture-side `definition_ref` enrichment and `definition_id` filtering, so the first runtime consumer can read pattern definitions without depending on raw `pattern_slug` only.
7. current local cut also threads `definition_id` / `definition_ref` through corpus `seed` / `scan` route requests and candidate payloads without changing corpus ranking semantics.
8. current local cut now persists `definition_ref` on research runs and benchmark search artifacts, and includes it in benchmark-search handoff payload / selection metrics so the loop no longer terminates at search request metadata only.
9. current local cut also threads the same `definition_ref` through bounded refinement runs, train handoff payloads, and training-service ledger payloads so search winners keep a canonical definition key as they enter judgment/training lanes.
10. current local cut also adds `definition_ref` to direct model-train/model-promote ledger records and exposes it on `/runtime/ledger/{ledger_id}` via canonical projection/fallback resolution.
11. current local cut now persists `definition_ref` as first-class metadata in the runtime ledger store and exposes top-level `definition_ref` on pattern stats/model-registry read models instead of requiring payload-only inspection.
12. current local cut also opens `definition_id` query surfaces over runtime ledger history and pattern model-history / model-registry views, so the canonical key is now discoverable without id-only fetches or payload inspection.
13. current local cut now persists `definition_ref` on model-registry entries and makes both model-history and model-registry routes actually filter by `definition_id`, so those surfaces no longer use the key only for validation.
14. the remaining architectural gap is model identity scope: training/research/runtime still derive `model_key` primarily from `pattern_slug`, so multiple live definition revisions under one slug could still collide in promotion and preferred-model selection.
15. current local cut now makes model identity definition-version aware by including `definition_id` in canonical model keys, scoping registry promotion/preferred lookups by definition when available, and falling back to legacy slug-only records only when needed.
16. the prior mixed-scope step exposed `definition_id` on `/patterns/{slug}/stats`, but still kept outcome aggregates pattern-wide while filtering only model artifacts by definition scope.
17. current local cut now persists canonical `definition_id` / `definition_ref` on `CaptureRecord` and `PatternOutcome` truth, mirrors the same metadata into entry/score/capture/outcome/verdict ledger records, and promotes training/stats/read models to fully definition-scoped aggregates.
18. current local cut also keeps backward compatibility for legacy rows: when capture/outcome/ledger records predate stored definition metadata, current-definition reads still include them via explicit fallback instead of dropping stats to zero during migration.

## Assumptions

1. the first useful slice can stay read-only and derive definitions from existing stores instead of introducing new persistence.
2. linked evidence can come from recent captures with `research_context` for the same `pattern_slug` first.

## Open Questions

- whether future definition ids should stay slug/version-based or move to a separate durable UUID namespace.

## Decisions

- first slice is read-only: `list` + `detail` under `/runtime/definitions/*`.
- canonical detail shape will expose thesis, phase template, registry metadata, and linked evidence separately.
- capture `research_context` remains the evidence source for now; this slice does not migrate it out of captures yet.
- runtime capture consumers resolve `definition_ref` at read time; capture persistence remains `pattern_slug`/`pattern_version` based until a later write-path lane exists.
- the first search-plane cut is metadata-only: `definition_id` and `definition_ref` may flow through seed/scan requests and candidates, but they do not yet change corpus ranking semantics.
- research runtime persistence stays backward-compatible: `pattern_slug` remains the legacy join key, while `definition_ref` is added as an optional canonical key on runs, benchmark artifacts, and handoff payloads.
- history/list surfaces resolve definitions defensively: list routes prefer stored `definition_id` / `definition_ref`, but still keep read-time fallback until all writers are upgraded.
- model registry/training producers now store canonical definition metadata at write time; route-level `definition_id` filters must prefer persisted metadata before any slug-only fallback.
- the next slice should make model identity and active-selection scope definition-version aware, but remain backward-compatible for older slug-only records while the registry/history migrate forward.
- preferred-model consumers should resolve the current definition scope first and only fall back to slug-only registry rows for legacy artifacts that predate definition-aware model keys.
- capture/outcome truth now persists canonical definition identity at write time, so stats/training/runtime readers should prefer stored `definition_id` / `definition_ref` over `pattern_version` inference.
- current-definition fallback is acceptable only for legacy rows with missing stored definition metadata; new rows must always carry canonical definition identity.
- `#228` merged 이후에도 W-0160 후속 contract 가 남아 있어, 이번 slice 는 기존 merged branch를 재사용하지 않고 new main-based execution branch로 분리한다.

## Next Steps

1. decide whether definition ids remain slug/version derived or move to a durable UUID namespace once write paths land.
2. decide whether stats/runtime readers need explicit `scope=all_definitions` views in addition to current-definition default reads.
3. split capture-linked evidence from captures into a dedicated definition store only after the read contract proves stable.

## Exit Criteria

- runtime plane exposes canonical pattern definition list/detail routes.
- detail responses include phase template plus linked research evidence from captures when available.
- runtime captures, first search-plane consumers, and benchmark-search research artifacts all preserve canonical `definition_ref`.
- bounded refinement runs, train handoff payloads, and training ledger payloads preserve the same `definition_ref`.
- direct train/promote model ledger records and `/runtime/ledger/*` projection preserve or expose the same `definition_ref`.
- runtime ledger storage and pattern stats/model-registry read models expose `definition_ref` as first-class metadata.
- runtime ledger history plus pattern model-history/registry list surfaces accept `definition_id` and preserve canonical `definition_ref`.
- model-history and model-registry routes use persisted definition metadata as the first filter, not slug-only reconstruction.
- model training, promotion, and preferred-model lookup are definition-version aware so sibling definition revisions under one slug do not collide.
- capture and outcome truth persist canonical `definition_id` / `definition_ref` at write time.
- per-pattern stats and record-family summaries are fully definition-scoped for the current/requested definition, with current-definition fallback only for legacy rows missing stored definition metadata.
- targeted engine tests pass.

## Handoff Checklist

- active work item: `work/active/W-0160-pattern-definition-plane.md`
- branch: `codex/w-0160-pattern-definition-plane`
- verification:
  - `uv run --directory engine python -m pytest tests/test_search_routes.py tests/test_runtime_routes.py tests/test_capture_store.py tests/test_capture_routes.py tests/test_capture_verdict_inbox.py tests/test_outcome_resolver.py tests/test_ledger_store.py tests/test_pattern_candidate_routes.py tests/test_pattern_search.py tests/test_research_state_store.py tests/test_research_worker_control.py tests/test_pattern_refinement.py tests/test_train_handoff.py tests/test_worker_research_jobs.py tests/test_refinement_reporting.py tests/test_model_registry.py tests/test_pattern_entry_scorer.py tests/test_patterns_scanner.py -q`
  - `npm --prefix app run check` currently blocked in this worktree (`svelte-kit: command not found`)
- remaining blockers: definition write path, durable definition store, full writer adoption of stored `definition_id`, and UI consumption remain future slices
