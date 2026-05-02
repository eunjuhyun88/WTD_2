# Phase D-0 — Layout Grid Skeleton (2일)

**목표**: 5-zone CSS grid 구조 정의 + TopBar 구현 + Design tokens 정리

**Branch**: `feat/W-0374-phase-d0-layout`

---

## 1. Files to Create

### 1.1 `app/src/lib/cogochi/components/TopBar.svelte` (NEW)

**Props**:
```typescript
interface Props {
  onSymbolTap?: () => void;
  onIndicators?: () => void;
}
```

**Structure (48px, persistent)**:
```
┌──────────────────────────────────────────────────────┐
│ [⌘K] BTC/USDT +1.2% | [1m][3m][5m]...[4h][1D]      │
│                                      🔵Pro [Trade▾]  │
└──────────────────────────────────────────────────────┘
```

**Sections**:
1. **Left (⌘K + Symbol search)** — 100px
   - Input placeholder: "Search symbols…"
   - onClick → fire `onSymbolTap()`

2. **Center-left (Active symbol + 24h change)** — flex (min 120px)
   - Display: "BTC/USDT" + "+1.2%/24h"
   - Update on symbol change (from shell.store)

3. **Center (Timeframe picker)** — 220px (8 buttons)
   - Buttons: [1m][3m][5m][15m][30m][1h][4h][1D]
   - Active: bold + underline (amber color)
   - Keyboard: 1-8 switches TF

4. **Right (Wallet + Tier + Mode)** — 180px
   - Wallet status dot (● green/amber/red)
   - Tier badge ("Pro", "Free", etc.)
   - Mode dropdown ([Trade▾])
   - onClick Mode dropdown → open WorkspacePresetPicker

**Data bindings**:
```typescript
// From shell.store:
- symbol: string
- timeframe: Timeframe (union: '1m' | '3m' | ... | '1D')
- wallet.balance: number (for tooltip)
- wallet.tier: string
- workMode: ShellWorkMode

// From route params:
- ?symbol=BTCUSDT
- ?tf=1h
- ?panel=decision
```

**Styling**:
- Height: 48px (fixed)
- Background: var(--g1) with 1px bottom border
- Font: mono for values, sans for labels
- Hover: slight bg highlight on interactive elements
- Responsive: at 768px, compress into mobile layout (defer to Phase D-8)

**AC (Acceptance Criteria)**:
- AC-D0-1: TopBar renders 48px height (no overflow)
- AC-D0-2: Symbol search input focuses on ⌘K (global hotkey)
- AC-D0-3: TF picker buttons work (1-8 keyboard shortcuts)
- AC-D0-4: Wallet dot shows status (no data = gray placeholder)
- AC-D0-5: Mode dropdown opens WorkspacePresetPicker

---

## 2. Files to Modify

### 2.1 `app/src/lib/cogochi/AppShell.svelte`

**Current issue**: No TopBar import/render

**Changes**:

1. **Add import**:
```typescript
import TopBar from './components/TopBar.svelte';
```

2. **Update grid structure** (desktop section, before main-row):

**CURRENT** (line 238-246):
```svelte
<TopBar
  onSymbolTap={() => (desktopSymbolPickerOpen = true)}
  onIndicators={() => (indicatorSettingsOpen = true)}
/>
```

✅ Already present! But verify it's wired correctly.

3. **Verify CSS grid layout** (after StatusBar, around line 380-404):

Should be:
```css
.app-shell {
  display: flex;
  flex-direction: column;
  height: 100dvh;
}

.main-row {
  flex: 1;
  display: flex;
  overflow: hidden;
  min-height: 0;
}
```

**5-Zone mapping**:
```
┌─────────────────────────────────────────┐  ← TopBar (48px)
├─────────────────────────────────────────┤  ← NewsFlashBar (28px, dismissable)
├──┬──┬─────────────────────────┬─────────┤  ← main-row (flex:1)
│  │  │                         │  AI     │
│  │  │  chart-stage (flex:1)   │  panel  │
│  │  │                         │  (320px)│
├──┴──┴─────────────────────────┴─────────┤  ← StatusBar (32px)
└─────────────────────────────────────────┘
```

**Current main-row structure** (line 399-405):
```css
.main-row {
  flex: 1;
  display: flex;
  overflow: hidden;
  min-height: 0;
}

.sidebar-pane { flex-shrink: 0; display: flex; overflow: hidden; }
.canvas-col { flex: 1; min-width: 0; display: flex; flex-direction: column; overflow: hidden; }
.ai-pane { flex-shrink: 0; overflow: hidden; }
```

✅ Already correct! Verify widths:
- sidebar-pane: `Math.max(180, $shellStore.sidebarWidth)px` ← OK
- ai-pane: `aiPaneWidth` (320-480px) ← OK

**AC**:
- AC-D0-6: main-row uses flex layout (not grid)
- AC-D0-7: sidebar 56-200px fold/expand (persist to localStorage)
- AC-D0-8: ai-pane 320-480px (not fixed, expandable)
- AC-D0-9: No overflow on any zone (min-height: 0)

---

### 2.2 `app/src/lib/cogochi/shell.store.ts`

**Current issue**: Might not have all necessary fields for Phase D-0

**Required fields** (verify/add):
```typescript
export interface TabState {
  // Existing
  symbol?: string;
  timeframe?: Timeframe; // type alias: '1m' | '3m' | ... | '1D'
  
  // Phase D-0 additions
  rightPanelExpanded?: boolean; // 320 ↔ 480px toggle
  rightPanelTab?: RightPanelTab; // 'decision' | 'analyze' | 'scan' | 'judge' | 'pattern'
  
  // Existing but verify
  chat?: { role: 'user' | 'assistant'; text: string }[];
  peekOpen?: boolean;
  drawerTab?: string;
}

export type RightPanelTab = 'decision' | 'analyze' | 'scan' | 'judge' | 'pattern';
export type Timeframe = '1m' | '3m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1D';
export type ShellWorkMode = 'observe' | 'analyze' | 'execute' | 'decide';
```

**Verify shell-level store fields**:
```typescript
export interface ShellState {
  // Existing
  activeTabId: string;
  tabs: Tab[];
  sidebarWidth: number;
  aiWidth: number;
  workMode: ShellWorkMode;
  
  // Verify these exist + add if missing
  sidebarVisible: boolean;
  aiVisible: boolean;
}
```

**Verify methods**:
```typescript
setSymbol(sym: string): void
setTimeframe(tf: Timeframe): void
setRightPanelTab(tab: RightPanelTab): void
setRightPanelExpanded(exp: boolean): void
resizeSidebar(dx: number): void
resetSidebarWidth(): void
resizeAI(dx: number): void
resetAIWidth(): void
```

**AC**:
- AC-D0-10: shell.store has all required fields
- AC-D0-11: setSymbol/setTimeframe update correctly
- AC-D0-12: Sidebar fold state persists (localStorage)

---

### 2.3 `app/src/lib/cogochi/components/StatusBar.svelte`

**Current**: Exists but might need minimal updates for Phase D-0

**Verify exists** (check line counts, styling):
```bash
wc -l app/src/lib/cogochi/components/StatusBar.svelte
# Should be ~200-300 lines
```

**What StatusBar shows** (32px):
```
F60 mini ▓▓▓░ 0.73 | Freshness 14s | mini Verdict WAIT | System ●●●● OK
```

**AC**:
- AC-D0-13: StatusBar 32px (fixed height)
- AC-D0-14: Layout: 4 sections left-to-right (no right padding)

---

### 2.4 `app/src/lib/cogochi/components/WatchlistRail.svelte`

**Current**: Exists but verify fold/expand state

**Key features**:
- Fold button (56px) ↔ expand (200px)
- Sparklines per symbol
- Whale alerts collapsible

**State**:
```typescript
let folded = $state(localStorage.getItem('cogochi.watchlist.folded') === 'true');

function toggleFold() {
  folded = !folded;
  localStorage.setItem('cogochi.watchlist.folded', String(folded));
}
```

**AC**:
- AC-D0-15: Fold state persists (localStorage key: `cogochi.watchlist.folded`)
- AC-D0-16: Width 56px when folded, 200px when expanded

---

## 3. Design Tokens File (NEW)

**Create**: `app/src/lib/cogochi/design-tokens.ts`

```typescript
// Color system (from +page.svelte global styles)
export const COLORS = {
  // Neutral grays
  g0: '#060504',
  g1: '#0c0a09',
  g2: '#131110',
  g3: '#1c1918',
  g4: '#272320',
  g5: '#3d3830',
  g6: '#706a62',
  g7: '#a8a09a',
  g8: '#cec9c4',
  g9: '#eceae8',

  // Brand colors
  brand: '#ff7f85',
  brandDark: '#3a1618',
  brandDarker: '#120507',

  // Semantic
  pos: '#34c470',     // bullish
  posDark: '#0d3e22',
  posLight: '#04110a',

  neg: '#e85555',     // bearish
  negDark: '#4a1818',
  negLight: '#130606',

  amb: '#d4a442',     // amber (alert)
  ambDark: '#3a2d10',
  ambLight: '#110c04',
};

export const SPACING = {
  xs: '2px',
  sm: '4px',
  md: '8px',
  lg: '12px',
  xl: '16px',
  '2xl': '24px',
  '3xl': '32px',
};

export const RADIUS = {
  none: '0px',
  sm: '2px',
  md: '4px',
  lg: '8px',
};

export const SIZES = {
  // Z-index layers
  zDropdown: 100,
  zModal: 200,
  zToast: 300,

  // Chrome sizes
  topBar: 48,
  newsFlash: 28,
  statusBar: 32,
  tabBar: 28,
  chartToolbar: 36,
  paneInfoBar: 24,

  // Panel sizes
  sidebarFolded: 56,
  sidebarExpanded: 200,
  aiPanelDefault: 320,
  aiPanelExpanded: 480,
  drawingToolbar: 40,
};

export const TRANSITIONS = {
  fast: '0.08s',
  normal: '0.12s',
  slow: '0.2s',
};
```

**AC**:
- AC-D0-17: Design tokens file exists and exports all constants
- AC-D0-18: Used in styled components (no magic numbers in CSS)

---

## 4. Keyboard Shortcuts (Phase D-0 foundation)

**Add to AppShell.svelte keyboard handler** (line 110-140):

```typescript
const onKey = (e: KeyboardEvent) => {
  const mod = e.metaKey || e.ctrlKey;
  
  // ⌘K: Open symbol search
  if (mod && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    desktopSymbolPickerOpen = true;
  }

  // 1-8: Switch timeframe (TopBar integration)
  if (!isInputActive() && /^[1-8]$/.test(e.key)) {
    const tfIndex = parseInt(e.key) - 1;
    const tfs: Timeframe[] = ['1m', '3m', '5m', '15m', '30m', '1h', '4h', '1D'];
    if (tfs[tfIndex]) {
      e.preventDefault();
      shellStore.setTimeframe(tfs[tfIndex]);
    }
  }

  // B: Toggle range selection mode
  if (!mod && e.key.toLowerCase() === 'b' && !isInputActive()) {
    e.preventDefault();
    chartSaveMode.enterRangeMode();
  }

  // Escape: Close everything (priority)
  if (e.key === 'Escape') {
    if (desktopSymbolPickerOpen) desktopSymbolPickerOpen = false;
    if (chartSaveMode.snapshot().active) chartSaveMode.exitRangeMode();
  }
};
```

**AC**:
- AC-D0-19: ⌘K opens symbol picker
- AC-D0-20: 1-8 keys switch timeframes (no lag)
- AC-D0-21: B toggles range selection

---

## 5. Testing Strategy (Phase D-0)

### Unit Tests (Vitest)

```typescript
// TopBar.test.ts
describe('TopBar', () => {
  it('should render symbol search input', () => {
    const { getByPlaceholderText } = render(TopBar, { props: {} });
    expect(getByPlaceholderText('Search symbols…')).toBeVisible();
  });

  it('should render all 8 timeframe buttons', () => {
    const { getAllByRole } = render(TopBar, { props: {} });
    const buttons = getAllByRole('button').filter(b => /[1-9]/.test(b.textContent || ''));
    expect(buttons).toHaveLength(8);
  });

  it('should highlight active timeframe', () => {
    const { getByText } = render(TopBar, { props: { timeframe: '4h' } });
    const btn4h = getByText('4h');
    expect(btn4h).toHaveClass('active');
  });

  it('should fire onSymbolTap when search is clicked', () => {
    const onSymbolTap = vi.fn();
    const { getByPlaceholderText } = render(TopBar, { props: { onSymbolTap } });
    getByPlaceholderText('Search symbols…').click();
    expect(onSymbolTap).toHaveBeenCalled();
  });
});

// shell.store.test.ts
describe('shell.store', () => {
  it('should update symbol and persist', () => {
    const { subscribe } = shellStore;
    shellStore.setSymbol('ETHUSDT');
    let state: any;
    subscribe(s => { state = s; })();
    expect(state.activeTabState.symbol).toBe('ETHUSDT');
  });

  it('should switch timeframe with keyboard hotkey', () => {
    // Test via keyboard handler
    const event = new KeyboardEvent('keydown', { key: '4' });
    // Simulate handler fire
    expect(onKey(event)).toCallsetTimeframe('4h');
  });
});
```

**Run tests**:
```bash
npm run test -- TopBar.test.ts shell.store.test.ts
```

**AC**:
- AC-D0-22: TopBar tests pass (≥4 tests)
- AC-D0-23: shell.store tests pass (≥3 tests)

---

## 6. Visual Regression Check (Playwright, optional for Phase D-0)

**Basic layout screenshot test**:
```typescript
test('TopBar renders without overflow', async ({ page }) => {
  await page.goto('/cogochi');
  const topbar = page.locator('[class*="topbar"]');
  const height = await topbar.evaluate(el => el.offsetHeight);
  expect(height).toBe(48);
});

test('Main-row zones are visible', async ({ page }) => {
  await page.goto('/cogochi');
  const sidebar = page.locator('[class*="sidebar"]');
  const canvas = page.locator('[class*="canvas"]');
  const aiPane = page.locator('[class*="ai-pane"]');
  
  await expect(sidebar).toBeVisible();
  await expect(canvas).toBeVisible();
  await expect(aiPane).toBeVisible();
});
```

**AC**:
- AC-D0-24: Layout screenshot matches baseline (no horizontal overflow)
- AC-D0-25: All 5 zones visible on desktop (1920×1080)

---

## 7. Acceptance Criteria Master (Phase D-0)

| AC | Criterion | Status |
|---|---|---|
| AC-D0-1 | TopBar height 48px (no overflow) | Verify |
| AC-D0-2 | ⌘K opens symbol picker | Implement |
| AC-D0-3 | 1-8 switches timeframe | Implement |
| AC-D0-4 | Wallet dot shows status | Implement |
| AC-D0-5 | Mode dropdown opens | Implement |
| AC-D0-6 | main-row flex layout | Verify |
| AC-D0-7 | Sidebar 56-200px fold/expand | Verify |
| AC-D0-8 | AI panel 320-480px expandable | Verify |
| AC-D0-9 | No overflow on zones | Verify |
| AC-D0-10 | shell.store has all fields | Verify |
| AC-D0-11 | setSymbol/setTimeframe work | Verify |
| AC-D0-12 | Sidebar fold persists (localStorage) | Verify |
| AC-D0-13 | StatusBar 32px height | Verify |
| AC-D0-14 | StatusBar 4-section layout | Verify |
| AC-D0-15 | WatchlistRail fold state persists | Verify |
| AC-D0-16 | WatchlistRail 56-200px toggle | Verify |
| AC-D0-17 | Design tokens file exists | Create |
| AC-D0-18 | Design tokens used (no magic #s) | Implement |
| AC-D0-19 | ⌘K hotkey works | Test |
| AC-D0-20 | 1-8 TF hotkeys work | Test |
| AC-D0-21 | B range mode hotkey works | Test |
| AC-D0-22 | TopBar tests pass | Test |
| AC-D0-23 | shell.store tests pass | Test |
| AC-D0-24 | Layout screenshot baseline | Verify |
| AC-D0-25 | All 5 zones visible | Verify |

---

## 8. PR Strategy (Phase D-0)

**Single PR**: `feat/W-0374-phase-d0-layout`

**Commits** (atomic):
1. `feat(TopBar): create global navigation header (48px)`
2. `feat(design-tokens): consolidate color, spacing, sizing constants`
3. `feat(shell.store): extend TabState with phase-d0 fields`
4. `feat(keyboard): add hotkeys ⌘K, 1-8, B, Esc`
5. `test(D0): add TopBar + shell.store test suite`
6. `chore(D0): verify grid layout, update CURRENT.md`

**PR Title**: `feat(W-0374 Phase D-0): Layout grid skeleton + TopBar + design tokens`

**PR Description**:
```
## Phase D-0 — Layout Grid Foundation

Implements the 5-zone CSS grid structure and TopBar component as the foundation for W-0374 Bloomberg-grade UX redesign.

### Changes
- TopBar.svelte: Global 48px header (symbol search, TF picker, wallet, mode)
- design-tokens.ts: Centralized color/spacing/sizing constants
- shell.store: Extended TabState + required methods
- AppShell: Verified 5-zone grid layout
- Keyboard: Added hotkeys (⌘K, 1-8, B, Esc)

### Acceptance Criteria
- AC-D0-1 through AC-D0-25 (see PHASE-D0-LAYOUT.md)

### Testing
- Unit: TopBar, shell.store (≥7 tests)
- Visual: Layout screenshot baseline
- Manual: Keyboard hotkeys responsive

### Next Phase
Phase D-1 (WatchlistRail polish) — Fold toggle, sparklines, whale alerts
```

---

## 9. Exit Criteria (Phase D-0 Complete)

**Definition of Done**:
1. ✅ All AC-D0-1 through AC-D0-25 pass
2. ✅ 0 TypeScript errors (`svelte-check`)
3. ✅ All new tests pass (`npm run test`)
4. ✅ Bundle size +<5% (measured post-build)
5. ✅ No console errors on `/cogochi` load
6. ✅ PR merged to main
7. ✅ CURRENT.md updated with new SHA

---

**Timeline**: 2 days (day 1: impl + test, day 2: refinement + merge)

**Start**: Ready when PR #857, #858 merge

**Owner**: @eunjuhyun88 (frontend implementation)
