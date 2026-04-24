# W-0160 — Pattern Draft / Query Transformer Contract

## Goal

자유형 founder note, telegram 복기, chart selection, image note 를 AI parser 가 canonical `PatternDraft` 로 구조화하고, engine-owned `QueryTransformer` 가 이를 `SearchQuerySpec` 으로 변환해 seed-search / benchmark / ledger loop 로 연결하는 계약과 plane 경계를 정의한다.

## Owner

contract

## Primary Change Type

Contract change

## Scope

- `PatternDraft`, `ParserMeta`, `SearchQuerySpec`, `PhaseQuery`, signal-rule registry 의 canonical object 정의
- app/engine capture contract 에 additive `pattern_draft` / `parser_meta` persistence 추가
- engine `QueryTransformer` first slice 구현 + targeted tests 추가
- `manual_hypothesis` benchmark-pack builder 가 `phase_annotations` 없이도 `pattern_draft` 를 fallback 입력으로 읽게 연결
- terminal `PatternSeedScout` 의 `Find Similar` 요청을 `thesis -> PatternDraft -> engine capture -> benchmark_search -> similar-live` 경로로 연결
- parser agent / review agent / transformer / search engine / ledger 의 책임 분리 정의
- live terminal AI path 가 raw market analysis 대신 bounded parser/search/runtime contracts 를 읽도록 cutover 순서 정의

## Non-Goals

- 이번 슬라이스에서 parser runtime 또는 transformer/search 전부 구현 완료
- threshold calibration 자동화 완료
- general chart-analysis chatbot 고도화

## Canonical Files

- `AGENTS.md`
- `work/active/CURRENT.md`
- `work/active/W-0160-pattern-draft-query-transformer-contract.md`
- `docs/domains/pattern-draft-query-transformer.md`
- `docs/domains/terminal-ai-scan-architecture.md`
- `work/active/W-0142-manual-hypothesis-research-context.md`
- `work/active/W-0143-query-by-example-pattern-search.md`
- `app/src/lib/contracts/terminalPersistence.ts`
- `app/src/lib/contracts/search/querySpec.ts`
- `app/src/lib/contracts/agent/agentContext.ts`
- `app/src/lib/server/terminalPersistence.ts`
- `app/src/lib/server/terminalPersistence.capture.test.ts`
- `engine/api/routes/captures.py`
- `engine/research/query_transformer.py`
- `engine/research/manual_hypothesis_pack_builder.py`
- `engine/tests/test_capture_routes.py`
- `engine/tests/test_query_transformer.py`

## Facts

1. app capture persistence now accepts additive `patternDraft` / `parserMeta`, round-trips them to engine payloads, and derives compatibility `pattern_family` from the draft when needed.
2. engine capture routes accept draft-only `research_context`, validate family consistency, and still project compatibility fields (`pattern_family`, `source`, `thesis`, `phase_annotations`, `entry_spec`) from `pattern_draft`.
3. benchmark-pack draft generation can now start from `pattern_draft` fallback fields as long as range bounds are available from phase timestamps or viewport metadata.
4. engine `QueryTransformer` exists with deterministic `transform_pattern_draft(...)` output, and benchmark-search artifacts now persist optional `search_query_spec` payloads sourced from capture `pattern_draft`.
5. app now has a canonical `SearchQuerySpec` TypeScript contract, and `SeedSearchResult` can carry the same additive `search_query_spec` shape instead of falling back to untyped dict payloads later.
6. `PatternSeedScout` now bridges `Find Similar` through engine `/captures`, `/captures/{id}/benchmark_search`, and `/patterns/{slug}/similar-live`, and the surface response includes the emitted `searchQuerySpec`.
7. engine search/runtime/ledger already exists and phase truth remains rule-first, but the live DOUNI path still uses app-owned `analyze_market` / raw-provider fan-out instead of a canonical `PatternDraft -> SearchQuerySpec -> engine search` flow.
8. app `createPatternCapture(...)` writes through `engine.createRuntimeCapture(...)`, so capture translation tests must model `/runtime/captures` echoing exact `pattern_draft` / `parser_meta` payloads instead of the legacy `/captures` client.
9. the first executable slice from this contract is now merged on `origin/main` via PR #230 / #231, so the remaining work is follow-up propagation and cutover rather than first-landing uncertainty.
10. current local follow-up extracts the `PatternSeedScout` engine bridge into a shared server helper and wires DOUNI to the same helper through a dedicated `find_similar_patterns` tool, so live pattern-search turns can hit `PatternDraft -> benchmark_search -> similar-live` without going through `analyze_market`.

## Assumptions

1. parser output can be constrained to JSON-only with a fixed signal vocabulary and explicit ambiguity reporting.
2. the first implementation can dual-write compatibility projections (`pattern_family`, `phase_annotations`, `entry_spec`) while also storing the exact `PatternDraft`.
3. initial signal thresholds are registry defaults and later calibrated via ledger/verdict evidence rather than parser inference.

## Open Questions

- whether `PatternDraft` should live as `research_context.draft` or replace the current top-level `research_context` shape after migration.
- whether parser orchestration should remain app-owned initially or move behind an engine-owned ingress contract after the first cut.

## Decisions

- `PatternDraft` is the canonical AI parser boundary; it is the only object the parser agent is allowed to emit.
- `SearchQuerySpec` is the canonical engine search boundary; only the engine-owned transformer may materialize it from `PatternDraft`.
- parser, transformer, review, and ledger are separate roles: parser maximizes structure recall, transformer maximizes determinism, review agent maximizes operator throughput, ledger owns verdict truth.
- Phase 1 persistence is additive: captures keep the existing `research_context` compatibility projection while also storing exact parser output plus parser metadata for audit.
- first executable slice lands additive persistence + transformer unit logic only; live parser orchestration and agent cutover remain follow-up work.
- `SearchQuerySpec` must be persisted on search/benchmark artifacts with transformer/rule-registry versions; it must not live only in transient chat memory.
- live terminal AI cutover should remove raw market fan-out from parse/search requests and instead route those turns through `PatternDraft`, engine search, and bounded `AgentContextPack` summaries.
- `must_have_signals` are prefilter constraints before ranking, not only soft-scoring hints.
- production `PhaseQuery` must support `forbidden_numeric`, `max_gap_bars`, and phase-order metadata; a single-row all-phase scorer is not sufficient for canonical search.
- benchmark-pack draft generation should accept `pattern_draft` as a fallback source for phase/timeframe intent so captures no longer require hand-authored `phase_annotations` before the parser boundary exists.
- the next executable slice persists engine-generated `search_query_spec` on benchmark-search artifacts by threading it through `PatternBenchmarkSearchConfig` instead of storing it only in capture-local compatibility projections.
- the first live surface bridge stays app-orchestrated: `PatternSeedScout` may build a narrow heuristic `PatternDraft`, but it must persist that draft through engine `/captures`, trigger engine `/captures/{id}/benchmark_search`, and read candidates from engine `/patterns/{slug}/similar-live`.
- app-side capture translation tests must follow the runtime plane contract because runtime is now the canonical terminal capture store.
- this slice preserves the current panel response shape where practical so route truth changes land before broader surface redesign.
- execution branch is `codex/w-0160-pattern-seed-engine-bridge`; unrelated `CURRENT.md` drift is treated as upstream lane movement and should not be folded into the W-0160 merge unit.
- the next work for this contract belongs on top of current mainline or the broader `W-0160-pattern-definition-plane` lane; the seed-bridge extraction itself is already merged.
- the next executable follow-up should cut DOUNI pattern-search turns over to the existing `PatternSeedScout` engine bridge before widening `SearchQuerySpec` propagation further, because removing app-owned raw analysis from live pattern-search turns has the highest product leverage.
- branch split reason for the next follow-up: the merged seed-bridge PR is already closed, so the DOUNI cutover must land as a fresh main-based merge unit on its own execution branch.
- DOUNI pattern-search turns should use a dedicated retrieval tool instead of overloading `check_pattern_status`; status and similar-case retrieval remain separate engine responsibilities even if both tools can be present in one turn.

## Next Steps

1. extend the same `SearchQuerySpec` persistence path to seed-search / other benchmark consumers so they emit the canonical app contract instead of route-local dict payloads.
2. tighten the signal-rule registry and query-spec schema from the current transitional numeric-bound maps into fully versioned shared engine/app contracts.
3. remove the remaining DOUNI parser heuristic drift by replacing the app-side thesis parser with an engine-owned parser ingress when that contract lands.

## Exit Criteria

- additive `pattern_draft` / `parser_meta` persistence exists in app and engine capture contracts.
- engine `QueryTransformer` can convert one canonical `PatternDraft` into a deterministic `SearchQuerySpec`.
- benchmark-pack draft generation can consume `pattern_draft` fallback fields when explicit `phase_annotations` are absent.
- targeted app/engine tests pass for capture contract translation and transformer/build fallback.

## Handoff Checklist

- active work item: `work/active/W-0160-pattern-draft-query-transformer-contract.md`
- branch: `origin/main` baseline merged; follow-up should branch cleanly from current main or `codex/w-0160-pattern-definition-plane`
- verification:
  - `npm --prefix app run test -- src/lib/server/douni/intentClassifier.test.ts src/lib/server/douni/contextBuilder.test.ts src/routes/api/terminal/pattern-seed/match/match.test.ts`
  - `npm --prefix app run test -- src/lib/contracts/terminalPersistence.test.ts src/lib/server/terminalPersistence.capture.test.ts`
  - `npm --prefix app run check`
  - `uv run --project . --group dev python -m pytest tests/test_capture_routes.py -q`
  - `uv run --project . --group dev python -m pytest tests/test_query_transformer.py -q`
  - `uv run --project . --group dev python -m pytest tests/test_pattern_search.py -q`
- remaining blockers: `SearchQuerySpec` still needs broader search-plane adoption, DOUNI still has raw-analysis fan-out to remove, and verdict-driven threshold calibration remains a follow-up slice
