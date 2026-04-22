# W-0134 — Cogochi Runtime Verification + Mobile/AI Repair

## Goal

Cogochi의 TradingView형 chart/analyze/AI shell이 데스크톱과 모바일에서 실제로 동작하도록, 런타임 크래시와 끊긴 UI state를 복구한다.

## Owner

app

## Scope

- `app/src/hooks.server.ts`
- `app/src/lib/server/authGuard.ts`
- `app/src/lib/server/requestIp.ts`
- `app/src/lib/server/analyze/service.ts`
- `app/src/routes/api/captures/chart-annotations/+server.ts`
- selected `app/src/routes/api/chart/*`, `app/src/routes/api/market/*`, `app/src/routes/api/confluence/*`, `app/src/routes/api/cogochi/*`
- `app/src/routes/api/agents/stats/*`

## Non-Goals

- unrelated repo stabilization / worktree cleanup
- indicator archetype redesign
- engine-side Confluence Phase 4 work

## Canonical Files

- `app/src/hooks.server.ts`
- `app/src/lib/server/authGuard.ts`
- `app/src/lib/server/analyze/service.ts`
- `app/src/routes/api/captures/chart-annotations/+server.ts`
- `app/src/routes/api/cogochi/analyze/+server.ts`

## Facts

- root dirty branch `codex/w-0133-noncode-cleanup` 에 runtime diff가 섞여 있어 clean lane 분리가 필요하다.
- `/api/cogochi/analyze`는 engine `/deep`와 `/score`가 모두 실패하면 500을 반환한다.
- stale session cookie 또는 auth hydrate 실패가 hooks 단계에서 `/cogochi` bootstrap을 깨뜨릴 수 있다.
- public read routes 일부는 `getClientAddress()` 직접 호출 때문에 dev/SSR에서 실패할 수 있다.
- `/api/agents/stats/*` 는 클라이언트가 호출하지만 현재 서버 route가 없어 404 noise를 만든다.
- `checkDistributedRateLimit()` 는 Redis와 DB가 모두 없으면 fail-closed로 429를 반환했고, local fallback 구현은 존재하지만 사용되지 않았다.

## Assumptions

- 현재 목표는 shell/read surface를 degraded 200으로 유지하는 runtime 안정화다.
- auth failure 시 null-degrade가 현재 제품 요구에 맞다.

## Open Questions

- 없음

## Decisions

- runtime repair는 `origin/main@6fa020b0` 기반 dedicated worktree에서만 진행한다.
- root W-0133 lane에는 runtime code를 남기지 않고 docs/non-code만 유지한다.
- read-only routes는 dev/runtime bootstrap을 위해 public 또는 degraded 응답을 우선한다.

## Next Steps

1. commit / push / PR 생성 후 root lane의 mixed runtime diff를 폐기 또는 별도 분리한다.

## Branch

- execution branch: `codex/w-0134-runtime-stabilization`
- base: `origin/main` (`6fa020b0`)
- branch-split reason: root worktree의 W-0133 docs/non-code lane에 runtime diff가 섞여 있어 clean verification lane으로 분리 유지해야 한다.

## Exit Criteria

- [x] `/cogochi`가 stale session cookie 또는 dev DB timeout 때문에 500을 내지 않는다.
- [x] `/api/cogochi/analyze?symbol=BTCUSDT&tf=4h`가 degraded라도 200을 반환한다.
- [x] Cogochi 초기 fetch graph가 `getClientAddress()` 예외 없이 로드된다.
- [x] `/api/agents/stats/*` 404 noise가 사라진다.
- [x] `npm run check`
- [x] `npm run build`

## Handoff Checklist

- [x] 수정 파일과 verification 결과를 CURRENT 또는 최종 보고에 반영
- [x] dirty worktree의 unrelated 변경은 건드리지 않음
- [x] dedicated worktree `/Users/ej/Projects/wtd-v2/.codex/worktrees/w-0134-runtime-stabilization` 에서 후속 실행
