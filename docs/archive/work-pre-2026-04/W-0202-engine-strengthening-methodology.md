# W-0202 — Engine Strengthening Methodology

## Goal

Core loop proof 이후 엔진을 강화하는 5개 축(feature truth, sequence truth, search quality, negative memory, promotion gate)을 실행 가능한 domain methodology로 구체화한다.

## Owner

research

## Primary Change Type

Research or eval change

## Scope

- `docs/domains/engine-strengthening-methodology.md` 신규 작성
- 5개 강화 축별 purpose, inputs, outputs, rules, metrics, failure modes, first slice 정의
- Pattern Wiki Compiler와 기존 parser/search/runtime/refinement docs 사이의 연결 강화
- `CURRENT.md`에 active design lane 등록

## Non-Goals

- engine implementation
- app implementation
- database migration
- model training implementation
- signal publishing implementation

## Canonical Files

- `AGENTS.md`
- `work/active/CURRENT.md`
- `work/active/W-0202-engine-strengthening-methodology.md`
- `docs/domains/engine-strengthening-methodology.md`
- `docs/domains/pattern-wiki-compiler.md`
- `docs/domains/pattern-draft-query-transformer.md`
- `docs/domains/canonical-indicator-materialization.md`
- `docs/domains/pattern-engine-runtime.md`
- `docs/domains/multi-timeframe-autoresearch-search.md`
- `docs/domains/refinement-methodology.md`

## Facts

1. Core loop proof is complete enough to shift the next design question from surface wiring to engine quality.
2. Existing docs already define feature materialization, parser/search contracts, runtime state gaps, multi-timeframe search, and refinement methodology.
3. The engine strengthening method needs a single document that ties those docs into implementation order and promotion gates.
4. Pattern Wiki Compiler is the new upstream memory/compiler layer, but it is not engine truth.
5. Negative cases and promotion packs are required to prevent search and runtime changes from overfitting to winner examples.

## Assumptions

1. TRADOOR/PTB OI reversal remains the first reference pattern family.
2. First implementation remains file/SQLite-backed where possible before shared DB migration.
3. Reranker and LLM judge should stay downstream of feature/sequence/search artifact quality.

## Open Questions

- Should promotion pack artifacts be markdown-first, JSON-first, or both?
- Should negative-set records land first in Pattern Wiki files or in engine ledger storage?
- What minimum benchmark pack size is acceptable before `visible_ungated` runtime surfacing?

## Decisions

- Engine strengthening is defined as reproducibility, reject-awareness, and promotion safety, not model size or prompt quality.
- Feature truth and sequence truth must precede reranker promotion.
- LLM judge remains explanation-only and cannot become ranking truth.
- Negative cases are first-class artifacts in benchmark, training, and refinement workflows.
- Runtime promotion requires a complete promotion pack with rollback rules.

## Next Steps

1. Create Pattern Wiki skeleton and TRADOOR/PTB first pages.
2. Start FeatureWindowStore search cutover as the first engine implementation slice.
3. Build TRADOOR/PTB benchmark pack with positive and negative cases for Stage 1+2 search evaluation.

## Exit Criteria

- Engine strengthening domain doc exists and covers all 5 pillars.
- Each pillar includes concrete artifacts, metrics, failure modes, and first slice.
- CURRENT lists W-0202 as active design work.
- Adjacent docs link to the methodology without expanding implementation scope.

## Handoff Checklist

- active work item: `work/active/W-0202-engine-strengthening-methodology.md`
- active branch: `claude/arch-improvements-0425`
- verification: docs-only review; no engine/app tests required
- remaining blockers: implementation slices remain separate work items
