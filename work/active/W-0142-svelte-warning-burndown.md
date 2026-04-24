# W-0142 — Svelte Warning Burndown

## Goal

`app/` 기준 `npm run check` 에서 발생하는 모든 `svelte-check` warning 을 제거해, warning-free baseline 을 만든다.

## Owner

app

## Primary Change Type

Product surface change

## Scope

- `svelte-check` 가 보고하는 111개 pre-existing warning 제거
- deprecated slot usage, self-closing non-void tags, a11y click/role 경고, unused CSS selector 정리
- warning 제거 후 `npm run check` green baseline 확보

## Non-Goals

- feature behavior 변경
- visual redesign
- engine / contract semantics 변경

## Canonical Files

- `AGENTS.md`
- `work/active/CURRENT.md`
- `work/active/W-0142-svelte-warning-burndown.md`
- `app/src/components/terminal/**`
- `app/src/lib/cogochi/**`
- `app/src/routes/**`

## Facts

1. baseline 은 `npm --prefix app run check` 기준 `0 errors / 111 warnings` 였고, 모두 `app/` surface 에서 발생했다.
2. warning 분포는 `terminal`, `cogochi`, 일부 route/component 전반에 걸쳐 있었고, unused CSS / self-closing non-void / slot deprecation / a11y 경고가 대부분이었다.
3. warning cleanup 후 현재 `npm --prefix app run check` 결과는 `0 errors / 0 warnings` 이다.
4. 수정은 feature semantics 를 바꾸지 않고, snippet migration / a11y semantics / dead CSS 제거 / prop/state hygiene 정리에 한정했다.
5. W-0139 multi-range capture 패치는 별도 커밋으로 고정되었고, warning 정리는 별도 worktree/branch 에서 진행했다.

## Assumptions

1. warning 제거 과정에서 사용자-visible behavior 는 유지한다.
2. unused CSS selector 는 실제 markup 에서 더 이상 참조되지 않는 경우 삭제가 안전하다.

## Open Questions

- 없음

## Decisions

- warning burn-down 은 feature patch 와 분리된 별도 execution unit으로 진행한다.
- 수정은 warning category 단위로 batch 처리하고, 각 batch 후 `npm run check` 를 다시 돌린다.
- warning-free baseline 확보 전에는 merge 를 진행하지 않는다.
- clickable static element 는 가능한 `button`/snippet/semantic role 로 정리하고, nested button 은 wrapper semantics 로 푼다.
- `TradeMode` 의 unused CSS 는 살아있는 markup 참조를 재도입하지 않고 삭제한다.

## Next Steps

1. warning cleanup change set 을 scoped commit 으로 고정한다.
2. 필요하면 branch push 후 별도 PR 로 merge 한다.

## Exit Criteria

- `npm --prefix app run check` 결과가 `0 errors / 0 warnings` 이다.
- warning 제거를 위해 feature behavior regressions 를 넣지 않는다.
- warning cleanup change set 이 별도 커밋/PR 로 정리된다.

## Handoff Checklist

- active work item: `work/active/W-0142-svelte-warning-burndown.md`
- branch: `codex/w-0142-svelte-warning-burndown`
- verification:
  - `npm --prefix app run check`
- remaining blockers: 없음
