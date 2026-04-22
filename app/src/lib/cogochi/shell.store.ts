import { writable, derived } from 'svelte/store';
import { defaultVisible } from '$lib/indicators/registry';
import {
  DEFAULT_ANALYZE_PANEL_LAYOUT,
  normalizeAnalyzePanelLayout,
  type AnalyzePanelLayoutState,
} from '$lib/contracts/cogochiPanelLayout';

export interface TabState {
  tradePrompt: string;
  rangeSelection: boolean;
  setupTokens: any;
  verdicts: Record<string, 'agree' | 'disagree'>;
  selectedScan: string;
  scanView: 'grid' | 'list';
  expandedSample: string | null;
  chat: Array<{ role: 'user' | 'assistant'; text: string }>;
  peekOpen: boolean;
  peekHeight: number;
  drawerTab: 'analyze' | 'scan' | 'judge';
  layoutMode: 'C';
  analyzeLayout: AnalyzePanelLayoutState;
}

export interface Tab {
  id: string;
  kind: 'trade' | 'train' | 'flywheel' | 'capture' | 'rule' | 'rejudge';
  mode: 'trade' | 'train' | 'flywheel';
  title: string;
  locked: boolean;
  tabState: TabState;
  extra?: any;
}

export interface ShellState {
  tabs: Tab[];
  activeTabId: string;
  sidebarVisible: boolean;
  aiVisible: boolean;
  activeSection: 'library' | 'verdicts' | 'rules';
  sidebarWidth: number;
  aiWidth: number;
  canvasSplitY: number; // % height of analyze pane
  canvasSplitX: number; // % width of center pane
  flywheelTurns: number;
  feedback: number;
  /** Ordered list of indicator IDs shown in the gauge/card rail. */
  visibleIndicators: string[];
  /** Per-indicator archetype override: id → archetype key (e.g. 'A1' | 'F' | ...). */
  archetypePrefs: Record<string, string>;
  /** Per-indicator user settings (thresholds, colors, etc.). */
  indicatorSettings: Record<string, Record<string, unknown>>;
}

const FRESH_TAB_STATE = (): TabState => ({
  tradePrompt: '',
  rangeSelection: false,
  setupTokens: null,
  verdicts: {},
  selectedScan: 'a1',
  scanView: 'grid',
  expandedSample: null,
  chat: [],
  peekOpen: false,
  peekHeight: 56,
  drawerTab: 'analyze',
  layoutMode: 'C',
  analyzeLayout: DEFAULT_ANALYZE_PANEL_LAYOUT,
});

const makeDefault = (): ShellState => ({
  tabs: [
    { id: 't1', kind: 'trade', mode: 'trade', title: 'BTC · new session', locked: false, tabState: FRESH_TAB_STATE() },
  ],
  activeTabId: 't1',
  sidebarVisible: true,
  aiVisible: true,
  activeSection: 'library',
  sidebarWidth: 220,
  aiWidth: 280,
  canvasSplitY: 50,
  canvasSplitX: 58,
  flywheelTurns: 0,
  feedback: 17,
  visibleIndicators: defaultVisible().map(d => d.id),
  archetypePrefs: {},
  indicatorSettings: {},
});

function normalizeTabState(tabState?: Partial<TabState> | null): TabState {
  return {
    ...FRESH_TAB_STATE(),
    ...(tabState ?? {}),
    layoutMode: 'C',
    analyzeLayout: normalizeAnalyzePanelLayout(tabState?.analyzeLayout),
  };
}

/** Migrate v5 → v6: preserve all existing fields, fill new ones with defaults. */
function migrateV5(raw: Record<string, unknown>): ShellState {
  const base = makeDefault();
  return {
    ...base,
    ...(raw as Partial<ShellState>),
    // Always ensure new fields exist even if absent in v5
    visibleIndicators: (raw.visibleIndicators as string[] | undefined) ?? base.visibleIndicators,
    archetypePrefs: (raw.archetypePrefs as Record<string, string> | undefined) ?? {},
    indicatorSettings: (raw.indicatorSettings as Record<string, Record<string, unknown>> | undefined) ?? {},
    // Re-map tabs to ensure tabState is always present
    tabs: ((raw.tabs as Tab[] | undefined) ?? base.tabs).map(t => ({
      ...t,
      tabState: normalizeTabState(t.tabState),
    })),
  };
}

const SHELL_KEY = 'cogochi_shell_v6';

function createShellStore() {
  let initial: ShellState;

  try {
    // Try v6 first, then attempt v5 migration
    const rawV6 = typeof window !== 'undefined' ? localStorage.getItem(SHELL_KEY) : null;
    if (rawV6) {
      initial = JSON.parse(rawV6) as ShellState;
      initial.tabs = initial.tabs.map(t => ({ ...t, tabState: normalizeTabState(t.tabState) }));
      // Back-fill new fields if loading an older v6 (safe no-op if fields exist)
      if (!initial.visibleIndicators) initial.visibleIndicators = makeDefault().visibleIndicators;
      if (!initial.archetypePrefs)   initial.archetypePrefs = {};
      if (!initial.indicatorSettings) initial.indicatorSettings = {};
    } else {
      // Try migrating from v5
      const rawV5 = typeof window !== 'undefined' ? localStorage.getItem('cogochi_shell_v5') : null;
      initial = rawV5 ? migrateV5(JSON.parse(rawV5) as Record<string, unknown>) : makeDefault();
    }
  } catch {
    initial = makeDefault();
  }

  const { subscribe, set, update } = writable<ShellState>(initial);

  // Persist to localStorage (v6 key) — debounced to avoid sync write on every store update.
  let _persistTimer: ReturnType<typeof setTimeout> | null = null;
  subscribe(state => {
    if (typeof window === 'undefined') return;
    if (_persistTimer) clearTimeout(_persistTimer);
    _persistTimer = setTimeout(() => {
      localStorage.setItem(SHELL_KEY, JSON.stringify(state));
    }, 300);
  });

  return {
    subscribe,
    set,
    update,

    // Tab operations
    openTab: (tab: Partial<Tab>) => {
      update(st => {
        const id = `t${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const newTab: Tab = {
          id,
          locked: false,
          mode: tab.mode || (tab.kind === 'train' || tab.kind === 'flywheel' ? tab.kind : 'trade'),
          kind: tab.kind || 'trade',
          title: tab.title || 'new session',
          tabState: { ...FRESH_TAB_STATE(), tradePrompt: (tab as any).prompt || '' },
          extra: null,
        };
        return { ...st, tabs: [...st.tabs, newTab], activeTabId: id };
      });
    },

    closeTab: (id: string) => {
      update(st => {
        const tabs = st.tabs.filter(t => t.id !== id);
        let activeTabId = st.activeTabId;
        if (activeTabId === id) activeTabId = tabs[tabs.length - 1]?.id;
        if (tabs.length === 0) {
          const fresh: Tab = { id: 't_default', kind: 'trade', mode: 'trade', title: 'new session', locked: false, tabState: FRESH_TAB_STATE() };
          tabs.push(fresh);
          activeTabId = fresh.id;
        }
        return { ...st, tabs, activeTabId };
      });
    },

    setActiveTabId: (id: string) => {
      update(st => ({ ...st, activeTabId: id }));
    },

    updateTabState: (updater: (ts: TabState) => TabState) => {
      update(st => ({
        ...st,
        tabs: st.tabs.map(t =>
          t.id === st.activeTabId ? { ...t, tabState: updater(t.tabState) } : t
        ),
      }));
    },

    switchMode: (m: 'trade' | 'train' | 'flywheel') => {
      update(st => {
        const curr = st.tabs.find(t => t.id === st.activeTabId);
        if (curr && curr.mode === m) return st;
        const existing = st.tabs.find(t => t.mode === m);
        if (existing) return { ...st, activeTabId: existing.id };
        const id = `t_${m}_${Date.now()}`;
        const title = m === 'trade' ? 'TRADE session' : m === 'train' ? 'TRAIN · inbox' : 'FLYWHEEL';
        const newTab: Tab = { id, kind: m, mode: m, title, locked: false, tabState: FRESH_TAB_STATE() };
        return { ...st, tabs: [...st.tabs, newTab], activeTabId: id };
      });
    },

    toggleSidebar: () => {
      update(st => ({ ...st, sidebarVisible: !st.sidebarVisible }));
    },

    toggleAI: () => {
      update(st => ({ ...st, aiVisible: !st.aiVisible }));
    },

    setActiveSection: (id: 'library' | 'verdicts' | 'rules') => {
      update(st => ({ ...st, activeSection: id }));
    },

    resizeSidebar: (dx: number) => {
      update(st => ({ ...st, sidebarWidth: Math.max(180, Math.min(400, st.sidebarWidth + dx)) }));
    },

    resizeAI: (dx: number) => {
      update(st => ({ ...st, aiWidth: Math.max(240, Math.min(560, st.aiWidth - dx)) }));
    },

    resizeCanvasY: (dy: number) => {
      update(st => {
        const h = typeof window !== 'undefined' ? window.innerHeight - 34 - 30 - 24 : 700;
        const pct = st.canvasSplitY + (dy / h) * 100;
        return { ...st, canvasSplitY: Math.max(30, Math.min(75, pct)) };
      });
    },

    resizeCanvasX: (dx: number) => {
      update(st => {
        const w = typeof window !== 'undefined'
          ? window.innerWidth - (st.sidebarVisible ? st.sidebarWidth : 0) - (st.aiVisible ? st.aiWidth : 0) - 12
          : 1000;
        const pct = st.canvasSplitX + (dx / w) * 100;
        return { ...st, canvasSplitX: Math.max(30, Math.min(75, pct)) };
      });
    },

    judge: (alertId: string, verdict: 'agree' | 'disagree') => {
      update(st => ({
        ...st,
        tabs: st.tabs.map(t =>
          t.id === st.activeTabId
            ? { ...t, tabState: { ...t.tabState, verdicts: { ...t.tabState.verdicts, [alertId]: verdict } } }
            : t
        ),
        flywheelTurns: st.flywheelTurns + 90,
        feedback: Math.min(20, st.feedback + 1),
      }));
    },

    // ── Indicator visibility ────────────────────────────────────────────────

    toggleIndicatorVisible: (id: string) => {
      update(st => {
        const vis = st.visibleIndicators;
        const next = vis.includes(id) ? vis.filter(x => x !== id) : [...vis, id];
        return { ...st, visibleIndicators: next };
      });
    },

    setIndicatorVisible: (id: string, visible: boolean) => {
      update(st => {
        const vis = st.visibleIndicators;
        const hasIt = vis.includes(id);
        if (visible === hasIt) return st;
        const next = visible ? [...vis, id] : vis.filter(x => x !== id);
        return { ...st, visibleIndicators: next };
      });
    },

    setArchetypePref: (id: string, archetype: string) => {
      update(st => ({
        ...st,
        archetypePrefs: { ...st.archetypePrefs, [id]: archetype },
      }));
    },

    reset: () => {
      set(makeDefault());
      if (typeof window !== 'undefined') {
        localStorage.removeItem(SHELL_KEY);
        localStorage.removeItem('cogochi_shell_v5');
      }
    },
  };
}

export const shellStore = createShellStore();

// Derived stores
export const activeTab = derived(shellStore, $st => $st.tabs.find(t => t.id === $st.activeTabId) || $st.tabs[0]);
export const activeMode = derived(activeTab, $tab => $tab?.mode || 'trade');
export const activeTabState = derived(activeTab, $tab => $tab?.tabState || FRESH_TAB_STATE());
export const allVerdicts = derived(shellStore, $st =>
  Object.assign({}, ...$st.tabs.map(t => t.tabState?.verdicts || {}))
);
export const verdictCount = derived(allVerdicts, $v => Object.keys($v).length);
export const modelDelta = derived(allVerdicts, $v => {
  let agree = 0, disagree = 0;
  for (const v of Object.values($v)) {
    if (v === 'agree') agree++;
    else if (v === 'disagree') disagree++;
  }
  return agree * 0.03 - disagree * 0.01;
});
