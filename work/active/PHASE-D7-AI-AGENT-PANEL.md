# Phase D-7 — AI Agent Panel 5탭 + Drawer Slide (2d)

**Goal**: restructure right panel to 5-tab Bloomberg-style (Decision /
Pattern / Verdict / Research / Judge) with inline cards (L1) + drawer
slide (L3). Add `aiQueryRouter` and ⌘L AI Search input.

**Branch**: continues on `claude/optimize-token-usage-OHWWq`.

**Design ref**: `work/active/W-0374-cogochi-bloomberg-ux-restructure.md` lines 533-583.

---

## 1. Scope

### 1.1 RightPanelTab migration

`shell.store.ts` — change `RightPanelTab` from
`'decision' | 'analyze' | 'scan' | 'judge' | 'pattern'` to
`'decision' | 'pattern' | 'verdict' | 'research' | 'judge'`.

Migration: `analyze → verdict`, `scan → research`. Bump SHELL_KEY to v10.

### 1.2 aiQueryRouter

`app/src/lib/cogochi/aiQueryRouter.ts` — pure-TS module that takes a
free-form query and returns an action descriptor. Reused by both
AIAgentPanel and the legacy AIPanel chat input.

```ts
type AIRouterAction =
  | { kind: 'analyze'; symbol: string; timeframe: string }
  | { kind: 'scan'; timeframe: string }
  | { kind: 'judge'; symbol: string; timeframe: string; verdict: 'long'|'short' }
  | { kind: 'indicator'; query: string }
  | { kind: 'overlay'; symbol: string; price: number; label: string }
  | { kind: 'recall'; symbol: string; timeframe: string }
  | { kind: 'unknown'; reason: string };

export function routeAIQuery(text: string, ctx: { symbol: string; timeframe: string }): AIRouterAction;
```

### 1.3 AIAgentPanel rewrite

`app/src/lib/cogochi/AIAgentPanel.svelte`:

- Tab strip (40px tall): Decision / Pattern / Verdict / Research / Judge
- AI Search input (sticky 40px) directly under tab strip
- Active tab content (scrollable, flex 1)
- Expand button → `rightPanelExpanded` (320 ↔ 480)

### 1.4 5 tab content map

| Tab | Inline (L1) | Drawer (L3) |
|---|---|---|
| Decision | DecisionHUDAdapter | "evidence-grid" drawer |
| Pattern | recall results (top 5 from `/api/patterns/recall` for current viewport) + recent captures | "pattern-library" drawer |
| Verdict | VerdictInboxPanel rows (latest 10) | "verdict-card" drawer |
| Research | freeform notes + last analyze card summary | "research-full" drawer |
| Judge | KPI strip (winrate / P&L) | "judge-full" drawer |

### 1.5 DrawerSlide component

`app/src/lib/cogochi/DrawerSlide.svelte` — 320px right slide-in
overlaying main column. Closes on Esc / outside click / ✕.

### 1.6 ⌘L AI Search shortcut

In `AppShell` keydown handler, `Cmd/Ctrl+L` (or `/`) focuses the AI
Search input in AIAgentPanel via `cogochi:cmd { id: 'focus_ai_search' }`.

---

## 2. Acceptance criteria

| AC | Criterion |
|---|---|
| AC-D7-1  | RightPanelTab type changed to 5 new ids; persisted state migrates (analyze→verdict, scan→research) |
| AC-D7-2  | AIAgentPanel renders 5 tabs (Decision / Pattern / Verdict / Research / Judge) without runtime error |
| AC-D7-3  | aiQueryRouter handles ANALYZE / SCAN / JUDGE / INDICATOR / RECALL / OVERLAY / unknown |
| AC-D7-4  | AI Search input (⌘L) focuses via shortcut + executes router |
| AC-D7-5  | Each tab has inline summary card |
| AC-D7-6  | "더 보기" / row click opens DrawerSlide with kind aligned to tab |
| AC-D7-7  | DrawerSlide closes on Esc / ✕ |
| AC-D7-8  | rightPanelExpanded toggle expands 320 → 480 |
| AC-D7-9  | 0 new TS errors, all existing tests pass |
| AC-D7-10 | aiQueryRouter has unit tests covering each action kind |
