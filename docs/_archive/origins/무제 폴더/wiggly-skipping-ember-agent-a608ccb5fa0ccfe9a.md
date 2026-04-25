# Terminal Page DOUNI Phase 2 Integration Plan

## Executive Summary

Refactor `src/routes/terminal/+page.svelte` (3904 lines) to integrate 6 new DOUNI components while extracting logic into separate modules. Target: page file under ~1500 lines.

---

## Key Design Decisions

### 1. Right Panel: Replace IntelPanel chat section only — NOT entire panel

**Rationale**: IntelPanel (2775 lines) contains feed, positions, Polymarket, GMX panels, and onchain dashboards beyond just chat. Replacing it entirely would lose critical functionality. Instead:
- Keep IntelPanel for feed/positions/onchain tabs
- Replace IntelPanel's chat tab with DOUNIChat
- On desktop: right panel becomes a **split panel** — DOUNIChat on top (~60%), IntelPanel feed/positions on bottom (~40%)
- On mobile: "intel" tab becomes "douni" tab, showing DOUNIChat + PromptInput; IntelPanel feed/positions become a sub-tab within

### 2. ArtifactPanel: Overlay within the center panel, below VerdictBanner

**Rationale**: ArtifactPanel uses a tabbed interface for data artifacts (chart overlays, onchain data, derivatives). It belongs as a collapsible section above the ChartPanel in the center column. When no artifacts are open, it collapses to zero height. When artifacts exist, it takes ~200px from the top of center panel.

### 3. PromptInput: Full-width bar between main panels and ticker

**Rationale**: The prompt is the primary user input surface — it should be accessible from all layouts. Place it:
- **Desktop**: full-width bar spanning all 3 columns, between the panel grid and ticker bar
- **Tablet**: full-width bar between panel area and ticker
- **Mobile**: fixed at bottom above the tab nav (replaces the chat input within IntelPanel)

### 4. Code Extraction Strategy

Extract to these files (all in `src/routes/terminal/`):

| File | Lines extracted | Content |
|------|---------------|---------|
| `terminalResize.ts` | ~470 | All resize state, handlers, types, constants |
| `terminalChat.ts` | ~380 | Chat state, handlers, rewritten for DOUNIChat format |
| `terminalTicker.ts` | ~40 | Ticker state + fetch |
| `terminalLayout.ts` | ~70 | Layout state (breakpoints, panel sizes, collapse) |

CSS stays in the `.svelte` file (Svelte scoped styles cannot be externalized without losing scoping).

---

## Architecture: File-by-File Changes

### File 1: `src/routes/terminal/terminalLayout.ts` (NEW — ~100 lines)

Exports a `createTerminalLayout()` function returning a Svelte 4-compatible store object:

```
Exports:
- Types: MobileTab, DesktopPanelKey, TabletPanelKey, DragTarget, breakpoint types
- Constants: BP_MOBILE, BP_TABLET, MIN_LEFT, MAX_LEFT, MIN_RIGHT, MAX_RIGHT, panel size constants
- State: leftW, rightW, leftCollapsed, rightCollapsed, focusMode, etc.
- Functions: toggleLeft(), toggleRight(), toggleFocusMode()
```

**Why separate**: These ~70 variables and toggle functions clutter the page with pure state management.

### File 2: `src/routes/terminal/terminalResize.ts` (NEW — ~470 lines)

Move lines 238-709 wholesale:

```
Exports:
- resizeDesktopPanelByWheel(), resizePanelByWheel()
- startDrag(), onMouseMove(), onMouseUp()
- All mobile panel resize functions (start/move/finish for pointer and touch)
- All tablet split resize functions
- getMobilePanelStyle(), getDesktopPanelStyle(), getTabletPanelStyle()
- Setup/teardown helpers for onMount/onDestroy event listeners
```

**Import pattern**: These functions need access to reactive state (leftW, rightW, etc.). Pass state as a context object parameter, or use a callback-based approach where the page passes getters/setters.

**Practical approach**: Export factory functions that accept a `ctx` parameter containing the reactive variables. Example:
```ts
export function createResizeHandlers(ctx: TerminalResizeContext) {
  // All resize logic referencing ctx.leftW, ctx.rightW, etc.
  return { resizeDesktopPanelByWheel, startDrag, ... };
}
```

The page calls `createResizeHandlers({ leftW, rightW, ... })` in its script section. This keeps Svelte 4 reactivity working since the ctx values are `let` bindings in the page.

**IMPORTANT CAVEAT**: Because Svelte 4 `let` variables are not pass-by-reference, the resize handlers need to return new values that the page assigns back. Alternative: use a writable store internally. The recommended pattern for Svelte 4 is:

```ts
// terminalResize.ts
export function createResizeHandlers(getState: () => ResizeState, setState: (patch: Partial<ResizeState>) => void) { ... }
```

Then in the page:
```svelte
const resize = createResizeHandlers(
  () => ({ leftW, rightW, leftCollapsed, rightCollapsed, ... }),
  (patch) => { if ('leftW' in patch) leftW = patch.leftW!; ... }
);
```

### File 3: `src/routes/terminal/terminalChat.ts` (NEW — ~400 lines)

Rewrite of lines 986-1471 to produce DOUNIChat-compatible `ChatMessage[]` instead of `ChatMsg[]`.

```
Key changes:
- ChatMsg { from, icon, color, text, time, isUser, isSystem }
  → ChatMessage { id, role, text, timestamp, stackEntry? }
  
- role mapping:
  - isUser=true → role: 'user'
  - isSystem=true → role: 'system'
  - all agent responses → role: 'douni'

- handleSendChat() rewritten:
  1. Creates user ChatMessage, pushes to messages array
  2. Sets douniState = 'thinking'
  3. Parses input through parsePrompt()
  4. Routes based on ParsedPrompt.type:
     - 'chart' → updates gameState pair/timeframe, opens ArtifactPanel tab
     - 'indicator' → adds indicator overlay, creates StackEntry via analysisStack.addEntry()
     - 'onchain'/'derivatives' → opens ArtifactPanel tab for data
     - 'analyze' → triggers pattern scan (existing triggerPatternScanFromChat)
     - 'opinion' → calls /api/chat/messages (existing LLM flow)
     - 'position' → calls analysisStack.setPosition()
     - 'execute' → triggers trade execution flow
     - 'save' → calls analysisStack.toJournal()
     - 'educate' → calls /api/chat/messages with education context
     - 'chat' → calls /api/chat/messages (general, existing flow)
  5. On response: pushes douni ChatMessage, sets douniState based on outcome
  6. If response includes directional evidence → adds StackEntry

Exports:
- createTerminalChat(deps): returns { messages, douniState, douniDirection, handlePromptSubmit, handleScanComplete, ... }
- deps includes: gameState, livePrices, analysisStack references
```

### File 4: `src/routes/terminal/terminalTicker.ts` (NEW — ~50 lines)

Lines 783-816 + ticker variables (29-34):
```
Exports:
- liveTickerStr, tickerLoaded, tickerText, tickerSegments (as store)
- fetchLiveTicker()
- tickerSegmentClass()
```

### File 5: `src/routes/terminal/+page.svelte` (MODIFIED — target ~1400 lines)

After extraction, the page file contains:
- Imports (~30 lines): component imports + new module imports
- Wiring (~80 lines): create instances of extracted modules, wire callbacks
- Agent journey state (~20 lines): unchanged
- Topbar/strategy drawer vars (~15 lines): unchanged
- onMount/onDestroy (~40 lines): simplified, delegates to module setup/teardown
- Ref bindings (~20 lines): chart/warroom refs
- Template (~560 lines): 3 layouts + topbar + ticker + PromptInput
- CSS (~1860 lines): unchanged (cannot extract from Svelte scoped styles)

Wait — that still totals ~2625 lines with CSS. To get under 1500 lines of **logic+template**, we need the CSS to stay but accept that the total file is ~3300 lines. Alternatively, we could adopt CSS-in-JS or move to `:global` styles in a separate `.css` file imported at layout level. But the requirement says "keep existing patterns" — so CSS stays. The goal should be ~1400 lines of script+template.

---

## Integration Wiring

### DOUNIChat Integration

**Desktop right panel** — Replace the IntelPanel-only right panel with a vertical split:

```svelte
<!-- Right panel: DOUNIChat + IntelPanel (feed/positions only) -->
<div class="tr-split">
  <div class="tr-douni" style="flex: 6">
    <DOUNIChat
      {douniMessages}
      {douniState}
      {douniDirection}
    />
  </div>
  <div class="tr-intel" style="flex: 4">
    <IntelPanel
      {densityMode}
      chatMessages={[]}  <!-- empty: chat is handled by DOUNIChat now -->
      isTyping={false}
      {latestScan}
      hideChatTab  <!-- new prop to hide the chat tab -->
      {chatTradeReady}
      {chatFocusKey}
      {chatConnectionStatus}
      on:gototrade={handleIntelGoTrade}
    />
  </div>
</div>
```

IntelPanel needs a minor change: add `export let hideChatTab = false;` and skip rendering the chat tab when true. This is a minimal, non-breaking change.

### PromptInput Integration

Place outside the 3-panel grid, as a full-width element:

```svelte
<!-- After .terminal-page grid closes, before .ticker-bar -->
<div class="prompt-row">
  <PromptInput
    onSubmit={handlePromptSubmit}
    placeholder="BTC 차트, RSI 봐줘, 롱 갈까?..."
    disabled={douniState === 'thinking'}
  />
</div>
```

`handlePromptSubmit` is the main entry point from `terminalChat.ts`.

### ArtifactPanel Integration

Place within the center panel, between VerdictBanner and ChartPanel:

```svelte
<div class="tc">
  <VerdictBanner verdict={latestScan} scanning={terminalScanning} />
  {#if artifactTabs.length > 0}
    <ArtifactPanel
      tabs={artifactTabs}
      activeTabId={activeArtifactTabId}
      onTabChange={(id) => activeArtifactTabId = id}
      onTabClose={handleArtifactClose}
    >
      <!-- Render active artifact content here -->
    </ArtifactPanel>
  {/if}
  <div class="chart-area" style="flex: 1">
    <ChartPanel ... />
  </div>
</div>
```

Artifact state lives in `terminalChat.ts` — when parsePrompt returns 'onchain' or 'derivatives', it creates an ArtifactTab and adds it.

### DOUNISprite Integration

DOUNISprite is already embedded inside DOUNIChat.svelte (line 43). No additional integration needed at the page level. The `douniState` and `douniDirection` props flow from `terminalChat.ts` through the page to DOUNIChat.

### promptParser Integration

Called inside `terminalChat.ts`'s `handlePromptSubmit`:

```ts
import { parsePrompt } from '$lib/prompt/promptParser';

async function handlePromptSubmit(text: string) {
  const parsed = parsePrompt(text);
  // Route based on parsed.type
  switch (parsed.type) {
    case 'chart':
      // Update pair/timeframe in gameState
      // Add artifact tab if needed
      break;
    case 'indicator':
      // Add to analysis stack
      analysisStack.addEntry({ type: 'indicator', label: parsed.params.name, ... });
      break;
    // ... etc
  }
}
```

### analysisStack Integration

The analysis stack store is already a Svelte writable store. Integration points:

1. **terminalChat.ts** calls `analysisStack.addEntry()` when:
   - DOUNI returns analysis with directional evidence
   - User adds indicator/onchain/derivatives data
   - Pattern scan completes with results

2. **DOUNIChat** already reads `$analysisStack` via `import { analysisStack } from '$lib/prompt/analysisStack'` (line 3 of DOUNIChat.svelte) and renders the stack panel.

3. **terminalChat.ts** calls `analysisStack.setPosition()` when parsePrompt returns 'position' type.

4. **terminalChat.ts** calls `analysisStack.setPair()` when chart pair changes.

---

## ChatMessage Format Adapter

The existing `ChatMsg` → DOUNIChat `ChatMessage` mapping:

```ts
// Adapter for existing chat messages
function chatMsgToDouniMessage(msg: ChatMsg): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role: msg.isUser ? 'user' : msg.isSystem ? 'system' : 'douni',
    text: msg.isUser ? msg.text : `[${msg.from}] ${msg.text}`,
    timestamp: Date.now(),
    // stackEntry populated separately when evidence is attached
  };
}
```

For the new flow, messages are created directly in ChatMessage format — the adapter is only needed for the initial system messages (the welcome messages at lines 1029-1034).

---

## Step-by-Step Implementation Order

### Phase A: Extract without changing behavior (safe, testable)

**Step 1**: Create `terminalTicker.ts`
- Move ticker variables and `fetchLiveTicker()` function
- Import back into page, verify ticker still works
- Risk: Lowest — self-contained, no reactive dependencies

**Step 2**: Create `terminalLayout.ts`
- Move layout constants, types, and pure toggle functions
- Keep reactive `let` bindings in page, import constants/types
- Risk: Low — types and constants have no side effects

**Step 3**: Create `terminalResize.ts`
- Move all resize handlers using the factory pattern
- Wire up in page with getter/setter context
- Test: all 3 layouts' resize (scroll wheel, drag, touch) must still work
- Risk: Medium — reactive state threading requires careful callback wiring

**Step 4**: Add `hideChatTab` prop to IntelPanel
- Add `export let hideChatTab = false;`
- When true, default `activeTab` to 'feed' instead of 'chat', hide chat tab button
- Test: existing behavior unchanged when prop is omitted
- Risk: Low — additive change

### Phase B: Add new components (incremental, feature-flagged)

**Step 5**: Create `terminalChat.ts` with DOUNIChat message format
- Start by wrapping existing handleSendChat in new module
- Produce both ChatMsg[] (for IntelPanel backward compat) and ChatMessage[] (for DOUNIChat)
- Export douniState, douniDirection reactive state
- Risk: Medium — must maintain both formats during transition

**Step 6**: Add PromptInput to all 3 layouts
- Desktop: full-width row between panels and ticker
- Tablet: same position
- Mobile: above bottom nav
- Wire `onSubmit` to `terminalChat.handlePromptSubmit`
- Test: typing suggestions appear, Enter submits, response appears in existing IntelPanel chat
- Risk: Low — additive UI, existing chat still works

**Step 7**: Add DOUNIChat to desktop right panel
- Split right panel into DOUNIChat (top) + IntelPanel with hideChatTab (bottom)
- Pass ChatMessage[] from terminalChat module
- Test: messages appear in DOUNIChat, analysis stack displays
- Risk: Medium — layout changes, resize handlers need adjustment

**Step 8**: Add DOUNIChat to tablet layout
- Replace IntelPanel in tablet bottom with same split approach
- Risk: Medium — tablet layout is already complex

**Step 9**: Add DOUNIChat to mobile layout
- Replace 'intel' tab with 'douni' tab
- DOUNIChat + PromptInput fill the mobile panel
- IntelPanel feed/positions accessible via sub-tab or separate nav item
- Risk: Medium — mobile tab system changes

**Step 10**: Add ArtifactPanel to center panel
- Insert between VerdictBanner and ChartPanel in all 3 layouts
- Wire artifact tab creation from parsePrompt results
- Test: typing "BTC 4H" creates a chart artifact tab
- Risk: Low-Medium — additive within center panel

### Phase C: Wire deep integrations

**Step 11**: Integrate parsePrompt routing in handlePromptSubmit
- Route all PromptActionTypes to correct handlers
- 'chart' → gameState update + artifact
- 'indicator' → analysisStack.addEntry()
- 'analyze' → triggerPatternScanFromChat
- etc.

**Step 12**: Connect analysisStack to evidence accumulation
- On each agent response with directional signals, call addEntry()
- On scan complete, translate signal data to StackEntry format
- Wire analysisStack.setPosition() for position-type prompts
- Wire analysisStack.setPair() when pair changes

**Step 13**: Wire DOUNISprite state changes
- Set douniState based on: idle → thinking (on submit) → happy/excited (on bullish signal) → alert (on risk warning) → idle
- Set douniDirection based on: front (idle), quarter (thinking), side (analyzing chart)

### Phase D: Polish and cleanup

**Step 14**: Remove IntelPanel chat rendering (now handled by DOUNIChat)
- Remove chat tab from IntelPanel entirely (not just hide)
- Remove ChatMsg[] prop passing for chat display
- Keep sendchat dispatch for backward compat or remove if fully migrated

**Step 15**: Remove duplicate chat state from page
- Old chatMessages[], isTyping can be removed once DOUNIChat is the sole chat UI
- Simplify the page's script section

**Step 16**: Update mobile tab labels and icons
- 'intel' → 'douni' (label: "DOUNI", icon: owl)
- Optionally add 4th tab for feed/positions if needed

---

## Verification Steps

After each phase:

1. **Phase A verification** (extraction):
   - Desktop: Left/right panel drag resize works
   - Desktop: Scroll-wheel resize on all 3 panels works
   - Desktop: F key focus mode works
   - Desktop: Collapsed panel strips expand on click
   - Tablet: Split resizers (both axes) work
   - Mobile: Touch resize on all panels works
   - Ticker: Data loads and scrolls
   - Chat: Send message → receive response in IntelPanel

2. **Phase B verification** (new components):
   - PromptInput: Autocomplete suggestions appear for "BTC", "RSI", etc.
   - PromptInput: Enter submits, response flows to DOUNIChat
   - DOUNIChat: Messages render with correct role styling
   - DOUNIChat: Typing indicator shows during API call
   - DOUNIChat: Analysis stack renders when entries exist
   - ArtifactPanel: Tabs appear when artifacts are created
   - ArtifactPanel: Tab close removes the tab

3. **Phase C verification** (deep integration):
   - Type "BTC 4H" → pair changes, chart updates
   - Type "RSI" → indicator added, stack entry appears
   - Type "롱 갈까?" → DOUNI responds with directional opinion, stack entry added
   - Type "SL 81400" → position stop-loss set in analysis stack
   - Run scan → scan results create stack entries, DOUNI announces verdict
   - Combo detection: add RSI + OI + Funding entries → "Short Squeeze Setup" combo appears

4. **Phase D verification** (cleanup):
   - No console errors
   - IntelPanel feed/positions/onchain still work
   - All 3 responsive layouts render correctly
   - Page file is under 1500 lines of script+template

---

## Risk Matrix

| Risk | Impact | Mitigation |
|------|--------|------------|
| Svelte 4 reactive state doesn't work with extracted modules | High | Use getter/setter factory pattern, not direct variable passing |
| DOUNIChat uses Svelte 5 runes ($state, $props, $derived, $effect) inside a Svelte 4 page | Medium | Svelte 5 components work inside Svelte 4 pages — the component boundary handles this. Verify during Step 7. |
| Resize handlers break after extraction | High | Extract in Step 3, test exhaustively before proceeding |
| IntelPanel hideChatTab prop causes regressions | Low | Prop defaults to false, no behavior change unless explicitly set |
| Mobile layout becomes too crowded with PromptInput + DOUNIChat + nav | Medium | PromptInput can be conditionally shown only on douni tab; or overlay the bottom nav |

---

## Critical Files for Implementation

### Critical Files for Implementation
- /Users/ej/Downloads/프로젝트/cogochi_2/.claude/worktrees/frosty-nobel/src/routes/terminal/+page.svelte
- /Users/ej/Downloads/프로젝트/cogochi_2/.claude/worktrees/frosty-nobel/src/components/douni/DOUNIChat.svelte
- /Users/ej/Downloads/프로젝트/cogochi_2/.claude/worktrees/frosty-nobel/src/components/terminal/IntelPanel.svelte
- /Users/ej/Downloads/프로젝트/cogochi_2/.claude/worktrees/frosty-nobel/src/lib/prompt/promptParser.ts
- /Users/ej/Downloads/프로젝트/cogochi_2/.claude/worktrees/frosty-nobel/src/lib/prompt/analysisStack.ts
