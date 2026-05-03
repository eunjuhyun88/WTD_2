// ═══════════════════════════════════════════════════════════════
// paneLayoutStore — indicator pane visibility + stretch persistence
// ═══════════════════════════════════════════════════════════════
//
// Decouples pane show/hide and manual resize (stretchFactor)  from
// ChartBoard so the same state can be shared across ChartCanvas and
// MultiPaneChart without re-implementing persistence.
//
// localStorage key: "pane_layout::v1"
// Keyed per-chart when `chartId` is provided (multi-chart support).

export type PaneKind = 'rsiOrMacd' | 'oi' | 'cvd' | 'funding' | 'liq';

/** Maximum number of extra indicator panes mountable via multi-instance (W-0399). */
export const MAX_EXTRA_PANES = 12;

export const PANE_KINDS: PaneKind[] = ['rsiOrMacd', 'oi', 'cvd', 'funding', 'liq'];

export interface PaneLayoutState {
  /** Whether the pane is allowed to render (mirrors chartIndicators store). */
  visibility: Record<PaneKind, boolean>;
  /**
   * Relative stretch factors (price pane is always 4).
   * Default 1 for each indicator pane.
   */
  stretch: Record<PaneKind, number>;
}

const DEFAULT_STATE: PaneLayoutState = {
  visibility: { rsiOrMacd: true, oi: true, cvd: true, funding: true, liq: true },
  stretch:    { rsiOrMacd: 1,    oi: 1,    cvd: 1,    funding: 1,    liq: 1    },
};

function storageKey(chartId?: string): string {
  return chartId ? `pane_layout::v1::${chartId}` : 'pane_layout::v1';
}

function load(chartId?: string): PaneLayoutState {
  if (typeof localStorage === 'undefined') return structuredClone(DEFAULT_STATE);
  try {
    const raw = localStorage.getItem(storageKey(chartId));
    if (!raw) return structuredClone(DEFAULT_STATE);
    const parsed = JSON.parse(raw) as Partial<PaneLayoutState>;
    // Merge with defaults so new keys added in future releases are populated.
    return {
      visibility: { ...DEFAULT_STATE.visibility, ...(parsed.visibility ?? {}) },
      stretch:    { ...DEFAULT_STATE.stretch,    ...(parsed.stretch    ?? {}) },
    };
  } catch {
    return structuredClone(DEFAULT_STATE);
  }
}

function save(state: PaneLayoutState, chartId?: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(storageKey(chartId), JSON.stringify(state));
  } catch { /* quota exceeded or private-mode — silently ignore */ }
}

// ── Svelte-free reactive store (works with $state rune via bind) ─────────────

export interface PaneLayoutStore {
  readonly state: PaneLayoutState;
  setVisibility(kind: PaneKind, visible: boolean): void;
  toggleVisibility(kind: PaneKind): void;
  setStretch(kind: PaneKind, factor: number): void;
  /** Reset all stretch factors to 1 (double-click on resizer handle). */
  resetStretch(): void;
  /** Replace entire visibility map (e.g. from chartIndicators store sync). */
  syncVisibility(next: Partial<Record<PaneKind, boolean>>): void;
}

/**
 * Create a pane layout store backed by localStorage.
 *
 * Usage in Svelte 5:
 *   const layout = createPaneLayoutStore();
 *   // read:  layout.state.visibility.oi
 *   // write: layout.setStretch('oi', 1.5)
 */
export function createPaneLayoutStore(chartId?: string): PaneLayoutStore {
  let state = $state<PaneLayoutState>(load(chartId));

  function persist() {
    save(state, chartId);
  }

  return {
    get state() { return state; },

    setVisibility(kind, visible) {
      state = { ...state, visibility: { ...state.visibility, [kind]: visible } };
      persist();
    },

    toggleVisibility(kind) {
      this.setVisibility(kind, !state.visibility[kind]);
    },

    setStretch(kind, factor) {
      const clamped = Math.max(0.5, Math.min(8, factor));
      state = { ...state, stretch: { ...state.stretch, [kind]: clamped } };
      persist();
    },

    resetStretch() {
      state = { ...state, stretch: { ...DEFAULT_STATE.stretch } };
      persist();
    },

    syncVisibility(next) {
      state = { ...state, visibility: { ...state.visibility, ...next } };
      persist();
    },
  };
}
