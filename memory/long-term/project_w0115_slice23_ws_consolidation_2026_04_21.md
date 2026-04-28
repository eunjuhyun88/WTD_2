---
name: W-0115 Slice 2+3 완료 + WS consolidation
description: W-0115 Slice 2+3 완료 (2026-04-21, branch claude/agitated-mcclintock, 3 commits un-pushed). TradeMode 중복 WS 제거 + 4→2 fetch 최적화 + pre-existing 3 타입에러 수리. 500 user × -1 WS.
type: project
originSessionId: 5d39ec3d-1adc-4040-98e6-b49df9e53ece
---
# W-0115 Slice 2+3 완료 + WS consolidation

**Branch**: `claude/agitated-mcclintock` (3 commits, un-pushed)
**Worktree**: `.claude/worktrees/agitated-mcclintock`
**Start**: main e1a3052d → **HEAD**: 1c76cc43 (3 ahead)
**svelte-check**: 3 errors → 0 errors

## Commits

1. `5c883658` — refactor(cogochi): TradeMode uses ChartBoard.onCandleClose, drop duplicate WS
   - ChartBoard: `onCandleClose?: (bar) => void` prop; wired from DataFeed.onBar when k.x=true
   - TradeMode: raw WS (50 lines, no reconnect/backoff/gap-fill) → ChartBoard callback
   - Net: -1 WS/user × 500 users = 500 fewer WS connections; -75% fetch on candle close (4→1 endpoint)
   - Applied to all 5 ChartBoard instances (desktop + mobile + layout variants)

2. `a81a3927` — perf(cogochi): lighter TradeMode fetch + fix mobile-mode type drift
   - New `fetchAnalyzeAndChart(symbol, tf)` helper — 2-fetch (analyze + klines) instead of 4
   - TradeMode was throwing away snapshot + derivatives from fetchTerminalBundle → wasted bandwidth
   - mobileMode store type 'analyze' → 'detail' (matches BottomTabBar/ModeRouter/DetailMode.svelte)
   - AppShell translates 'detail' ↔ 'analyze' at boundary; TradeMode keeps internal 'analyze'
   - 3 pre-existing svelte-check errors resolved (unrelated to WS work)

3. `1c76cc43` — docs(W-0115): mark Slice 2 done

## Key Files Changed

- `app/src/components/terminal/workspace/ChartBoard.svelte` — `onCandleClose` prop
- `app/src/lib/cogochi/modes/TradeMode.svelte` — raw WS removed, uses callback, uses fetchAnalyzeAndChart
- `app/src/lib/api/terminalBackend.ts` — new `fetchAnalyzeAndChart`
- `app/src/lib/stores/mobileMode.ts` — type 'analyze' → 'detail'
- `app/src/lib/cogochi/AppShell.svelte` — `setMobileView` translates 'analyze' → 'detail'
- `work/active/W-0115-cogochi-live-chart.md` — Slice 2+3 marked done

## Architecture note — DataFeed is the single WS owner

ChartBoard internally owns `DataFeed` (resilient WS: reconnect+backoff+gap-fill+heartbeat, 60s poll for sub-panes).
Previously TradeMode ran a second raw WS just to detect candle close → refetch analyze.
Now: ChartBoard exposes `onCandleClose` callback. TradeMode subscribes. Single WS per ChartBoard instance.

Rule: do NOT open raw WebSocket to Binance inside cogochi components. If you need candle-close events, consume via ChartBoard's `onCandleClose`.

## Not done (next session)

- Push + PR (requires user approval per CLAUDE.md)
- Verdict Inbox E2E verification (auth-gated /patterns)
- Founder seeding 8 → 50 (needs user domain cases)
- TradeMode.svelte 2786 lines refactor (too risky for autonomous run)
