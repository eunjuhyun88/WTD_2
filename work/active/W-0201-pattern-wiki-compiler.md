# W-0201 — Pattern Wiki Compiler

## Goal

Karpathy-style LLM Wiki 운영 패턴을 Cogochi에 맞게 `Pattern Wiki Compiler`로 도입해, raw trader memory를 engine-verifiable `PatternDraft`, `SearchQuerySpec`, `BenchmarkPack`, `NegativeSet` 후보로 컴파일하는 설계 기준을 고정한다.

## Owner

research

## Primary Change Type

Research or eval change

## Scope

- `docs/domains/pattern-wiki-compiler.md` 신규 작성
- Pattern Wiki가 `PatternDraft / QueryTransformer / Search / Ledger` 앞단에 들어가는 위치 정의
- wiki page schema, ingest/compile/verify/lint workflow, first slice 기준 정의
- 기존 parser/refinement domain docs에 Pattern Wiki Compiler 연결점 추가

## Non-Goals

- engine code implementation
- app UI implementation
- vector DB, graph DB, or Obsidian automation
- runtime pattern promotion

## Canonical Files

- `AGENTS.md`
- `work/active/CURRENT.md`
- `work/active/W-0201-pattern-wiki-compiler.md`
- `docs/domains/pattern-wiki-compiler.md`
- `docs/domains/pattern-draft-query-transformer.md`
- `docs/domains/refinement-methodology.md`
- `docs/product/core-loop-system-spec.md`

## Facts

1. Karpathy-style LLM Wiki separates immutable raw sources, LLM-maintained synthesis, and structured schema/operations.
2. Cogochi already treats `engine/` as backend truth and LLM output as hypothesis, not market truth.
3. Existing parser/search docs define `PatternDraft -> QueryTransformer -> SearchQuerySpec -> seed search / benchmark / ledger`.
4. Current core loop has capture and similar-search proof, but no durable file-backed pattern memory compiler.
5. TRADOOR/PTB OI reversal is the correct first pattern family for a bounded wiki compiler slice.

## Assumptions

1. First implementation should be markdown + strict schema + engine verification, not a graph/vector system.
2. `research/pattern_wiki/` is the right home for mutable research memory because it is neither canonical docs nor engine truth.
3. Negative cases must be first-class wiki pages because they feed search/reranker quality.

## Open Questions

- Should compiled artifacts be committed JSON files first, or generated on demand by a CLI once implementation starts?
- Should screenshots live in `research/pattern_wiki/raw/screenshots/` or only be referenced from capture records/object storage?

## Decisions

- Pattern Wiki is a compiler front-end, not a source of truth.
- Engine verification is required before any wiki claim can become runtime/promotion truth.
- First slice is TRADOOR/PTB only and must produce both positive reference cases and negative cases.
- Wiki lint is part of the design, not optional cleanup.

## Next Steps

1. Create the first `research/pattern_wiki/` skeleton with `AGENTS.md`, `wiki/index.md`, and `wiki/log.md`.
2. Compile TRADOOR/PTB OI reversal into one `PatternDraft` and one benchmark-pack candidate.
3. Add a lint script or checklist that rejects unknown signals, missing cases, stale compiled artifacts, and unsupported claims.

## Exit Criteria

- `docs/domains/pattern-wiki-compiler.md` exists and defines layer model, page schemas, workflow, lint, and promotion rules.
- `pattern-draft-query-transformer` doc explains that Pattern Wiki is an optional upstream compiler layer.
- `refinement-methodology` doc references Pattern Wiki as research memory input/output, without giving it promotion authority.
- CURRENT lists this work item as the active design lane.

## Handoff Checklist

- active work item: `work/active/W-0201-pattern-wiki-compiler.md`
- active branch: `claude/arch-improvements-0425`
- verification: docs-only review; no engine/app tests required
- remaining blockers: implementation skeleton and TRADOOR/PTB first compiled artifacts remain future work
