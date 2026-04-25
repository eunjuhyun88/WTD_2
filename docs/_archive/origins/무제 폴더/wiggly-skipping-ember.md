# New `/lab` Page — Terminal X Style Clean Design

## Context

The existing `/terminal` page is 1148 lines with complex 3-panel layouts, resize handlers, and many components. Instead of fixing it, we create a brand new `/lab` page inspired by Terminal X — a clean 2-column layout with just **DOUNI Chat + Chart**. The old terminal page stays untouched.

## Target Design (Terminal X Style)

```
┌──────────────────────────────────────────────────────────────────┐
│  COGOCHI  │  BTC/USDT ▾  │  1H  4H  1D  1W  │     CONNECT      │
├────────────────────────────────┬─────────────────────────────────┤
│                                │                                 │
│       DOUNI CHAT               │        CHART                    │
│                                │                                 │
│  🐦 안녕! 분석할 게 있으면     │   [TradingView Chart]           │
│     말해줘.                    │                                 │
│                                │   Loading BTCUSDT...            │
│  User: BTC 4H 봐줘            │                                 │
│                                │                                 │
│  🐦 RSI 과매도 구간이야.      │                                 │
│     OI도 같이 볼래?            │                                 │
│                                │                                 │
│                                │                                 │
│                                │                                 │
├────────────────────────────────┤                                 │
│                                │                                 │
│  Analysis Stack [Score: 24]    │                                 │
│  [1] RSI 🐦  [2] OI 👤       │                                 │
│                                │                                 │
├────────────────────────────────┴─────────────────────────────────┤
│  cogochi > BTC 차트, RSI 봐줘, 롱 갈까?...                  [↵] │
├──────────────────────────────────────────────────────────────────┤
│  BTC_DOM: 61.2% | VOL_24H: $42.1B | MCAP: $2.34T | ...         │
└──────────────────────────────────────────────────────────────────┘
```

**Key principles:**
- 2-column only (chat left, chart right)
- No WarRoom, no IntelPanel, no resize handles, no density toggles
- Clean monospace terminal aesthetic
- PromptInput at bottom (full-width)
- Ticker bar at very bottom
- Pair/timeframe selector in top bar

## Files to Create/Modify

| File | Action |
|------|--------|
| `src/routes/lab/+page.svelte` | **New** — main page (~300 lines) |
| `src/routes/+layout.svelte` | Add `/lab` to fixed viewport routes |

**Reuses existing components (no changes needed):**
- `src/components/douni/DOUNIChat.svelte`
- `src/components/douni/PromptInput.svelte`
- `src/components/arena/ChartPanel.svelte`
- `src/routes/terminal/terminalChat.ts`
- `src/routes/terminal/terminalTicker.ts`
- `src/lib/prompt/promptParser.ts`
- `src/lib/prompt/analysisStack.ts`

## Implementation Steps

### Step 1 — Add `/lab` to layout fixed viewport routes

In `src/routes/+layout.svelte`:
- Add `path.startsWith('/lab')` to `isFixedViewportRoute`
- Add `'lab'` as a view mode in the `$effect` sync

### Step 2 — Create `src/routes/lab/+page.svelte`

Simple ~300-line page:

**Script section (~80 lines):**
- Import DOUNIChat, PromptInput, ChartPanel
- Import chatMessages, isTyping, derivedDouniMood from terminalChat
- Import tickerSegments, tickerSegmentClass, fetchLiveTicker from terminalTicker
- Import parsePrompt, handlePromptAction from terminalChat
- Import gameState for pair/timeframe
- Import analysisStack, stackEntryCount
- Simple pair selector (TokenDropdown)
- onMount: fetchLiveTicker

**Template section (~100 lines):**
- Top bar: logo area + TokenDropdown + timeframe buttons
- 2-column flex: left=DOUNIChat, right=ChartPanel
- Bottom: PromptInput (full-width)
- Ticker bar

**Style section (~120 lines):**
- Terminal X dark theme (existing CSS vars)
- Simple 2-column flex, no grid complexity
- Responsive: stack vertically on mobile

## Verification

1. `npm run dev` → navigate to `/lab`
2. Chart loads with BTC/USDT
3. DOUNIChat shows welcome message
4. Type in PromptInput → DOUNI responds
5. Pair/timeframe selector works
6. Mobile: stacks vertically
7. No console errors
