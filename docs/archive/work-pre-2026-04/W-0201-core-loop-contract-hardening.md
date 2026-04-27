# W-0201 — Core Loop Contract Hardening

## Goal

`origin/main` 기준 core loop가 끊기지 않도록 `/search/similar` app proxy, PatternSeedScout judge run identity, PatternDraft → SearchQuerySpec engine transform contract, search response stage metadata를 정렬한다.

## Owner

contract

## Primary Change Type

Contract change

## Scope

- app search plane proxy가 canonical `/search/similar`, `/search/similar/{run_id}`, `/search/quality/judge`, `/search/quality/stats`를 통과시킨다.
- PatternSeedScout match response에 canonical `seed.runId`를 노출하고 judge route가 이 run id를 사용한다.
- engine-owned reusable PatternDraft / ParserMeta schema module을 만들고 captures/search routes가 공유한다.
- engine route로 PatternDraft → SearchQuerySpec deterministic transform을 노출한다.
- `/search/similar` 응답에 stage/layer visibility metadata를 추가한다.
- targeted app/engine tests를 추가한다.

## Non-Goals

- LLM PatternDraft parser endpoint 구현
- Visualization 6 intent × 6 template router 구현
- Signal Publishing Pipeline 구현
- PersonalVariant DB/table 구현
- app legacy market provider fan-out 전면 제거

## Canonical Files

- `AGENTS.md`
- `work/active/CURRENT.md`
- `work/active/W-0201-core-loop-contract-hardening.md`
- `docs/domains/pattern-draft-query-transformer.md`
- `docs/domains/terminal-ai-scan-architecture.md`
- `app/src/lib/server/enginePlaneProxy.ts`
- `app/src/lib/server/patternSeed/match.ts`
- `app/src/components/terminal/workspace/PatternSeedScoutPanel.svelte`
- `engine/api/routes/captures.py`
- `engine/api/routes/search.py`
- `engine/research/query_transformer.py`
- `engine/search/similar.py`
- `engine/tests/test_search_routes.py`
- `engine/tests/test_capture_routes.py`

## Facts

1. `engine/api/routes/search.py` already exposes `POST /search/similar`, `GET /search/similar/{run_id}`, and `/search/quality/*`, but the app search plane proxy only allows catalog/scan/seed.
2. `PatternSeedScoutPanel.svelte` reads `body.seed?.runId`, while `patternSeed/match.ts` currently exposes `researchRunId`, so quality judge can lose the canonical similar-search run id.
3. PatternDraft schemas already exist in both app contracts and `engine/api/routes/captures.py`, but engine has no shared PatternDraft schema module.
4. `engine/research/query_transformer.py` already implements deterministic `transform_pattern_draft`, so the route work is contract exposure, not new parser logic.
5. `/search/similar` already has 3-layer search and quality ledger wiring; this slice only makes stage visibility explicit and keeps legacy similar-live as fallback.

## Assumptions

1. `seed.runId` should refer to the canonical `/search/similar` run id when available.
2. `researchRunId` remains as backward-compatible alias for old callers during rollout.
3. `/search/query-spec/transform` is the canonical engine route for PatternDraft → SearchQuerySpec.

## Open Questions

- Whether later LLM parser should live under `/patterns/parse` or `/runtime/pattern-drafts/parse`.

## Decisions

- This slice is contract-hardening only: no new LLM parser, no UI redesign, and only additive SQLite metadata persistence for similar runs.
- App proxy allows canonical search read/write routes but does not add new app-side search semantics.
- Shared engine PatternDraft schema will be snake_case and compatible with existing capture payloads.
- Similar search stage metadata is additive, persisted with runs, and backward-compatible.

## Next Steps

1. Review final diff for PR scope.
2. Optional terminal integration smoke before merge.

## Exit Criteria

- `/api/search/similar` and `/api/search/similar/{run_id}` pass through the app proxy.
- PatternSeedScout judge posts a non-empty canonical similar-search `runId`.
- engine exposes a tested deterministic PatternDraft → SearchQuerySpec transform route.
- `/search/similar` responses include stage/layer metadata without breaking existing clients.
- targeted app and engine tests pass.

## Handoff Checklist

- active work item: `work/active/W-0201-core-loop-contract-hardening.md`
- branch: `codex/w-0201-core-loop-contract-hardening`
- worktree: `/tmp/wtd-v2-w0201-contract-hardening`
- verification: `uv run pytest tests/test_search_routes.py tests/test_similar_search.py`; `npm run test -- src/lib/server/enginePlaneProxy.test.ts src/routes/api/terminal/pattern-seed/match/match.test.ts src/routes/api/terminal/pattern-seed/judge/judge.test.ts`; `npm run contract:check:engine-types`; `npm run check`
- remaining blockers: none known
