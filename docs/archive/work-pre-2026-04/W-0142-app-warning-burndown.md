# W-0142 — App Warning Burn-Down

## Goal

`app` 의 Svelte warning budget 을 구조적으로 줄여서 hydration / a11y / invalid markup 리스크를 먼저 제거하고,
이후 W-0139 / W-0141 / W-0122 surface 작업이 noise 없이 검증되도록 만든다.

## Owner

app

## Primary Change Type

Product surface change

## Scope

- `npm --prefix app run check` 기준 warning inventory 정리
- invalid self-closing markup, nested interactive structure, deprecated slot usage 정리
- clickable static element / keyboard access / role 누락 등 a11y interaction 경고 정리
- dead CSS selector 제거 또는 실제 렌더 경계로 재배치
- warning burn-down 진행 중 work item / CURRENT 문서 동기화

## Non-Goals

- Cogochi IA / product flow 재설계
- W-0139 manual QA 자체 수행
- engine runtime / infra 변경
- protocol whitepaper / product strategy 문서 작성

## Canonical Files

- `AGENTS.md`
- `work/active/CURRENT.md`
- `work/active/W-0142-app-warning-burndown.md`
- `app/src/lib/cogochi/CommandPalette.svelte`
- `app/src/lib/cogochi/CommandBar.svelte`
- `app/src/lib/cogochi/TabBar.svelte`
- `app/src/lib/cogochi/AppShell.svelte`
- `app/src/lib/cogochi/Splitter.svelte`
- `app/src/lib/cogochi/WorkspacePresetPicker.svelte`
- `app/src/lib/cogochi/modes/TradeMode.svelte`
- `app/src/components/terminal/chart/CaptureReviewDrawer.svelte`
- `app/src/components/terminal/workspace/IndicatorPaneStack.svelte`
- `app/src/components/terminal/peek/PeekDrawer.svelte`
- `app/src/routes/dashboard/+page.svelte`

## Facts

1. 현재 `npm --prefix app run check -- --fail-on-warnings false` 결과는 `0 errors, 111 warnings in 28 files` 이다.
2. warning 의 큰 묶음은 `css_unused_selector`, `element_invalid_self_closing_tag`, `a11y_* static interaction`, `slot_element_deprecated` 로 나뉜다.
3. `TradeMode.svelte` 와 `cogochi/*` shell 컴포넌트가 warning 볼륨의 대부분을 차지하고, 이 경고들은 제품 기능 추가보다 먼저 줄여야 추후 surface 회귀 판별이 쉬워진다.
4. W-0126 운영 cutover 와 W-0139 feature PR 은 이미 mainline 에 merge 되었고, 현재 로컬 `codex/w-0139-terminal-core-loop-capture` worktree 는 unrelated docs 변경이 섞여 있어 warning 정리 lane 으로 재사용하면 안 된다.
5. invalid self-closing tag, nested button, deprecated slot 같은 경고는 스타일 취향 문제가 아니라 SSR / hydration / accessibility 리스크와 직접 연결된다.

## Assumptions

1. warning burn-down 은 한 번에 111개를 없애기보다, 구조적 리스크가 큰 묶음부터 PR 단위로 줄이는 편이 안전하다.
2. dead CSS 제거는 UI screenshot / manual QA 없이 대량 삭제하지 않고, 실제 렌더 경계 확인 후 나눠서 처리한다.

## Open Questions

- `TradeMode.svelte` 의 unused selector 묶음을 단순 제거할지, 아니면 subview split 이후 CSS locality 정리와 함께 없앨지 결정이 필요하다.

## Decisions

- warning burn-down 은 fresh `origin/main` 기반 별도 branch/worktree (`codex/w-0142-warning-burndown`) 에서 수행한다.
- 1차는 invalid markup / deprecated slot / hydration mismatch / state reference 경고를 먼저 처리한다.
- 2차는 keyboard access 와 role 누락 같은 a11y interaction 경고를 정리한다.
- 3차는 dead CSS selector 를 terminal 소형 컴포넌트부터 줄이고, `TradeMode.svelte` 대량 unused selector 는 분리된 후속 slice 로 다룬다.
- warning budget 개선은 가능한 한 기능 변경 없이 markup / interaction contract 정리로 해결한다.

## Next Steps

1. warning 을 `markup-hydration`, `a11y-interaction`, `dead-css` 세 lane 으로 분류하고 1차 대상 파일을 확정한다.
2. 1차 PR 에서 self-closing non-void, nested button, slot deprecated, local state capture 경고를 제거한다.
3. `npm --prefix app run check` 를 재실행해 warning 감소폭을 기록한다.

## Exit Criteria

- 1차 structural warning 묶음이 제거되어 hydration / invalid markup 리스크가 눈에 띄게 감소한다.
- warning 정리 작업이 dirty feature branch 와 분리된 clean lane 에서 진행된다.
- warning inventory 와 다음 우선순위가 work item / CURRENT 에 반영된다.

## Handoff Checklist

- active work item: `work/active/W-0142-app-warning-burndown.md`
- branch: `codex/w-0142-warning-burndown`
- verification:
  - `npm --prefix app run check -- --fail-on-warnings false`
- remaining blockers:
  - structural warning 1차 묶음 미처리
  - a11y interaction 묶음 미처리
  - `TradeMode.svelte` dead CSS 대량 정리 미처리
