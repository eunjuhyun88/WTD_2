# W-0135 — `claude/gifted-raman` Integration Plan

## Goal

`claude/gifted-raman` 에서 진행된 terminal/indicator/real-data 작업을 현재 app surface에 안전하게 통합하되, 이미 현재 작업트리에서 진행 중인 runtime fix(W-0134)와 충돌하지 않게 merge unit을 재구성한다.

## Owner

app

## Scope

- `claude/gifted-raman` 변경을 `clean import` / `manual merge` / `follow-up verify` 로 분해
- 현재 dirty tree와 겹치는 파일별 통합 원칙 정의
- desktop/mobile/authenticated verification 기준 정의

## Non-Goals

- 이번 work item에서 copy trading, Arkham 실데이터, paid API 연동까지 완료
- `main` 전체 rebase 또는 unrelated repo cleanup 동시 수행
- 한 번의 raw git merge 로 모든 충돌을 억지 해소

## Canonical Files

- `AGENTS.md`
- `work/active/CURRENT.md`
- `work/active/W-0134-cogochi-runtime-verification.md`
- `work/active/W-0135-gifted-raman-integration.md`
- `docs/product/indicator-visual-design-v2.md`
- `app/src/lib/cogochi/modes/TradeMode.svelte`
- `app/src/components/terminal/workspace/ChartBoard.svelte`
- `app/src/lib/cogochi/AIPanel.svelte`
- `app/src/lib/indicators/adapter.ts`
- `app/src/routes/api/captures/+server.ts`

## Facts

- `claude/gifted-raman` 는 merge-base 이후 8개 커밋을 포함하고, 핵심은 W-0123 slice α/β/γ, funding sub-pane default, analyzed gate 제거, mock→real data 치환이다.
- 현재 브랜치 작업트리는 dirty 상태이며 `ChartBoard.svelte`, `AIPanel.svelte`, `TradeMode.svelte`, `CaptureAnnotationLayer.svelte`, `analyze/service.ts`, `chartIndicators.ts`, `mobileMode.ts` 가 source branch와 겹친다.
- source branch diff 중 상당수 파일은 현재 로컬에서 직접 수정되지 않았기 때문에 clean import 대상이다 (`AppShell`, `CommandBar`, `CommandPalette`, `IndicatorSettingsSheet`, `IndicatorCurve/Sankey/Histogram/Timeline`, `IndicatorPane`, `IndicatorRenderer`, `registry`, `types`, `search`, `api/captures`, docs).
- user가 붙여 준 실행 로그상 source branch는 “완료”를 주장하지만, 인증된 `/cogochi` 환경에서 desktop/mobile end-to-end smoke는 아직 재검증되지 않았다.
- real-data 전환은 일부만 완료됐다: funding term structure, captures list, world-model count는 실데이터 경로가 있으나 H/J archetype, 일부 sparkline은 여전히 external dependency 또는 synthetic fallback에 의존한다.
- `origin/main` 은 이미 PR #175 를 통해 `claude/gifted-raman` 본체를 포함하고 있고, 현재 source branch에서 `main` 에 없는 변경은 로컬 후속 1커밋(`5d83afe4`)뿐이다.

## Assumptions

- 현재 사용자가 원하는 것은 “지금 브랜치에 raw merge”보다 “gifted-raman의 유효한 작업을 현재 런타임 fix 위에 재통합”하는 것이다.
- default layout(C vs D), derivatives overlay semantics 같은 UX 정책은 통합 과정에서 명시 결정이 필요하다.

## Open Questions

- 통합 기본 레이아웃을 `C SIDEBAR` 로 확정할지, 최근 runtime fix에서 되돌린 `D PEEK` 를 유지할지 최종 제품 우선순위가 필요하다.
- `derivatives` 와 `derivativesOverlay` 를 분리 유지할지, source branch처럼 sub-pane default 단일 의미로 단순화할지 결정 필요.
- authenticated smoke를 위해 로컬 개발 세션에서 `/cogochi` 인증 우회를 둘지, 실제 로그인 세션으로 검증할지 운영 방식 확인 필요.

## Decisions

- raw `git merge claude/gifted-raman` 는 현재 dirty tree와 겹치는 파일이 많아 사용하지 않는다.
- 통합은 3개 lane으로 나눈다: `clean import`, `manual merge`, `verify/fix`.
- `gifted-raman` 의 “완료” 주장도 그대로 믿지 않고, 실제데이터/AI tab/mobile interaction은 authenticated smoke 기준으로 다시 확인한다.
- 실행 브랜치는 `main` 기준 신규 follow-up 브랜치로 만들고, source branch의 로컬 후속 커밋 `5d83afe4` 만 cherry-pick 한다.

## Next Steps

1. `main` 기준 clean worktree에서 follow-up 브랜치를 생성하고 `5d83afe4` 를 cherry-pick 한다.
2. cherry-pick 결과 기준으로 app 정적 검사를 다시 돌려 회귀를 확인한다.
3. desktop/mobile/authenticated verification matrix를 실행하고, 깨지는 interaction을 후속 fix lane으로 정리한다.

## Exit Criteria

- `claude/gifted-raman` 의 non-overlap 파일이 현재 브랜치에 반영된다.
- overlap 8개 파일에 대해 source 기능(실데이터, AI search, sub-pane default, runtime fixes)과 현재 로컬 수정이 함께 살아남는다.
- `/cogochi` 에서 desktop/mobile 기준 AI 탭, quick pick, indicator search, funding sub-pane, real captures strip, analyze fallback이 실제로 동작한다.
- 머지 후 verification 결과와 잔여 stub/H/J dependency가 명확히 기록된다.

## Handoff Checklist

- source branch unique commit list 기록
- clean import vs manual merge 파일 목록 기록
- verification precondition(auth/session) 기록
- 남은 external dependency(H/J, sparkline) 기록
