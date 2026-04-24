# W-0140 — Analyze Tab Consolidation

## Goal

하단 `ANALYZE` 탭을 오른쪽 sidebar summary HUD와 역할이 명확히 다르게 유지하되, 실제 렌더링도 `workspaceEnvelope` 기반으로 정렬해서 surface 안의 중복 data shaping 을 줄인다. 현재 slice 는 thesis / evidence / execution board 를 `workspaceDataPlane` 계약에서 읽도록 전환한다.

## Owner

app

## Primary Change Type

Product surface change

## Scope

- `TradeMode.svelte` bottom `ANALYZE` 에서 local raw derivation 대신 `workspaceEnvelope` / `workspaceStudyMap` 우선 소비
- thesis / evidence / execution board 를 workspace studies 로 재배선
- 관련 work item 문서와 app check 갱신

## Non-Goals

- indicator 데이터/API 추가
- mobile analyze panel 재설계
- scan/judge 정보 구조 변경
- `workspaceDataPlane.ts` 전체 재설계 또는 generic component 대규모 도입

## Canonical Files

- `AGENTS.md`
- `work/active/CURRENT.md`
- `work/active/W-0140-analyze-tab-consolidation.md`
- `docs/domains/terminal-ai-scan-architecture.md`
- `app/src/lib/cogochi/modes/TradeMode.svelte`
- `app/src/lib/cogochi/workspaceDataPlane.ts`

## Facts

- `workspaceDataPlane.ts` 는 이미 `summary-hud`, `detail-workspace`, `evidence-log`, `execution-board` section 과 study summaries 를 만든다.
- `TradeMode.svelte` 의 analyze-adjacent surfaces 는 이제 `analyzeDetail*`, `analyzeEvidenceItems`, `analyzeExecutionProposal` 를 재사용하고, degrade fallback 도 최종 consumer 안으로 inline 됐다.
- `W-0139`는 #216까지 merge 되었고 terminal surface direct `fetch(` audit 은 clean 하다.
- 현재 남은 구조 문제는 fetch 가 아니라 analyze-adjacent surface 들의 contract duplication 이었고, 이 slice 기준으로 `TradeMode` 내부의 별도 raw analyze builder 는 제거됐다.

## Assumptions

1. 하단 `ANALYZE`에는 summary 재복제보다 sectioned detail workspace가 더 적합하다.
2. 이번 slice 는 generic renderer 도입보다 기존 markup 을 유지한 채 data source 만 `workspaceEnvelope`로 바꾸는 편이 리스크가 낮다.

## Open Questions

- execution board 전체를 generic study renderer 로 바꿀지는 후속 slice 로 미룬다.

## Decisions

- 하단 `ANALYZE`는 `detail workspace`로 명시한다.
- thesis / evidence / execution board 는 먼저 `workspaceEnvelope` / `workspaceStudyMap` 에서 읽는다.
- 기존 markup 은 유지하고 raw local derivation 만 줄이는 strangler 방식으로 간다.
- execution 관련 CTA는 하단 panel에서 `SCAN`/`JUDGE`로 점프 가능하게 둔다.

## Next Steps

1. `W-0140` closeout branch 를 PR 단위로 정리한다.
2. merge 후 `CURRENT.md`에서 `W-0140`를 complete lane 으로 내린다.
3. 다음 execution lane 은 `W-0122` 또는 `W-0148`로 재집중한다.

## Exit Criteria

- mobile ANALYZE, peek bar, compact summary, judge preview 가 `analyzeDetail*` / workspace-derived proposal/evidence 를 재사용한다.
- `TradeMode` 안의 analyze-adjacent duplicated raw derivation 소비가 줄어든다.
- `TradeMode` 안의 별도 analyze fallback builders 가 최종 consumer 내부 degrade path 로 접힌다.
- `npm --prefix app run check`가 0 error로 통과한다.

## Handoff Checklist

- active work item: `work/active/W-0140-analyze-tab-consolidation.md`
- branch: `codex/w-0140-analyze-surface-align-v2`
- verification: `npm --prefix app run check`
- blockers: none for code; branch review/merge only
