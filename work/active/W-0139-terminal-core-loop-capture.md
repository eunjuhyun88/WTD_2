# W-0139 — Terminal Surface Closeout

## Goal

`/terminal` surface 를 fact/search/runtime/agent plane 의 소비자로 얇게 만든다. 현재 slice 는 terminal page review inbox count direct fetch 를 `terminalBackend` helper 로 이동한다.

## Owner

app

## Primary Change Type

Product surface change

## Scope

- `TradeMode` surface 에 남은 direct data reads 를 단계적으로 `terminalBackend` / plane clients 로 이동
- terminal page review inbox count 를 surface client helper 로 연결
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
- `app/src/lib/api/terminalBackend.test.ts`
- `app/src/routes/terminal/+page.svelte`
- `app/src/lib/cogochi/modes/TradeMode.svelte`
- `app/src/lib/contracts/runtime/captures.ts`
- `app/src/routes/api/runtime/[...path]/+server.ts`

## Facts

1. Fact, Search, Runtime, AgentContext 핵심 route/client slices 는 #201-#210 으로 main 에 병합되었다.
2. #211-#215 로 `TradeMode` 의 saved captures, confluence, market indicators, analyze refresh, outcome submit, alpha world-model reads 는 `terminalBackend` / runtime client 뒤로 이동했다.
3. 이번 slice 는 `app/src/routes/terminal/+page.svelte` 의 review inbox count direct `fetch('/api/captures/outcomes?limit=100')` 를 제거한다.
4. `terminalBackend.ts` 는 final cleanup 전까지 compatibility surface client shim 으로 유지한다.
5. local audit 기준 terminal surface files 에 direct `fetch(` 호출은 남아 있지 않다.

## Assumptions

1. 이번 PR 은 terminal page review inbox count read 만 자른다.
2. legacy `/api/captures/outcomes` route 는 이번 slice 에서 삭제하지 않고 compatibility route 로 유지한다.

## Open Questions

- W-0139 완료 판정은 review inbox helper PR 의 CI/merge 이후 확정한다.

## Decisions

- review inbox count read 는 `terminalBackend.fetchReviewInboxCount()` 로 읽는다.
- `terminalBackend.ts` 는 final cleanup 전까지 compatibility surface client shim 으로 유지한다.
- legacy captures outcome route 는 삭제하지 않는다.
- branch split reason: terminal surface direct-fetch audit 은 최신 `origin/main` 기준 `codex/w-0139-surface-closeout-audit` 에서만 진행한다.

## Next Steps

1. review inbox count helper slice 를 테스트/check 후 PR 로 병합한다.
2. merge 후 W-0139 를 complete 로 갱신한다.
3. W-0140 bottom ANALYZE slimming 으로 넘어간다.

## Exit Criteria

- review inbox count 는 `terminalBackend` helper 를 통해 실행하고 terminal page 안에서 direct fetch 하지 않는다.
- `TradeMode` 는 fact/search/runtime 결과만 소비하고 provider/fact composition 을 직접 소유하지 않는다.
- `terminalBackend.ts` 는 surface-facing client shim 으로 남고 route-level product logic 을 추가하지 않는다.
- 관련 app tests/check 가 통과한다.

## Handoff Checklist

- active work item: `work/active/W-0139-terminal-core-loop-capture.md`
- branch: `codex/w-0139-surface-closeout-audit`
- verification:
  - `npm --prefix app run test -- src/lib/api/terminalBackend.test.ts`
  - `npm --prefix app run check`
- remaining blockers: terminal surface direct fetch audit, W-0140 bottom ANALYZE surface slimming
