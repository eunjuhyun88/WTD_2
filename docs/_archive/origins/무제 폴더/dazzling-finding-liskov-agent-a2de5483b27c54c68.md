# Implementation Plan: Sidebar Responsive Optimization + User Journey Data Flow

## 1. New Store: `journeyStore.ts`

**File**: `src-svelte/lib/stores/journeyStore.ts`

### State Shape

```ts
export type JourneyPhase = 'explore' | 'research' | 'model-review' | 'network-setup' | 'protocol';

export interface BreadcrumbEntry {
  view: AppView;
  timestamp: number;
  scrollY: number;           // preserve scroll position for "back" nav
  label: string;             // human-readable page name
  contextSnapshot?: string;  // e.g., "3 experiments running" — short line
}

export interface Milestone {
  id: string;
  label: string;
  achieved: boolean;
  achievedAt: number | null;
}

export interface JourneySuggestion {
  text: string;
  action: () => void;
  priority: number;          // higher = more relevant
}

interface JourneyState {
  currentPhase: JourneyPhase;
  breadcrumbs: BreadcrumbEntry[];   // capped at 20 entries
  milestones: Milestone[];
  lastVisitedView: AppView | null;
  sessionStartedAt: number;
}
```

### Milestones (predefined)

| ID | Label | Trigger condition |
|----|-------|-------------------|
| `first-research-start` | First research launched | `jobStore.phase` transitions to `running` |
| `first-research-complete` | First research completed | `jobStore.phase` transitions to `complete` |
| `first-model-viewed` | First model inspected | Navigate to `model-detail` |
| `first-model-published` | First model published | `studioStore.phase` transitions to `published` |
| `first-node-viewed` | Explored network nodes | Navigate to `network` |
| `first-protocol-viewed` | Explored protocol economics | Navigate to `protocol` |
| `wallet-connected` | Wallet connected | `walletStore.connected` becomes true |

### Derived Stores

- `journeyPhase`: derived from `journeyStore` — current phase
- `journeySuggestions`: derived from `[journeyStore, jobStore, studioStore, router]` — computes smart next-step suggestions
- `journeyProgress`: derived — returns 0-100 based on milestones achieved
- `journeyPeekText`: derived — single-line context hint for the bottom sheet collapsed state (e.g., "Research running: 45%" or "3 models ready to publish")
- `previousBreadcrumb`: derived — the last breadcrumb entry for "back" navigation intelligence

### Integration Points

- **Router subscription**: On every `router` change, push a new breadcrumb entry capturing current `scrollY` and a context label
- **jobStore subscription**: Watch phase transitions to mark milestones and update `currentPhase`
- **studioStore subscription**: Watch publish transitions
- **walletStore subscription**: Watch connect events
- **Persistence**: Save milestones + currentPhase to `localStorage` under `hoot-journey`; breadcrumbs are session-only (not persisted)

### `journeySuggestions` Logic

The derived store computes suggestions by combining:

1. **Current view context**: Different suggestions per page
2. **Journey phase + milestones**: What the user has/hasn't done
3. **Active job state**: Running research, completed research, idle
4. **Stage unlock state**: What pages are accessible

Example rules:
- On `studio` page + `jobStore.phase === 'complete'` + `!milestone('first-model-published')` → suggest "Publish your model to the marketplace"
- On `models` page + `milestone('first-research-complete')` + no published models → suggest "You have research results ready to publish"
- On any page + `jobStore.phase === 'running'` → always include "Research progress: X%" as a background chip
- On `network` page + `!milestone('wallet-connected')` → suggest "Connect wallet to start earning"

---

## 2. AIAssistantPanel Refactoring for Mobile Bottom Sheet

**File**: `src-svelte/lib/components/AIAssistantPanel.svelte`

The component stays as a single file (per constraint) but gains three responsive behaviors internally.

### Bottom Sheet State Model

Add to the script section:

```ts
type BottomSheetState = 'collapsed' | 'half' | 'full';
let sheetState: BottomSheetState = 'collapsed';
let sheetY = 0;           // current translateY during drag
let isDragging = false;
let dragStartY = 0;
let dragStartTime = 0;
```

### Layout Strategy by Breakpoint

| Breakpoint | Behavior | CSS position |
|------------|----------|-------------|
| Desktop (>860px) | Current grid-column sticky panel, no changes | `position: sticky; top: 0` in grid col 3 |
| Tablet (601-860px) | Fixed right overlay + swipe gesture to dismiss | `position: fixed; right: 0; top: 0; width: 320px` |
| Mobile (<=600px) | Bottom sheet with 3 states | `position: fixed; bottom: 0; left: 0; right: 0` |

### Mobile Bottom Sheet Heights

- **Collapsed**: `64px` — peek bar with one-line context hint from `journeyPeekText` + drag handle
- **Half-open**: `50vh` — quick chips + last message + input bar
- **Full-open**: `calc(100dvh - env(safe-area-inset-top) - 20px)` — full conversation, rounded top corners

### Markup Changes

The existing `<aside class="ai-panel">` wrapper gets extended:

```svelte
{#if open || isMobile}
  <!-- Mobile: always mounted, controlled by sheetState -->
  <!-- Desktop/Tablet: mounted only when open -->
  <aside
    class="ai-panel"
    class:mobile-sheet={isMobile}
    class:tablet-overlay={isTablet}
    class:sheet-collapsed={isMobile && sheetState === 'collapsed'}
    class:sheet-half={isMobile && sheetState === 'half'}
    class:sheet-full={isMobile && sheetState === 'full'}
    style={isMobile ? `transform: translateY(${sheetY}px)` : ''}
    transition:fly={isMobile ? undefined : { x: 280, duration: 250 }}
    on:touchstart={handleTouchStart}
    on:touchmove={handleTouchMove}
    on:touchend={handleTouchEnd}
  >
    <!-- Drag handle (mobile only) -->
    {#if isMobile}
      <div class="sheet-handle" on:click={cycleSheetState}>
        <span class="sheet-handle-bar"></span>
        <span class="sheet-peek-text">{$journeyPeekText}</span>
      </div>
    {/if}

    <!-- Rest of existing content, conditionally shown by sheetState -->
    {#if !isMobile || sheetState !== 'collapsed'}
      <!-- Header, Messages, Input — existing markup -->
    {/if}
  </aside>
{/if}
```

### CSS Additions for Mobile Bottom Sheet

```css
/* Mobile bottom sheet base */
@media (max-width: 600px) {
  .ai-panel.mobile-sheet {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    top: auto;
    width: 100%;
    border-radius: 20px 20px 0 0;
    border-left: none;
    box-shadow: 0 -4px 32px rgba(0, 0, 0, 0.15);
    transition: height 300ms var(--ease-spring);
    will-change: transform, height;
    z-index: var(--z-overlay);
    padding-bottom: var(--safe-area-bottom);
  }

  .sheet-collapsed { height: 64px; overflow: hidden; }
  .sheet-half { height: 50vh; }
  .sheet-full { height: calc(100dvh - env(safe-area-inset-top, 0px) - 20px); }

  .sheet-handle {
    height: 64px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    cursor: grab;
    touch-action: none;
  }

  .sheet-handle-bar {
    width: 36px;
    height: 4px;
    border-radius: 2px;
    background: var(--border, #E5E0DA);
  }

  .sheet-peek-text {
    font: 500 0.72rem/1 var(--font-body);
    color: var(--text-secondary);
  }
}
```

---

## 3. Gesture Handling Approach

**Location**: Inline in `AIAssistantPanel.svelte` script section (keeps single-file constraint).

### Touch Gesture Implementation

```ts
// Breakpoint detection (reactive)
let windowWidth = typeof window !== 'undefined' ? window.innerWidth : 1024;
$: isMobile = windowWidth <= 600;
$: isTablet = windowWidth > 600 && windowWidth <= 860;

function handleTouchStart(e: TouchEvent) {
  if (!isMobile && !isTablet) return;
  isDragging = true;
  dragStartY = e.touches[0].clientY;
  dragStartTime = Date.now();
  sheetY = 0;
}

function handleTouchMove(e: TouchEvent) {
  if (!isDragging) return;
  const currentY = e.touches[0].clientY;
  const delta = currentY - dragStartY;

  if (isMobile) {
    // Mobile: vertical drag controls sheet height
    // Positive delta = dragging down (toward collapse)
    // Negative delta = dragging up (toward expand)
    sheetY = Math.max(-20, delta); // slight rubber-band at top
    e.preventDefault(); // prevent scroll while dragging sheet
  } else if (isTablet) {
    // Tablet: horizontal drag to right dismisses panel
    sheetY = Math.max(0, delta); // only allow dragging right
  }
}

function handleTouchEnd(e: TouchEvent) {
  if (!isDragging) return;
  isDragging = false;

  const elapsed = Date.now() - dragStartTime;
  const velocity = sheetY / Math.max(elapsed, 1); // px/ms

  if (isMobile) {
    resolveSheetSnap(velocity);
  } else if (isTablet) {
    // Tablet: if dragged far enough right, close
    if (sheetY > 100 || velocity > 0.3) {
      panelStore.closeAI();
    }
  }

  sheetY = 0;
}

function resolveSheetSnap(velocity: number) {
  const VELOCITY_THRESHOLD = 0.4; // px/ms

  // Fast flick detection
  if (velocity > VELOCITY_THRESHOLD) {
    // Fast downward flick → collapse one step
    sheetState = sheetState === 'full' ? 'half' : 'collapsed';
    return;
  }
  if (velocity < -VELOCITY_THRESHOLD) {
    // Fast upward flick → expand one step
    sheetState = sheetState === 'collapsed' ? 'half' : 'full';
    return;
  }

  // Slow drag → snap to nearest state based on position
  if (sheetY > 80) {
    sheetState = sheetState === 'full' ? 'half' : 'collapsed';
  } else if (sheetY < -80) {
    sheetState = sheetState === 'collapsed' ? 'half' : 'full';
  }
  // else: stays at current state (snap back)
}

function cycleSheetState() {
  if (sheetState === 'collapsed') sheetState = 'half';
  else if (sheetState === 'half') sheetState = 'full';
  else sheetState = 'collapsed';
}
```

### Performance Strategy

- Use `will-change: transform, height` on the sheet element
- During active drag, apply transforms via inline `style=` (bypasses Svelte reactivity overhead)
- Use `touch-action: none` on the drag handle to prevent browser scroll interference
- The `transition` property is conditionally removed during drag (applied only on snap)
- Window resize listener uses passive event + debounce to update `windowWidth`

---

## 4. Quick Chip Intelligence Upgrade

**Location**: `AIAssistantPanel.svelte` (the `getQuickChips` function)

### Current Implementation

The existing `getQuickChips(view, phase)` only considers current view and job phase.

### New Implementation

Replace with `getSmartChips` that reads from `journeyStore`:

```ts
import { journeyStore, journeySuggestions, journeyPeekText } from '../stores/journeyStore.ts';

$: smartChips = getSmartChips($router, $jobStore.phase, $journeySuggestions, $studioStore);

function getSmartChips(
  view: string,
  phase: string,
  suggestions: JourneySuggestion[],
  studio: StudioState,
): { label: string; handler?: () => void }[] {
  const chips: { label: string; handler?: () => void }[] = [];

  // 1. Top journey suggestions (max 2)
  const topSuggestions = suggestions
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 2);
  for (const s of topSuggestions) {
    chips.push({ label: s.text, handler: s.action });
  }

  // 2. View-specific chips (existing logic, but reduced to fill remaining slots)
  const viewChips = getViewChips(view, phase);
  const remaining = Math.max(0, 4 - chips.length);
  chips.push(...viewChips.slice(0, remaining));

  return chips;
}
```

This preserves backward compatibility (view-specific chips still appear) but prioritizes journey-aware suggestions.

---

## 5. Page Transition Improvements

### 5a. Cross-fade Transition

**File**: `src-svelte/App.svelte`

Replace the current `{#key routeKey}` block with a simple cross-fade:

```svelte
{#key routeKey}
  <div class="page-transition" in:fade={{ duration: 150, delay: 50 }} out:fade={{ duration: 100 }}>
    <!-- existing page content -->
  </div>
{/key}
```

This is lightweight and avoids the complexity of shared-element transitions in Svelte 4 (no SvelteKit page transitions API).

### 5b. Journey Progress Indicator

**File**: `src-svelte/lib/components/LiveActivityBar.svelte` (or new section in App.svelte)

Add a thin progress bar beneath the LiveActivityBar that shows journey completion:

```svelte
{#if $journeyProgress > 0 && $journeyProgress < 100}
  <div class="journey-progress" style="--pct: {$journeyProgress}%">
    <div class="journey-progress-fill"></div>
  </div>
{/if}
```

### 5c. Scroll Position Restoration

**File**: `src-svelte/lib/stores/journeyStore.ts`

The breadcrumb system captures `scrollY` on navigation away. On "back" navigation:

```ts
// In router subscription within journeyStore:
function onRouterChange(newView: AppView) {
  // Save current scroll position to latest breadcrumb
  const currentCrumbs = get(journeyStore).breadcrumbs;
  if (currentCrumbs.length > 0) {
    const last = currentCrumbs[currentCrumbs.length - 1];
    last.scrollY = window.scrollY;
  }

  // Push new breadcrumb
  pushBreadcrumb(newView);

  // Check if navigating "back" (previous breadcrumb matches new view)
  const prev = currentCrumbs[currentCrumbs.length - 2];
  if (prev && prev.view === newView) {
    // Restore scroll position after render
    tick().then(() => {
      window.scrollTo(0, prev.scrollY);
    });
  }
}
```

### 5d. Context Summary on Page Entry

**File**: `AIAssistantPanel.svelte`

When the router changes and the panel is visible, inject a context summary message:

```ts
$: if ($router !== lastSeenView && open) {
  lastSeenView = $router;
  const summary = getPageEntrySummary($router, $jobStore, $journeyStore);
  if (summary) {
    // Don't add if the same summary was just shown
    addContextMessage(summary);
  }
}
```

Example summaries:
- Entering Models from Studio after research complete: "You have 3 completed experiments. Ready to publish a model?"
- Entering Protocol after publishing: "Your model is live! Check your earnings here."
- Entering Network: "847 nodes active. Register your GPU to start earning."

---

## 6. File-by-File Change List

### New Files

| File | Purpose |
|------|---------|
| `src-svelte/lib/stores/journeyStore.ts` | Journey context store with breadcrumbs, milestones, suggestions |

### Modified Files

| File | Changes |
|------|---------|
| `src-svelte/lib/components/AIAssistantPanel.svelte` | (1) Add mobile bottom sheet markup + 3-state CSS. (2) Add touch gesture handlers. (3) Import + wire `journeyStore` for peek text + smart chips. (4) Add page-entry context messages. (5) Safe-area padding. (6) Tablet swipe-to-dismiss. |
| `src-svelte/App.svelte` | (1) Import `journeyStore` and initialize subscriptions. (2) Replace `{#key}` block with cross-fade transition. (3) On mobile, always render AIAssistantPanel (remove `{#if open}` gate, let bottom sheet handle visibility). (4) Remove mobile AI FAB toggle (bottom sheet peek replaces it). |
| `src-svelte/lib/stores/panelStore.ts` | (1) Add `bottomSheetState` writable for mobile. (2) Add `setBottomSheet(state)` method. (3) Adjust `toggleAI` to also handle mobile bottom sheet cycling. |
| `src-svelte/lib/tokens.css` | (1) Add `--sheet-collapsed-height: 64px`. (2) Add `--sheet-half-height: 50vh`. (3) Add `--sheet-handle-height: 64px`. (4) Add `--bottom-sheet-radius: 20px`. |
| `src-svelte/lib/stores/router.ts` | (1) Add `previousView` writable or track last view for back-navigation detection. |
| `src-svelte/lib/stores/agentStore.ts` | (1) Add `addContextMessage(text)` method that adds a system-type agent message without user interaction. |
| `src-svelte/lib/components/LiveActivityBar.svelte` | (1) Import `journeyProgress`. (2) Add journey progress bar markup below the activity bar. |

### Files Read But Not Modified

| File | Reason read |
|------|------------|
| `src-svelte/lib/stores/jobStore.ts` | Understanding phase transitions for milestone triggers |
| `src-svelte/lib/stores/studioStore.ts` | Understanding publish flow for milestone triggers |
| `src-svelte/lib/stores/walletStore.ts` | Understanding wallet connect for milestone triggers |
| `src-svelte/lib/stores/dockStore.ts` | Understanding dock/journey interaction patterns |
| `src-svelte/lib/stores/stageStore.ts` | Understanding page gating for suggestion logic |
| `src-svelte/lib/components/assistant/DesktopAssistantPane.svelte` | Reference for chip/mode patterns |

---

## 7. Implementation Order

### Phase 1: Foundation (journeyStore + panelStore updates)
**Priority**: Highest — everything else depends on this.

1. Create `journeyStore.ts` with state shape, milestone definitions, breadcrumb tracking
2. Add derived stores: `journeySuggestions`, `journeyPeekText`, `journeyProgress`
3. Wire subscriptions to `router`, `jobStore`, `studioStore`, `walletStore`
4. Add `localStorage` persistence for milestones
5. Update `panelStore.ts` with `bottomSheetState` for mobile

**Verification**:
- `npm run build` passes
- Import `journeyStore` in a test page and confirm derived values update on route changes

### Phase 2: Mobile Bottom Sheet
**Priority**: High — core UX improvement.

1. Add window resize listener + `isMobile` / `isTablet` reactive flags to AIAssistantPanel
2. Add drag handle markup + peek text display for collapsed state
3. Add bottom sheet CSS (3 height states, border-radius, safe-area)
4. Implement touch gesture handlers (start/move/end)
5. Implement `resolveSheetSnap` with velocity detection
6. Update `App.svelte` to always mount AIAssistantPanel on mobile (remove `{#if open}` guard for mobile)
7. Remove/hide FAB toggle on mobile (bottom sheet peek replaces it)
8. Add design tokens to `tokens.css`

**Verification**:
- Chrome DevTools mobile emulation: verify 3 sheet states
- Swipe up from collapsed → half → full
- Swipe down from full → half → collapsed
- Fast flick detection works
- 60fps drag performance (check Performance tab)
- Safe area renders correctly on iPhone simulator
- Reduced motion: transitions are instant

### Phase 3: Tablet Swipe Gesture
**Priority**: Medium.

1. Add horizontal swipe-to-dismiss for tablet overlay
2. Verify that existing 320px fixed overlay still works
3. Horizontal drag threshold → close panel

**Verification**:
- iPad emulation: swipe right on panel dismisses it
- Re-open via FAB works correctly

### Phase 4: Smart Chips + Context Messages
**Priority**: Medium.

1. Replace `getQuickChips` with `getSmartChips` in AIAssistantPanel
2. Add `getPageEntrySummary` function
3. Add `addContextMessage` to agentStore
4. Wire router-change → context message injection
5. Test that suggestions change based on journey milestones

**Verification**:
- Complete a research flow: verify chips change at each phase
- Navigate to Models after research complete: verify context message appears
- Navigate to Protocol: verify relevant suggestion chips

### Phase 5: Page Transitions + Progress
**Priority**: Lower.

1. Add cross-fade transition to `{#key routeKey}` block in App.svelte
2. Add journey progress bar to LiveActivityBar
3. Add scroll position save/restore to journeyStore breadcrumbs

**Verification**:
- Page transitions are visually smooth (no flash)
- Progress bar appears and fills based on milestones
- Scroll position restores on back navigation

---

## 8. Verification Checklist

### Build
- [ ] `npm run build` passes with no new warnings
- [ ] No new TypeScript errors

### Desktop (>860px)
- [ ] AI panel opens/closes as before (grid column)
- [ ] Smart chips show journey-aware suggestions
- [ ] Context messages appear on page entry
- [ ] Journey progress bar visible beneath activity bar
- [ ] Page cross-fade transitions work

### Tablet (601-860px)
- [ ] AI panel shows as 320px fixed overlay
- [ ] Swipe right gesture dismisses panel
- [ ] FAB toggle still works
- [ ] Nav/AI mutual exclusivity preserved

### Mobile (<=600px)
- [ ] Bottom sheet renders with peek bar in collapsed state
- [ ] Peek text shows current context (e.g., "Research: 45%")
- [ ] Tap peek bar cycles collapsed → half → full
- [ ] Swipe up expands, swipe down collapses
- [ ] Fast flick detection works
- [ ] Sheet respects safe areas (notch, home indicator)
- [ ] 60fps during drag (no jank)
- [ ] FAB toggle hidden (bottom sheet peek replaces it)
- [ ] Full state shows complete conversation
- [ ] Half state shows chips + last message + input
- [ ] Input keyboard does not break sheet positioning

### Journey Store
- [ ] Breadcrumbs track page visits with timestamps
- [ ] Milestones fire on correct triggers
- [ ] Milestones persist across page reloads (localStorage)
- [ ] Suggestions update reactively based on state changes
- [ ] Scroll position restores on back navigation

### Accessibility
- [ ] Bottom sheet handle has proper ARIA role + label
- [ ] Reduced motion: all transitions are instant
- [ ] Focus management: opening sheet focuses first interactive element
- [ ] Keyboard: Escape closes/collapses sheet

### Performance
- [ ] No new runtime store subscriptions that run on every tick
- [ ] Bottom sheet drag uses transform (GPU composited layer)
- [ ] journeyStore breadcrumbs capped at 20 entries
- [ ] No memory leaks from unsubscribed store listeners

---

## Architectural Decisions

### Why a separate journeyStore instead of extending existing stores?
Each existing store (jobStore, studioStore, walletStore) owns its domain. The journey concept crosses all domains. A dedicated store that subscribes to others and computes cross-cutting derived state follows the existing pattern (similar to how `jobDerived.ts` derives from `jobState`).

### Why keep AIAssistantPanel as a single file?
The constraint says to avoid splitting it unnecessarily. The bottom sheet logic is tightly coupled to the panel's rendering, and the gesture handlers need direct access to the panel's DOM elements. A single file with clear section comments is more maintainable than scattered sub-components for this case.

### Why CSS height transitions instead of JS-driven spring animation?
CSS transitions with `var(--ease-spring)` (already defined in tokens.css) provide 60fps performance without JS overhead. During active drag, inline transforms bypass the transition for instant feedback. On snap, the CSS transition provides the spring-physics feel. This avoids adding a spring physics library dependency.

### Why not use Svelte `spring()` store?
Svelte's built-in `spring()` is suitable but would create a continuous animation loop that is unnecessary for a snap-to-position sheet. The CSS `cubic-bezier(0.34, 1.56, 0.64, 1)` (already `--ease-spring` in tokens) achieves the same overshoot effect with zero JS cost after the snap triggers.
