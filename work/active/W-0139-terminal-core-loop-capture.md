# W-0139 — Terminal Surface Closeout

## Goal

`/terminal` surface 를 fact/search/runtime/agent plane 의 소비자로 얇게 만든다. 현재 slice 는 `TradeMode` 의 최근 saved captures read 를 legacy `/api/captures` 에서 runtime plane client 로 이동한다.

## Owner

app

## Primary Change Type

Product surface change

## Scope

- `TradeMode` surface 에 남은 direct data reads 를 단계적으로 `terminalBackend` / plane clients 로 이동
- saved captures strip 을 runtime plane read model 로 연결
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
2. runtime plane 은 `/api/runtime/captures` 를 통해 capture list/read 를 제공한다.
3. `TradeMode` 의 saved strip 은 surface 영역이므로 workflow state 를 직접 소유하지 않고 runtime plane read model 을 소비해야 한다.
4. `terminalBackend.ts` 는 surface compatibility shim 으로 남아 있고, 이번 slice 에서 runtime captures client 를 추가한다.
5. legacy `/api/captures` 는 삭제하지 않고 compatibility route 로 유지한다.

## Assumptions

1. 이번 PR 은 recent captures read 만 자르고, `TradeMode` 의 다른 market/fact reads 는 다음 slice 로 남긴다.
2. runtime plane list payload 는 app contract `RuntimeCaptureListResponse` 를 따른다.

## Open Questions

- 다음 slice 에서 `TradeMode` 의 direct `/api/market/*` reads 를 어떤 묶음으로 먼저 자를지 결정 필요.
- W-0140 bottom ANALYZE slimming 시작 시점을 W-0139 terminal page data ownership 제거 이후로 둘지 결정 필요.

## Decisions

- recent captures 는 `terminalBackend.fetchRecentCaptures()` 를 통해 `/api/runtime/captures` 에서 읽는다.
- `TradeMode` 는 runtime response shape 를 직접 만들지 않고 `RecentCaptureSummary` 타입만 소비한다.
- `terminalBackend.ts` 는 final cleanup 전까지 compatibility surface client shim 으로 유지한다.
- legacy `/api/captures` route 는 삭제하지 않는다.
- branch split reason: post-agent surface slimming 은 최신 `origin/main` 기준 `codex/w-0139-surface-closeout` 에서만 진행한다.

## Next Steps

1. recent captures runtime client slice 를 테스트/check 후 PR 로 병합한다.
2. `TradeMode` 의 direct `/api/market/*` reads 를 묶음별로 inventory 하고 다음 surface client slice 를 연다.
3. terminal page data ownership 이 제거되면 W-0140 bottom ANALYZE slimming 으로 넘어간다.

## Exit Criteria

- saved captures strip 은 `/api/runtime/captures` 를 통해 읽고 legacy `/api/captures?limit=...` 를 직접 호출하지 않는다.
- `TradeMode` 는 fact/search/runtime 결과만 소비하고 provider/fact composition 을 직접 소유하지 않는다.
- `terminalBackend.ts` 는 surface-facing client shim 으로 남고 route-level product logic 을 추가하지 않는다.
- 관련 app tests/check 가 통과한다.

## Handoff Checklist

- active work item: `work/active/W-0139-terminal-core-loop-capture.md`
- branch: `codex/w-0139-surface-closeout`
- verification:
  - `npm --prefix app run test -- src/lib/api/terminalBackend.test.ts`
  - `npm --prefix app run check`
- remaining blockers: remaining `TradeMode` direct market reads, W-0140 bottom ANALYZE surface slimming
