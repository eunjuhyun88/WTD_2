# W-0375 Phase 3 — Architecture: Portable Panel System

**Goal**: Restructure TradeMode panels (AnalyzePanel, ScanPanel, JudgePanel) into a **portable, testable, TradingView-grade component system** with clear separation of data composition, presentation, and routing.

**Outcome**: Panels become **reusable across different modes/contexts** (not just TradeMode); **Props surface contracts shrink 60%**; **testability improves** (mock data vs. derived stores).

---

## Current State (Phase 2.6)

| File | Lines | Props | Issue |
|---|---|---|---|
| AnalyzePanel.svelte | 996 | 18 (bloated) | All raw data; no composition layer |
| ScanPanel.svelte | 397 | 8 | Direct `shellStore.openTab` call (coupling) |
| JudgePanel.svelte | 467 | 16 (bloated) | Callback spaghetti |
| TradeMode.svelte | 3206 | — | 150+ derived stores inline |

**Pain points**:
- Props = "data dump" (no abstraction)
- Tight coupling to TradeMode store state
- CSS duplication across 4 files
- Hard to mock / unit-test panel in isolation
- Hard to use panel in another mode/page

---

## Architecture Design

### Layer 1: Data Composition (`lib/cogochi/modes/composition/`)

**Purpose**: Extract all TradeMode derived stores into **mode-agnostic composition functions**.

```typescript
// lib/cogochi/modes/composition/useAnalyzeComposition.ts
export interface AnalyzeCompositionData {
  direction: string;
  thesis: string;
  phaseTimeline: PhaseNode[];
  microstructureView: 'footprint' | 'heatmap';
  domLadderRows: DomRow[];
  timeSalesRows: TapeRow[];
  footprintRows: FootprintRow[];
  heatmapRows: HeatmapRow[];
  evidenceTableRows: EvidenceRow[];
  compareCards: CompareCard[];
  ledgerStats: LedgerStat[];
  judgmentOptions: JudgmentOption[];
  executionProposal: ExecProposal[];
}

export function useAnalyzeComposition(
  analyzeData: any,
  analyzeDetailDirection: string,
  analyzeDetailThesis: string,
  analyzeEvidenceItems: any[],
  // ... other source data
): AnalyzeCompositionData {
  const phaseTimeline = $derived.by(() => { /* logic from TradeMode */ });
  const domLadderRows = $derived.by(() => { /* ... */ });
  // ...
  return {
    direction: analyzeDetailDirection,
    thesis: analyzeDetailThesis,
    phaseTimeline,
    // ... all derived data
  };
}
```

**Rationale**:
- Keeps TradeMode **source** (raw state) but extracts **derivation logic** into reusable functions
- Easy to unit-test: just call `useAnalyzeComposition({...mock data...})`
- Easy to reuse: any page with same source data can call same composition
- Svelte reactivity preserved: `$derived.by()` works in composition functions

### Layer 2: Presentation Props (Minimal Contracts)

**Purpose**: Each panel accepts **only what it renders**, bundled into 2-3 simple objects.

```typescript
// AnalyzePanel.svelte
interface AnalyzePanelProps {
  data: AnalyzeCompositionData;  // All data in one object
  actions: {
    onOpenCompareWorkspace: () => void;
    onSetJudgeVerdict: (v: 'agree' | 'disagree') => void;
    onOpenJudgeWorkspace: () => void;
    onOpenAnalyzeAIDetail: () => void;
    onStartSaveSetup: () => void;
  };
  state?: { microstructureView?: string };  // Optional UI state
}

// Usage in TradeMode:
const analyzeComp = useAnalyzeComposition(...);
<AnalyzePanel
  data={analyzeComp}
  actions={{onOpenCompareWorkspace, onSetJudgeVerdict, ...}}
/>
```

**Benefits**:
- **18 props → 3 objects** (data, actions, state)
- **Easy to mock**: `<AnalyzePanel data={{...}} actions={{...}} />`
- **Testable**: no store coupling needed
- **Portable**: can render in storybook, docs, other modes

### Layer 3: Routing (AIAgentPanel Integration)

**Purpose**: AIAgentPanel routes between panels using **composition layer**, not direct panel invocation.

```typescript
// AIAgentPanel.svelte (Phase 3.1)
<script>
  const analyzeComp = useAnalyzeComposition(...);
  const scanComp = useScanComposition(...);
  const judgeComp = useJudgeComposition(...);
</script>

{#if rightPanelTab === 'analyze'}
  <AnalyzePanel data={analyzeComp} actions={{...}} />
{:else if rightPanelTab === 'scan'}
  <ScanPanel data={scanComp} actions={{...}} />
{:else if rightPanelTab === 'judge'}
  <JudgePanel data={judgeComp} actions={{...}} />
{/if}
```

### Layer 4: CSS Architecture (Scoped + Shared Base)

**Current**: TradeMode + 3 panels each have full 2100-line style block (duplication).

**New**:
```
styles/
  ├─ panel-base.css          (shared: .spacer, transitions, color vars)
  ├─ AnalyzePanel.css        (only .workspace-*, .phase-*, .dom-*)
  ├─ ScanPanel.css           (only .scan-*, .tm-past-*)
  └─ JudgePanel.css          (only .tm-act-*, .judge-*, .rj-*)

TradeMode.svelte
  ├─ <style>
  │   @import 'panel-base.css';
  │   /* TradeMode layout only: .trade-mode, .chart-*, .drawer-* */
  │   /* NO .workspace-*, .scan-*, .judge-* here */
```

**Benefits**:
- Dedup across all 4 files (saves ~1000 lines)
- Each panel is visually self-contained
- Easy to customize per-panel styling without side-effects

---

## Execution Plan (Phase 3 → Phase 3.3)

### Phase 3.1: Extract Composition Layer (2 hours)

**Output**: 
- `lib/cogochi/modes/composition/useAnalyzeComposition.ts` (150 lines)
- `lib/cogochi/modes/composition/useScanComposition.ts` (60 lines)
- `lib/cogochi/modes/composition/useJudgeComposition.ts` (80 lines)
- Types file: `lib/cogochi/modes/composition/types.ts` (50 lines)

**Work**:
1. Move all `const phaseTimeline = $derived.by(...)` from TradeMode → `useAnalyzeComposition`
2. Move all scan-related deriveds → `useScanComposition`
3. Move all judge-related deriveds → `useJudgeComposition`
4. Keep source variables in TradeMode (analyzeData, analyzeDetailDirection, etc.)
5. TradeMode calls compositions: `const analyzeComp = useAnalyzeComposition(...source vars...)`

**Validation**:
- svelte-check: 0 errors
- npm test: 493/493 pass
- Derived reactivity preserved (visually identical)

### Phase 3.2: Refactor Panel Props (1.5 hours)

**Output**: Updated panel Props signatures + TradeMode call sites

**Work**:
1. Rewrite AnalyzePanel Props: `interface AnalyzePanelProps { data, actions, state }`
2. Rewrite ScanPanel Props: `interface ScanPanelProps { data, actions }`
3. Rewrite JudgePanel Props: `interface JudgePanelProps { data, actions, state }`
4. Update TradeMode invocations:
   ```svelte
   {#if drawerTab === 'analyze'}
     <AnalyzePanel 
       data={analyzeComp}
       actions={{onOpenCompareWorkspace, onSetJudgeVerdict, ...}}
       state={{microstructureView}}
     />
   ```
5. Remove `shellStore` direct calls from ScanPanel → pass callback via actions

**Validation**:
- svelte-check: 0 errors
- npm test: 493/493 pass
- No visual regression

### Phase 3.3: CSS Dedup → Separate Files (1 hour)

**Output**: `styles/panel-*.css` files; TradeMode/panels cleaned

**Work**:
1. Create `styles/panel-base.css`: shared color tokens, spacer, transitions
2. Create `styles/AnalyzePanel.css`: extract only `.workspace-*`, `.phase-*`, `.dom-*` rules from TradeMode
3. Create `styles/ScanPanel.css`: extract only `.scan-*`, `.tm-past-*` rules
4. Create `styles/JudgePanel.css`: extract only `.tm-act-*`, `.judge-*`, `.rj-*` rules
5. Update `<style>` blocks:
   - TradeMode: `@import 'panel-base.css'` + layout/chart rules only
   - Each panel: `@import 'panel-base.css'` + own rules
6. Run unused-selector filter (Python script from P2.6)

**Validation**:
- svelte-check: 0 errors, <100 warnings
- npm test: 493/493 pass
- Visual regression test (manual or snapshot)

---

## File Structure After Phase 3

```
app/src/lib/cogochi/
├─ modes/
│  ├─ composition/
│  │  ├─ useAnalyzeComposition.ts    [NEW] 150L
│  │  ├─ useScanComposition.ts       [NEW] 60L
│  │  ├─ useJudgeComposition.ts      [NEW] 80L
│  │  └─ types.ts                   [NEW] 50L
│  ├─ AnalyzePanel.svelte           [REFACTOR] 750L (was 996L)
│  ├─ ScanPanel.svelte              [REFACTOR] 280L (was 397L)
│  ├─ JudgePanel.svelte             [REFACTOR] 350L (was 467L)
│  └─ TradeMode.svelte              [REFACTOR] 2400L (was 3206L)
└─ styles/
   ├─ panel-base.css                [NEW] 150L
   ├─ AnalyzePanel.css              [NEW] 600L
   ├─ ScanPanel.css                 [NEW] 200L
   └─ JudgePanel.css                [NEW] 220L
```

**Total reduction**: TradeMode 3206 → 2400 (25%), Panels 1860 → 1380 (26%), **Net -1400 lines** vs. current duplicate CSS.

---

## Exit Criteria

- ✅ Phase 3.1: Compositions extracted; all deriveds moved; TradeMode calls compositions; visual identical
- ✅ Phase 3.2: Panel Props minimized (3-2 objects each); ScanPanel callback-based (no `shellStore`); Travis green
- ✅ Phase 3.3: CSS split into separate files; no duplication; svelte-check <100 warnings; 493/493 tests pass
- ✅ Final: Panels are **importable** into another .svelte file (e.g., storybook) and renderable with mock data (zero TradeMode coupling)

---

## Design Rationale

**Why composition layer?**
- Svelte 5 doesn't have Vue's "composables pattern" natively, but `$derived.by()` + exported functions = same effect
- Keeps source data in TradeMode (single source of truth) but makes derivation logic **reusable and testable**
- Avoids "extract into store" anti-pattern (stores = global state; we want local composition)

**Why minimal Props?**
- TradeView / Bloomberg / TradingView all use **facade pattern** for component contracts
- 2-3 objects = clean API surface; easy to document; easy to test
- Scales: adding 1 new handler = 1 line in actions object, not 18 new props

**Why CSS separation?**
- Current: 4 files × 2100 lines of CSS = 8400 total (but 1400 shared duplication)
- After: 4 panels × 200-600 lines + 150-line base + 2100-line layout = 4000 total
- **50% CSS reduction** + zero coupling

---

## Risk Mitigation

| Risk | Mitigation |
|---|---|
| Reactivity breaks (derived scope) | Phase 3.1 validation: visual test after composition move |
| Props refactor causes call-site errors | Phase 3.2: incremental; one panel at a time |
| CSS import order issues | Phase 3.3: use `@import` at top of each `<style>` |
| Tests fail (mock data shape changes) | Phase 3.2: update mock data in test files alongside Props refactor |

---

## Deliverables

1. Design doc (this file)
2. Phase 3.1 commit: composition functions extracted
3. Phase 3.2 commit: Props refactored
4. Phase 3.3 commit: CSS split + deduped
5. Updated CURRENT.md with Phase 3 → Phase 4 roadmap

---

## Success Metrics

After Phase 3, panels should be **production-ready portable**:
- ✅ Can be rendered in isolation (storybook / docs)
- ✅ Zero TradeMode coupling (composition layer is the contract)
- ✅ Props are self-documenting (2-3 objects, not 18+ params)
- ✅ CSS is maintainable (no duplication, separate concerns)
- ✅ Tests are easier to write (mock data in, HTML out)
