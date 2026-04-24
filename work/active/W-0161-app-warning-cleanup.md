# W-0161 — App Warning Cleanup

## Goal

`npm --prefix app run check` 기준 app warning을 구조적으로 줄여서, 이후 surface lane에서 warning noise 없이 실제 회귀만 보이게 만든다.

## Owner

app

## Primary Change Type

Product surface change

## Scope

- clean worktree에서 app check warning baseline 재수집
- warning type/file 분포 정리
- self-closing non-void tag warning 정리
- deprecated `<slot>` usage 정리
- obvious unused selector warning 정리
- warning fix 이후 app check 재검증

## Non-Goals

- engine logic 변경
- 새로운 product feature 추가
- broad visual redesign
- warning suppression 추가만으로 종료

## Canonical Files

- `AGENTS.md`
- `work/active/CURRENT.md`
- `work/active/W-0161-app-warning-cleanup.md`
- `app/package.json`
- `app/src/components/terminal/workspace/IndicatorPaneStack.svelte`
- `app/src/components/terminal/peek/PeekDrawer.svelte`
- `app/src/components/terminal/workspace/TerminalCommandBar.svelte`
- `app/src/components/terminal/workspace/TerminalContextPanel.svelte`
- `app/src/lib/cogochi/modes/TradeMode.svelte`

## Facts

1. this lane starts from `main@8e914f76` after W-0159 merged.
2. the clean-worktree baseline was `svelte-check found 0 errors and 111 warnings`.
3. the highest-yield warning family is self-closing non-void tags, followed by deprecated `<slot>` usage and many single-instance unused CSS selectors.
4. `TradeMode.svelte` alone accounts for `48` warnings, but many smaller files can be cleaned with low-risk syntax-only edits first.
5. the current branch result is `svelte-check found 0 errors and 0 warnings`.

## Assumptions

1. a first pass can materially reduce warnings without changing runtime behavior.

## Open Questions

- none.

## Decisions

- warning cleanup runs as a standalone app lane, not inside `W-0160` or an engine work item.
- prefer removing dead code or updating syntax over suppressing warnings.
- first cleanup slice targets syntax-only and obviously dead-code warnings before deeper accessibility/layout refactors.

## Next Steps

1. commit the warning cleanup lane on `codex/w-0161-app-warning-cleanup`.
2. merge or stack this app hygiene branch as a clean follow-up unit when requested.

## Exit Criteria

- [x] `npm --prefix app run check` warning count is materially reduced from the baseline.
- [x] touched components keep existing behavior and compile cleanly.
- [x] any intentionally deferred warning families are documented.

## Handoff Checklist

- active work item: `work/active/W-0161-app-warning-cleanup.md`
- branch: `codex/w-0161-app-warning-cleanup`
- verification:
  - `npm --prefix app run check`
- remaining blockers: none
