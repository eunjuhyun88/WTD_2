import { writable, derived } from 'svelte/store';
import { defaultVisible } from '$lib/indicators/registry';
import {
  DEFAULT_ANALYZE_PANEL_LAYOUT,
  normalizeAnalyzePanelLayout,
  type AnalyzePanelLayoutState,
} from '$lib/contracts/cogochiPanelLayout';

export type WorkspacePanelId = 'analyze' | 'scan' | 'judge';
export type WorkspaceStageMode = 'single' | 'split-2' | 'grid-4';
export type ShellWorkMode = 'observe' | 'analyze' | 'execute' | 'decide';
// v2 migration: verdict→analyze, research→scan
export type RightPanelTab = 'decision' | 'analyze' | 'scan' | 'judge' | 'pattern';
export type ChartType = 'candle' | 'line' | 'heikin' | 'bar' | 'area';
export type Timeframe = '1m' | '3m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1D';
export type ChartActiveMode = 'idle' | 'drawing' | 'save-range';
export type DrawingTool =
  | 'cursor'
  | 'trendLine'
  | 'horizontalLine'
  | 'verticalLine'
  | 'extendedLine'
  | 'rectangle'
  | 'fibRetracement'
  | 'textLabel';

export interface WorkspacePanelRect {
  x: number; y: number; w: number; h: number;
}

export interface TabState {
  symbol: string;
  timeframe: string;
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
  workspaceOrder: WorkspacePanelId[];
  workspaceCollapsed: Partial<Record<WorkspacePanelId, boolean>>;
  workspaceLayout: Record<WorkspacePanelId, WorkspacePanelRect>;
  workspaceSlots: Array<WorkspacePanelId | null>;
  workspaceSplitX: number;
  workspaceSplitY: number;
  layoutMode: 'C';
  analyzeLayout: AnalyzePanelLayoutState;
  chartType: ChartType;
  rightPanelTab: RightPanelTab;
  rightPanelExpanded: boolean;
  drawerOpen: boolean;
  drawerKind: 'evidence-grid' | 'why-panel' | 'pattern-library' | 'verdict-card' | 'research-full' | 'judge-full' | null;
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
  workMode: ShellWorkMode;
  workspaceMode: WorkspaceStageMode;
  workspacePaneIds: [string | null, string | null, string | null, string | null];
  workspaceImmersivePaneId: string | null;
  workspaceColumnSplit: number;
  workspaceLeftSplitY: number;
  workspaceRightSplitY: number;
  sidebarVisible: boolean;
  aiVisible: boolean;
  activeSection: 'library' | 'verdicts' | 'rules';
  sidebarWidth: number;
  aiWidth: number;
  canvasSplitY: number;
  canvasSplitX: number;
  flywheelTurns: number;
  feedback: number;
  visibleIndicators: string[];
  archetypePrefs: Record<string, string>;
  indicatorSettings: Record<string, Record<string, unknown>>;
  // ── Decide mode ──────────────────────────────────────────────────────────
  hudVisible: boolean;
  selectedVerdictId: string | null;
  decisionBundle: null | { symbol: string; timeframe: string; patternSlug: string | null };
  // ── Drawing mode (D-4) ───────────────────────────────────────────────────
  chartActiveMode: ChartActiveMode;
  drawingTool: DrawingTool;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function clamp(min: number, value: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function deriveWorkspaceMode(paneIds: [string | null, string | null, string | null, string | null]): WorkspaceStageMode {
  const count = paneIds.filter(Boolean).length;
  if (count <= 1) return 'single';
  if (count === 2) return 'split-2';
  return 'grid-4';
}

function normalizeWorkspacePaneIds(
  tabs: Tab[],
  paneIds?: Array<string | null> | null,
  activeTabId?: string | null,
): [string | null, string | null, string | null, string | null] {
  const validIds = new Set(tabs.map(t => t.id));
  const next: string[] = [];
  for (const id of paneIds ?? []) {
    if (id && validIds.has(id) && !next.includes(id)) next.push(id);
  }
  const fallback = activeTabId && validIds.has(activeTabId) ? activeTabId : tabs[0]?.id ?? null;
  if (!next.length && fallback) next.push(fallback);
  if (fallback && !next.includes(fallback)) next.unshift(fallback);
  const trimmed = next.slice(0, 4);
  while (trimmed.length < 4) trimmed.push(null as any);
  return [trimmed[0], trimmed[1], trimmed[2], trimmed[3]];
}

function assignTabToWorkspacePanes(
  tabs: Tab[],
  paneIds: [string | null, string | null, string | null, string | null],
  activeTabId: string,
  nextTabId: string,
): [string | null, string | null, string | null, string | null] {
  const currentIds = normalizeWorkspacePaneIds(tabs, paneIds, activeTabId);
  const count = currentIds.filter(Boolean).length;
  if (count <= 1) return normalizeWorkspacePaneIds(tabs, [nextTabId], nextTabId);
  if (currentIds.includes(nextTabId)) return normalizeWorkspacePaneIds(tabs, currentIds, nextTabId);
  const nextIds = [...currentIds];
  const focusIdx = nextIds.findIndex(id => id === activeTabId);
  nextIds[focusIdx >= 0 ? focusIdx : 0] = nextTabId;
  const deduped: Array<string | null> = [];
  for (const id of nextIds) {
    if (!id || deduped.includes(id)) continue;
    deduped.push(id);
  }
  while (deduped.length < 4) deduped.push(null);
  return normalizeWorkspacePaneIds(tabs, deduped, nextTabId);
}

// ── Defaults ───────────────────────────────────────────────────────────────

const DEFAULT_WORKSPACE_COLUMN_SPLIT = 56;
const DEFAULT_WORKSPACE_LEFT_SPLIT_Y = 58;
const DEFAULT_WORKSPACE_RIGHT_SPLIT_Y = 50;
const DEFAULT_SIDEBAR_WIDTH = 178;
const DEFAULT_AI_WIDTH = 320;

const FRESH_WORKSPACE_LAYOUT = (): Record<WorkspacePanelId, WorkspacePanelRect> => ({
  analyze: { x: 0, y: 0, w: 58, h: 56 },
  scan:    { x: 60, y: 0, w: 40, h: 46 },
  judge:   { x: 0, y: 58, w: 58, h: 42 },
});

const FRESH_TAB_STATE = (): TabState => ({
  symbol: 'BTCUSDT',
  timeframe: '4h',
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
  workspaceOrder: ['analyze', 'scan', 'judge'],
  workspaceCollapsed: { scan: true, judge: true },
  workspaceLayout: FRESH_WORKSPACE_LAYOUT(),
  workspaceSlots: ['analyze', 'scan', 'judge', null],
  workspaceSplitX: 56,
  workspaceSplitY: 54,
  layoutMode: 'C',
  analyzeLayout: DEFAULT_ANALYZE_PANEL_LAYOUT,
  chartType: 'candle',
  rightPanelTab: 'decision' as RightPanelTab,
  rightPanelExpanded: false,
  drawerOpen: false,
  drawerKind: null,
});

const makeDefault = (): ShellState => ({
  tabs: [
    { id: 't1', kind: 'trade', mode: 'trade', title: 'BTC · new session', locked: false, tabState: FRESH_TAB_STATE() },
  ],
  activeTabId: 't1',
  workMode: 'observe',
  workspaceMode: 'single',
  workspacePaneIds: ['t1', null, null, null],
  workspaceImmersivePaneId: null,
  workspaceColumnSplit: DEFAULT_WORKSPACE_COLUMN_SPLIT,
  workspaceLeftSplitY: DEFAULT_WORKSPACE_LEFT_SPLIT_Y,
  workspaceRightSplitY: DEFAULT_WORKSPACE_RIGHT_SPLIT_Y,
  sidebarVisible: false,
  aiVisible: false,
  activeSection: 'library',
  sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
  aiWidth: DEFAULT_AI_WIDTH,
  canvasSplitY: 50,
  canvasSplitX: 58,
  flywheelTurns: 0,
  feedback: 17,
  visibleIndicators: defaultVisible().map(d => d.id),
  archetypePrefs: {},
  indicatorSettings: {},
  hudVisible: false,
  selectedVerdictId: null,
  decisionBundle: null,
  chartActiveMode: 'idle',
  drawingTool: 'cursor',
});

const VALID_RIGHT_PANEL_TABS = new Set<string>(['decision', 'analyze', 'scan', 'judge', 'pattern']);
function migrateRightPanelTab(raw: unknown): RightPanelTab {
  // v1→v2: verdict→analyze, research→scan
  if (raw === 'verdict') return 'analyze';
  if (raw === 'research') return 'scan';
  if (typeof raw === 'string' && VALID_RIGHT_PANEL_TABS.has(raw)) return raw as RightPanelTab;
  return 'decision';
}

function normalizeTabState(tabState?: Partial<TabState> | null): TabState {
  return {
    ...FRESH_TAB_STATE(),
    ...(tabState ?? {}),
    rightPanelTab: migrateRightPanelTab((tabState as any)?.rightPanelTab),
    workspaceLayout: { ...FRESH_WORKSPACE_LAYOUT(), ...(tabState?.workspaceLayout ?? {}) },
    layoutMode: 'C',
    analyzeLayout: normalizeAnalyzePanelLayout(tabState?.analyzeLayout),
  };
}

function normalizeShellState(raw: Partial<ShellState>): ShellState {
  const base = makeDefault();
  const tabs = (raw.tabs ?? base.tabs).map(t => ({ ...t, tabState: normalizeTabState(t.tabState) }));
  const activeTabId = tabs.some(t => t.id === raw.activeTabId) ? raw.activeTabId! : tabs[0]?.id ?? 't1';
  const workspacePaneIds = normalizeWorkspacePaneIds(tabs, raw.workspacePaneIds, activeTabId);
  const workspaceImmersivePaneId =
    raw.workspaceImmersivePaneId && tabs.some(t => t.id === raw.workspaceImmersivePaneId)
      ? raw.workspaceImmersivePaneId
      : null;
  const workMode: ShellWorkMode =
    raw.workMode === 'observe' || raw.workMode === 'execute' || raw.workMode === 'analyze' || raw.workMode === 'decide'
      ? raw.workMode
      : 'analyze';
  return {
    ...base,
    ...raw,
    tabs,
    activeTabId,
    workMode,
    workspacePaneIds,
    workspaceImmersivePaneId,
    workspaceMode: (raw.workspaceMode === 'single' || raw.workspaceMode === 'split-2' || raw.workspaceMode === 'grid-4')
      ? raw.workspaceMode
      : deriveWorkspaceMode(workspacePaneIds),
    workspaceColumnSplit: clamp(28, raw.workspaceColumnSplit ?? DEFAULT_WORKSPACE_COLUMN_SPLIT, 72),
    workspaceLeftSplitY: clamp(24, raw.workspaceLeftSplitY ?? DEFAULT_WORKSPACE_LEFT_SPLIT_Y, 76),
    workspaceRightSplitY: clamp(24, raw.workspaceRightSplitY ?? DEFAULT_WORKSPACE_RIGHT_SPLIT_Y, 76),
    visibleIndicators: raw.visibleIndicators ?? base.visibleIndicators,
    archetypePrefs: raw.archetypePrefs ?? {},
    indicatorSettings: raw.indicatorSettings ?? {},
    hudVisible: raw.hudVisible ?? false,
    selectedVerdictId: raw.selectedVerdictId ?? null,
    decisionBundle: raw.decisionBundle ?? null,
    chartActiveMode: raw.chartActiveMode ?? 'idle',
    drawingTool: raw.drawingTool ?? 'cursor',
  };
}

// ── Storage ────────────────────────────────────────────────────────────────

const SHELL_KEY = 'cogochi_shell_v9'; // v9: RightPanelTab migration (verdict→analyze, research→scan)

function createShellStore() {
  let initial: ShellState;
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(SHELL_KEY) : null;
    initial = raw ? normalizeShellState(JSON.parse(raw) as Partial<ShellState>) : makeDefault();
  } catch {
    initial = makeDefault();
  }

  const { subscribe, set, update } = writable<ShellState>(initial);

  let _persistTimer: ReturnType<typeof setTimeout> | null = null;
  subscribe(state => {
    if (typeof window === 'undefined') return;
    if (_persistTimer) clearTimeout(_persistTimer);
    _persistTimer = setTimeout(() => {
      localStorage.setItem(SHELL_KEY, JSON.stringify(state));
    }, 300);
  });

  return {
    subscribe, set, update,

    // ── Tab CRUD ─────────────────────────────────────────────────────────

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
        const tabs = [...st.tabs, newTab];
        return normalizeShellState({
          ...st, tabs, activeTabId: id,
          workspaceImmersivePaneId: st.workspaceImmersivePaneId ? id : st.workspaceImmersivePaneId,
          workspacePaneIds: assignTabToWorkspacePanes(tabs, st.workspacePaneIds, st.activeTabId, id),
        });
      });
    },

    closeTab: (id: string) => {
      update(st => {
        const tabs = st.tabs.filter(t => t.id !== id);
        let activeTabId = st.activeTabId;
        if (activeTabId === id) activeTabId = tabs[tabs.length - 1]?.id ?? 't_default';
        if (tabs.length === 0) {
          const fresh: Tab = { id: 't_default', kind: 'trade', mode: 'trade', title: 'new session', locked: false, tabState: FRESH_TAB_STATE() };
          tabs.push(fresh);
          activeTabId = fresh.id;
        }
        return normalizeShellState({
          ...st, tabs, activeTabId,
          workspaceImmersivePaneId: st.workspaceImmersivePaneId === id ? null : st.workspaceImmersivePaneId,
        });
      });
    },

    setActiveTabId: (id: string) => {
      update(st => normalizeShellState({
        ...st, activeTabId: id,
        workspaceImmersivePaneId: st.workspaceImmersivePaneId ? id : st.workspaceImmersivePaneId,
        workspacePaneIds: assignTabToWorkspacePanes(st.tabs, st.workspacePaneIds, st.activeTabId, id),
      }));
    },

    focusWorkspaceTab: (id: string) => {
      update(st => normalizeShellState({
        ...st, activeTabId: id,
        workspaceImmersivePaneId: st.workspaceImmersivePaneId ? id : st.workspaceImmersivePaneId,
        workspacePaneIds: assignTabToWorkspacePanes(st.tabs, st.workspacePaneIds, st.activeTabId, id),
      }));
    },

    toggleTabCompare: (id: string) => {
      update(st => {
        const currentIds = normalizeWorkspacePaneIds(st.tabs, st.workspacePaneIds, st.activeTabId);
        const activeIds = currentIds.filter((p): p is string => Boolean(p));
        const exists = activeIds.includes(id);
        let nextIds = activeIds;
        if (exists) {
          nextIds = activeIds.filter(p => p !== id);
          if (!nextIds.length) nextIds = [id];
        } else if (activeIds.length < 4) {
          nextIds = [...activeIds, id];
        } else {
          nextIds = [activeIds[0], activeIds[1], activeIds[2], id];
        }
        const normalized = normalizeWorkspacePaneIds(st.tabs, nextIds, id);
        return normalizeShellState({
          ...st, activeTabId: id,
          workspaceImmersivePaneId: null,
          workspacePaneIds: normalized,
          workspaceMode: deriveWorkspaceMode(normalized),
        });
      });
    },

    expandWorkspacePane: (id: string) => {
      update(st => normalizeShellState({
        ...st, activeTabId: id,
        workspaceImmersivePaneId: st.workspaceImmersivePaneId === id ? null : id,
      }));
    },

    exitWorkspaceImmersive: () => {
      update(st => normalizeShellState({ ...st, workspaceImmersivePaneId: null }));
    },

    setWorkspaceStageMode: (mode: WorkspaceStageMode) => {
      update(st => {
        const validIds = st.tabs.map(t => t.id);
        const preferred = [st.activeTabId, ...st.workspacePaneIds].filter((id): id is string => typeof id === 'string' && validIds.includes(id));
        const deduped = [...new Set(preferred)];
        const desiredCount = mode === 'single' ? 1 : mode === 'split-2' ? 2 : 4;
        const nextIds = deduped.slice(0, Math.min(desiredCount, st.tabs.length));
        const focusId = nextIds[0] ?? st.activeTabId;
        return normalizeShellState({
          ...st, activeTabId: focusId,
          workspaceImmersivePaneId: null,
          workspaceMode: mode,
          workspacePaneIds: normalizeWorkspacePaneIds(st.tabs, nextIds, focusId),
        });
      });
    },

    setWorkMode: (mode: ShellWorkMode) => {
      update(st => normalizeShellState({ ...st, workMode: mode }));
    },

    moveWorkspacePane: (fromIndex: number, toIndex: number) => {
      update(st => {
        if (fromIndex === toIndex) return st;
        const next = [...st.workspacePaneIds] as [string | null, string | null, string | null, string | null];
        [next[fromIndex], next[toIndex]] = [next[toIndex], next[fromIndex]];
        return normalizeShellState({ ...st, workspacePaneIds: next });
      });
    },

    resetWorkspaceStage: () => {
      update(st => normalizeShellState({
        ...st,
        workspaceMode: 'single',
        workspaceImmersivePaneId: null,
        workspacePaneIds: [st.activeTabId, null, null, null],
        workspaceColumnSplit: DEFAULT_WORKSPACE_COLUMN_SPLIT,
        workspaceLeftSplitY: DEFAULT_WORKSPACE_LEFT_SPLIT_Y,
        workspaceRightSplitY: DEFAULT_WORKSPACE_RIGHT_SPLIT_Y,
      }));
    },

    // ── Tab state ─────────────────────────────────────────────────────────

    updateTabState: (updater: (ts: TabState) => TabState) => {
      update(st => ({
        ...st,
        tabs: st.tabs.map(t =>
          t.id === st.activeTabId ? { ...t, tabState: updater(t.tabState) } : t
        ),
      }));
    },

    updateTabStateFor: (id: string, updater: (ts: TabState) => TabState) => {
      update(st => ({
        ...st,
        tabs: st.tabs.map(t => t.id === id ? { ...t, tabState: updater(t.tabState) } : t),
      }));
    },

    setSymbol: (symbol: string, tabId?: string) => {
      const base = symbol.replace(/USDT$/, '');
      update(st => {
        const id = tabId ?? st.activeTabId;
        return {
          ...st,
          tabs: st.tabs.map(t =>
            t.id === id
              ? { ...t, title: `${base} · session`, tabState: { ...t.tabState, symbol } }
              : t
          ),
        };
      });
    },

    setTimeframe: (timeframe: string, tabId?: string) => {
      update(st => {
        const id = tabId ?? st.activeTabId;
        return {
          ...st,
          tabs: st.tabs.map(t => t.id === id ? { ...t, tabState: { ...t.tabState, timeframe } } : t),
        };
      });
    },

    setRightPanelTab: (tab: RightPanelTab) => {
      update(st => ({
        ...st,
        tabs: st.tabs.map(t =>
          t.id === st.activeTabId ? { ...t, tabState: { ...t.tabState, rightPanelTab: tab } } : t
        ),
      }));
    },

    setChartType: (chartType: ChartType) => {
      update(st => ({
        ...st,
        tabs: st.tabs.map(t =>
          t.id === st.activeTabId ? { ...t, tabState: { ...t.tabState, chartType } } : t
        ),
      }));
    },

    setDrawingTool: (tool: DrawingTool) => {
      update(st => {
        const next = st.drawingTool === tool && tool !== 'cursor' ? 'cursor' : tool;
        const mode: ChartActiveMode = next === 'cursor' ? 'idle' : 'drawing';
        return { ...st, drawingTool: next, chartActiveMode: mode };
      });
    },

    setChartActiveMode: (mode: ChartActiveMode) => {
      update(st => ({
        ...st,
        chartActiveMode: mode,
        // Reverting to idle/save-range clears any active drawing tool
        drawingTool: mode === 'drawing' ? st.drawingTool : 'cursor',
      }));
    },

    openDrawer: (drawerKind: TabState['drawerKind']) => {
      update(st => ({
        ...st,
        tabs: st.tabs.map(t =>
          t.id === st.activeTabId ? { ...t, tabState: { ...t.tabState, drawerOpen: true, drawerKind } } : t
        ),
      }));
    },

    closeDrawer: () => {
      update(st => ({
        ...st,
        tabs: st.tabs.map(t =>
          t.id === st.activeTabId ? { ...t, tabState: { ...t.tabState, drawerOpen: false, drawerKind: null } } : t
        ),
      }));
    },

    // ── Mode switch ───────────────────────────────────────────────────────

    switchMode: (m: 'trade' | 'train' | 'flywheel') => {
      update(st => {
        const curr = st.tabs.find(t => t.id === st.activeTabId);
        if (curr && curr.mode === m) return st;
        const existing = st.tabs.find(t => t.mode === m);
        if (existing) {
          return normalizeShellState({
            ...st, activeTabId: existing.id,
            workspaceImmersivePaneId: st.workspaceImmersivePaneId ? existing.id : st.workspaceImmersivePaneId,
            workspacePaneIds: assignTabToWorkspacePanes(st.tabs, st.workspacePaneIds, st.activeTabId, existing.id),
          });
        }
        const id = `t_${m}_${Date.now()}`;
        const title = m === 'trade' ? 'TRADE session' : m === 'train' ? 'TRAIN · inbox' : 'FLYWHEEL';
        const newTab: Tab = { id, kind: m, mode: m, title, locked: false, tabState: FRESH_TAB_STATE() };
        const tabs = [...st.tabs, newTab];
        return normalizeShellState({
          ...st, tabs, activeTabId: id,
          workspaceImmersivePaneId: st.workspaceImmersivePaneId ? id : st.workspaceImmersivePaneId,
          workspacePaneIds: assignTabToWorkspacePanes(tabs, st.workspacePaneIds, st.activeTabId, id),
        });
      });
    },

    // ── Layout ────────────────────────────────────────────────────────────

    toggleSidebar: () => { update(st => ({ ...st, sidebarVisible: !st.sidebarVisible })); },
    toggleAI: () => { update(st => ({ ...st, aiVisible: !st.aiVisible })); },
    setActiveSection: (id: 'library' | 'verdicts' | 'rules') => { update(st => ({ ...st, activeSection: id })); },

    resizeSidebar: (dx: number) => {
      update(st => ({ ...st, sidebarWidth: clamp(160, st.sidebarWidth + dx, 420) }));
    },
    resetSidebarWidth: () => { update(st => ({ ...st, sidebarWidth: DEFAULT_SIDEBAR_WIDTH })); },

    resizeAI: (dx: number) => {
      update(st => ({ ...st, aiWidth: clamp(240, st.aiWidth - dx, 600) }));
    },
    resetAIWidth: () => { update(st => ({ ...st, aiWidth: DEFAULT_AI_WIDTH })); },

    resizeWorkspaceColumn: (dx: number) => {
      update(st => {
        const w = typeof window !== 'undefined'
          ? window.innerWidth - (st.sidebarVisible ? st.sidebarWidth : 0) - (st.aiVisible ? Math.max(300, st.aiWidth) : 0) - 32
          : 1200;
        return normalizeShellState({ ...st, workspaceColumnSplit: st.workspaceColumnSplit + (dx / w) * 100 });
      });
    },

    resizeWorkspaceLeftRow: (dy: number) => {
      update(st => {
        const h = typeof window !== 'undefined' ? window.innerHeight - 180 : 720;
        return normalizeShellState({ ...st, workspaceLeftSplitY: st.workspaceLeftSplitY + (dy / h) * 100 });
      });
    },

    resizeWorkspaceRightRow: (dy: number) => {
      update(st => {
        const h = typeof window !== 'undefined' ? window.innerHeight - 180 : 720;
        return normalizeShellState({ ...st, workspaceRightSplitY: st.workspaceRightSplitY + (dy / h) * 100 });
      });
    },

    resetWorkspaceSplits: () => {
      update(st => normalizeShellState({
        ...st,
        workspaceColumnSplit: DEFAULT_WORKSPACE_COLUMN_SPLIT,
        workspaceLeftSplitY: DEFAULT_WORKSPACE_LEFT_SPLIT_Y,
        workspaceRightSplitY: DEFAULT_WORKSPACE_RIGHT_SPLIT_Y,
      }));
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

    // ── Verdict / flywheel ────────────────────────────────────────────────

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

    // ── Decide mode ───────────────────────────────────────────────────────

    toggleHud: () => { update(st => ({ ...st, hudVisible: !st.hudVisible })); },

    selectVerdict: (id: string | null) => { update(st => ({ ...st, selectedVerdictId: id })); },

    setDecisionBundle: (b: null | { symbol: string; timeframe: string; patternSlug: string | null }) => {
      update(st => ({ ...st, decisionBundle: b }));
    },

    // ── Indicator visibility ───────────────────────────────────────────────

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
      update(st => ({ ...st, archetypePrefs: { ...st.archetypePrefs, [id]: archetype } }));
    },

    reset: () => {
      set(makeDefault());
      if (typeof window !== 'undefined') {
        localStorage.removeItem(SHELL_KEY);
        localStorage.removeItem('cogochi_shell_v6');
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
export const isDecideMode = derived(shellStore, $st => $st.workMode === 'decide');
export const activeRightPanelTab = derived(shellStore, $st =>
  $st.tabs.find(t => t.id === $st.activeTabId)?.tabState.rightPanelTab ?? 'decision'
);
