# W-0139 — Terminal Surface Closeout

## Goal

`/terminal` surface 를 fact/search/runtime/agent plane 의 소비자로 얇게 만든다. 현재 slice 는 `TradeMode` 의 outcome submit 과 alpha world-model reads 를 `terminalBackend` helpers 로 이동한다.

## Owner

app

## Primary Change Type

Product surface change

## Scope

- `TradeMode` surface 에 남은 direct data reads 를 단계적으로 `terminalBackend` / plane clients 로 이동
- outcome submit 과 alpha world-model reads 를 surface client helper 로 연결
- `terminalBackend.ts` 를 compatibility surface client shim 으로 유지
- 관련 app tests/check 및 active work item 문서 갱신

## Non-Goals

- legacy `/api/captures` route 삭제
- `TradeMode` 전체 데이터 fetch big-bang rewrite
- `/lab` evaluation activation flow 전체 재설계
- engine pattern runtime/context producer 신규 구현 및 user pattern DSL 확정

## Canonical Files

- `AGENTS.md`
- `work/active/CURRENT.md`
- `work/active/W-0139-terminal-core-loop-capture.md`
- `docs/domains/terminal-ai-scan-architecture.md`
- `docs/product/core-loop.md`
- `docs/product/pages/02-terminal.md`
- `docs/product/core-loop-agent-execution-blueprint.md`
- `app/src/lib/api/terminalBackend.ts`
- `app/src/lib/cogochi/modes/TradeMode.svelte`
- `app/src/lib/contracts/runtime/captures.ts`
- `app/src/routes/api/runtime/[...path]/+server.ts`

## Facts

1. Fact, Search, Runtime, AgentContext 핵심 route/client slices 는 #201-#210 으로 main 에 병합되었다.
2. #211 로 `TradeMode` saved captures strip 은 `/api/runtime/captures` client 로 이동했다.
3. #212 로 `TradeMode` confluence current/history reads 는 `terminalBackend` helpers 로 이동했다.
4. #213 로 `TradeMode` indicator side-fetch `/api/market/*` reads 는 `terminalBackend` helpers 로 이동했다.
5. #214 로 `TradeMode` candle-close analyze refresh 는 `terminalBackend.fetchAnalyze()` 로 이동했다.

## Assumptions

1. 이번 PR 은 outcome submit 과 alpha world-model reads 만 자른다.
2. outcome route 의 response shape 는 `{ saved, count, training_triggered }` 를 따르고 world-model route 는 `{ phases }` payload 를 따른다.

## Open Questions

- W-0139 완료 판정 전에 `TradeMode` 에 direct `fetch(` 호출이 남았는지 확인 필요.
- W-0140 bottom ANALYZE slimming 시작 시점을 W-0139 terminal page data ownership 제거 이후로 둘지 결정 필요.

## Decisions

- outcome submit 은 `terminalBackend.submitTradeOutcome()` 으로 실행한다.
- alpha world-model read 는 `terminalBackend.fetchAlphaWorldModel()` 로 읽는다.
- `terminalBackend.ts` 는 final cleanup 전까지 compatibility surface client shim 으로 유지한다.
- legacy outcome/world-model routes 는 삭제하지 않는다.
- branch split reason: post-agent surface slimming 은 최신 `origin/main` 기준 `codex/w-0139-trademode-action-clients` 에서만 진행한다.

## Next Steps

1. action/world-model helper slice 를 테스트/check 후 PR 로 병합한다.
2. `TradeMode` direct fetch 제거 여부를 확인하고 W-0139 closeout 판정을 업데이트한다.
3. terminal page data ownership 이 제거되면 W-0140 bottom ANALYZE slimming 으로 넘어간다.

## Exit Criteria

- outcome submit 과 alpha world-model reads 는 `terminalBackend` helpers 를 통해 실행하고 `TradeMode` 안에서 direct fetch 하지 않는다.
- `TradeMode` 는 fact/search/runtime 결과만 소비하고 provider/fact composition 을 직접 소유하지 않는다.
- `terminalBackend.ts` 는 surface-facing client shim 으로 남고 route-level product logic 을 추가하지 않는다.
- 관련 app tests/check 가 통과한다.

## Handoff Checklist

- active work item: `work/active/W-0139-terminal-core-loop-capture.md`
- branch: `codex/w-0139-trademode-action-clients`
- verification:
  - `npm --prefix app run test -- src/lib/api/terminalBackend.test.ts`
  - `npm --prefix app run check`
- remaining blockers: remaining `TradeMode` direct market reads, W-0140 bottom ANALYZE surface slimming
