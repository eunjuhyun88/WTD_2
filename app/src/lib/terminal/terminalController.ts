import type {
  TerminalAlertCreateRequest,
  MacroCalendarItem,
  TerminalAlertRule,
  TerminalExportJob,
  TerminalExportRequest,
  TerminalPin,
  TerminalWatchlistItem,
} from '$lib/contracts/terminalPersistence';
import {
  createPatternCapture,
  createTerminalAlert,
  createTerminalExport,
  fetchTerminalExport,
  deleteTerminalAlert,
  saveTerminalPins,
  saveTerminalWatchlist,
} from '$lib/api/terminalPersistence';
import { fetchMemoryRerank, sendMemoryDebugSession, sendMemoryFeedback } from '$lib/api/terminalBackend';
import { rerankEvidenceWithMemory } from '$lib/terminal/panelAdapter';
import type { TerminalEvidence } from '$lib/types/terminal';

export type TerminalSessionState = {
  watchlist: TerminalWatchlistItem[];
  activeSymbol?: string;
  pins: TerminalPin[];
  alerts: TerminalAlertRule[];
  macro: MacroCalendarItem[];
  latestExportJob?: TerminalExportJob | null;
};

export type TerminalRestorePlan = {
  watchlist: TerminalWatchlistItem[];
  pins: TerminalPin[];
  alerts: TerminalAlertRule[];
  macro: MacroCalendarItem[];
  latestExportJob: TerminalExportJob | null;
  compareSymbols: string[];
  compareTimeframe?: string;
  activeSymbol?: string;
  activeTimeframe?: string;
  layout: 'single' | 'compare2x2';
};

type PersistenceDecisionEvidence = { metric?: string } | string;

export type TerminalPersistencePayloadArgs = {
  symbol: string;
  timeframe: string;
  analysisData?: {
    price?: number | null;
    change24h?: number | null;
    snapshot?: {
      last_close?: number | null;
      change24h?: number | null;
    } | null;
    entryPlan?: unknown;
    riskPlan?: unknown;
    flowSummary?: unknown;
    sources?: unknown[];
  } | null;
  decision?: {
    verdict?: unknown;
    evidence?: PersistenceDecisionEvidence[];
  } | null;
};

export type DurableActionResult = {
  message: string;
  transient?: boolean;
};

export type TerminalDockMessageKey =
  | 'alerts_refreshed'
  | 'board_refreshed'
  | 'scan_refreshed'
  | 'pattern_modal_opened'
  | 'pattern_recall_opened';

export type TerminalBootstrapTask = {
  delayMs: number;
  task: () => void;
};

export type TerminalRefreshInterval = {
  everyMs: number;
  task: () => void;
};

export type PatternTransitionAlert = {
  id: string;
  symbol: string;
  slug: string;
  phase: string;
  createdAt: number;
};

export type TerminalMemoryRerankOutcome = {
  evidence: TerminalEvidence[];
  queryId: string;
  topEvidenceIds: string[];
};

export type TerminalMemoryFeedbackEvent = 'used' | 'confirmed';

export function buildTerminalRestorePlan(session: TerminalSessionState): TerminalRestorePlan {
  const watchlistActiveSymbol = session.watchlist.find((item) => item.active)?.symbol;
  const latestComparePin = session.pins.find((pin) => pin.pinType === 'compare');
  const compareSymbols = Array.isArray(latestComparePin?.payload?.symbols)
    ? latestComparePin.payload.symbols.filter((value): value is string => typeof value === 'string')
    : [];

  if (compareSymbols.length >= 2) {
    return {
      watchlist: session.watchlist,
      pins: session.pins,
      alerts: session.alerts,
      macro: session.macro,
      latestExportJob: session.latestExportJob ?? null,
      compareSymbols: compareSymbols.slice(0, 4),
      compareTimeframe: latestComparePin?.timeframe,
      activeSymbol: compareSymbols[0],
      activeTimeframe: latestComparePin?.timeframe,
      layout: 'compare2x2',
    };
  }

  const latestAnalysisPin = session.pins.find((pin) => pin.pinType === 'analysis' && pin.symbol);
  return {
    watchlist: session.watchlist,
    pins: session.pins,
    alerts: session.alerts,
    macro: session.macro,
    latestExportJob: session.latestExportJob ?? null,
    compareSymbols: [],
    activeSymbol: session.activeSymbol ?? watchlistActiveSymbol ?? latestAnalysisPin?.symbol,
    activeTimeframe: latestAnalysisPin?.timeframe,
    layout: 'single',
  };
}

export function findTerminalAlertRule(
  alerts: TerminalAlertRule[],
  symbol: string,
  timeframe: string,
): TerminalAlertRule | undefined {
  return alerts.find((rule) => rule.symbol === symbol && rule.timeframe === timeframe);
}

export function makeTerminalWatchlistItem(
  watchlist: TerminalWatchlistItem[],
  symbol: string,
  timeframe: string,
  sortOrder: number,
  active: boolean,
): TerminalWatchlistItem {
  const existing = watchlist.find((item) => item.symbol === symbol);
  return {
    symbol,
    timeframe,
    sortOrder,
    active,
    preview: existing?.preview,
  };
}

export function mergeTerminalWatchlistSymbol(
  watchlist: TerminalWatchlistItem[],
  symbol: string,
  timeframe: string,
  activate: boolean,
): TerminalWatchlistItem[] {
  const base = watchlist.filter((item) => item.symbol !== symbol);
  const next = [makeTerminalWatchlistItem(watchlist, symbol, timeframe, 0, activate), ...base]
    .slice(0, 6)
    .map((item, index) => ({
      ...item,
      sortOrder: index,
      active: activate ? item.symbol === symbol : item.active,
    }));
  if (activate && next.every((item) => !item.active) && next[0]) {
    next[0].active = true;
  }
  return next;
}

export async function persistTerminalWatchlist(
  nextItems: TerminalWatchlistItem[],
  activeSymbol?: string,
): Promise<TerminalWatchlistItem[]> {
  const saved = await saveTerminalWatchlist({ items: nextItems, activeSymbol });
  return saved?.items ?? nextItems;
}

export async function touchTerminalWatchlistSymbol(args: {
  watchlist: TerminalWatchlistItem[];
  symbol: string;
  timeframe: string;
  activeSymbol?: string;
  activate?: boolean;
}): Promise<TerminalWatchlistItem[]> {
  const activate = args.activate ?? true;
  const nextItems = mergeTerminalWatchlistSymbol(args.watchlist, args.symbol, args.timeframe, activate);
  const same =
    nextItems.length === args.watchlist.length &&
    nextItems.every((item, index) => {
      const current = args.watchlist[index];
      return current
        && current.symbol === item.symbol
        && current.timeframe === item.timeframe
        && current.active === item.active;
    });
  if (same) return args.watchlist;
  return persistTerminalWatchlist(nextItems, activate ? args.symbol : args.activeSymbol);
}

export async function persistTerminalPins(nextPins: TerminalPin[]): Promise<TerminalPin[]> {
  const saved = await saveTerminalPins(nextPins);
  return saved ?? nextPins;
}

export function buildTerminalPin(args: {
  pins: TerminalPin[];
  id: string;
  pinType: TerminalPin['pinType'];
  timeframe: string;
  payload: Record<string, unknown>;
  symbol?: string;
  label?: string;
}): TerminalPin {
  const existing = args.pins.find((pin) => pin.id === args.id);
  const now = new Date().toISOString();
  return {
    id: args.id,
    pinType: args.pinType,
    symbol: args.symbol,
    timeframe: args.timeframe,
    label: args.label,
    payload: args.payload,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

export function buildTerminalPersistencePayload(args: TerminalPersistencePayloadArgs): Record<string, unknown> {
  return {
    symbol: args.symbol,
    timeframe: args.timeframe,
    price: args.analysisData?.price ?? args.analysisData?.snapshot?.last_close ?? null,
    change24h: args.analysisData?.change24h ?? args.analysisData?.snapshot?.change24h ?? null,
    verdict: args.decision?.verdict ?? null,
    evidence: args.decision?.evidence?.slice(0, 8) ?? [],
    entryPlan: args.analysisData?.entryPlan ?? null,
    riskPlan: args.analysisData?.riskPlan ?? null,
    flowSummary: args.analysisData?.flowSummary ?? null,
    sources: args.analysisData?.sources ?? [],
    savedAt: new Date().toISOString(),
  };
}

export async function recordDurableTerminalAction(args: {
  action: string;
  symbol: string;
  timeframe: string;
  evidence?: string[];
}): Promise<void> {
  try {
    await sendMemoryDebugSession({
      sessionId: `terminal:${args.action}:${args.symbol}:${Date.now()}`,
      symbol: args.symbol,
      timeframe: args.timeframe,
      intent: args.action,
      hypotheses: [
        {
          id: `${args.action}:${args.symbol}`,
          text: `${args.action} committed from terminal persistent action`,
          status: 'confirmed',
          evidence: args.evidence ?? [],
        },
      ],
    });
  } catch {
    // Best-effort telemetry.
  }
}

export async function toggleAnalysisPin(args: {
  symbol: string;
  timeframe: string;
  pins: TerminalPin[];
  watchlist: TerminalWatchlistItem[];
  activeSymbol?: string;
  payload: Record<string, unknown>;
}): Promise<{ pins: TerminalPin[]; watchlist: TerminalWatchlistItem[]; result: DurableActionResult }> {
  const id = `analysis:${args.symbol}:${args.timeframe}`;
  const existing = args.pins.find((pin) => pin.id === id);

  if (existing) {
    const pins = await persistTerminalPins(args.pins.filter((pin) => pin.id !== id));
    return {
      pins,
      watchlist: args.watchlist,
      result: { message: 'Analysis pin removed.', transient: true },
    };
  }

  const pin = buildTerminalPin({
    pins: args.pins,
    id,
    pinType: 'analysis',
    timeframe: args.timeframe,
    payload: args.payload,
    symbol: args.symbol,
    label: `${args.symbol.replace('USDT', '')} ${args.timeframe.toUpperCase()} analysis`,
  });
  const pins = await persistTerminalPins([pin, ...args.pins.filter((item) => item.id !== id)].slice(0, 50));
  const watchlist = await touchTerminalWatchlistSymbol({
    watchlist: args.watchlist,
    symbol: args.symbol,
    timeframe: args.timeframe,
    activeSymbol: args.activeSymbol,
    activate: true,
  });
  await recordDurableTerminalAction({
    action: 'pin',
    symbol: args.symbol,
    timeframe: args.timeframe,
    evidence: ((args.payload.evidence as Array<{ metric?: string }> | undefined) ?? [])
      .map((item) => item.metric ?? 'evidence')
      .slice(0, 3),
  });
  return {
    pins,
    watchlist,
    result: { message: 'Analysis pinned to your terminal.', transient: true },
  };
}

export async function toggleRiskAlert(args: {
  symbol: string;
  timeframe: string;
  alerts: TerminalAlertRule[];
  payload: Record<string, unknown>;
}): Promise<{ alerts: TerminalAlertRule[]; result: DurableActionResult }> {
  const existing = findTerminalAlertRule(args.alerts, args.symbol, args.timeframe);
  if (existing) {
    const deleted = await deleteTerminalAlert(existing.id);
    if (!deleted) {
      return {
        alerts: args.alerts,
        result: { message: 'Alert removal failed.', transient: true },
      };
    }
    return {
      alerts: args.alerts.filter((rule) => rule.id !== existing.id),
      result: { message: 'Saved alert removed.', transient: true },
    };
  }

  const request: TerminalAlertCreateRequest = {
    symbol: args.symbol,
    timeframe: args.timeframe,
    kind: 'risk_guard',
    params: {
      bias: (args.payload.riskPlan as { bias?: string } | null)?.bias ?? (args.payload.verdict as { direction?: string } | null)?.direction ?? 'neutral',
      invalidation: (args.payload.riskPlan as { invalidation?: string } | null)?.invalidation
        ?? (args.payload.verdict as { invalidation?: string } | null)?.invalidation
        ?? '',
      action: (args.payload.verdict as { action?: string } | null)?.action ?? '',
    },
    enabled: true,
    sourceContext: {
      origin: 'terminal',
      symbol: args.symbol,
      timeframe: args.timeframe,
      pinnedAnalysisId: `analysis:${args.symbol}:${args.timeframe}`,
    },
  };
  const alert = await createTerminalAlert(request);
  if (!alert) {
    return {
      alerts: args.alerts,
      result: { message: 'Alert save failed.', transient: true },
    };
  }
  await recordDurableTerminalAction({
    action: 'alert',
    symbol: args.symbol,
    timeframe: args.timeframe,
  });
  return {
    alerts: [alert, ...args.alerts.filter((rule) => rule.id !== alert.id)],
    result: { message: 'Risk alert saved.', transient: true },
  };
}

export async function removeSavedTerminalAlert(args: {
  alerts: TerminalAlertRule[];
  id: string;
}): Promise<TerminalAlertRule[]> {
  const deleted = await deleteTerminalAlert(args.id);
  return deleted ? args.alerts.filter((rule) => rule.id !== args.id) : args.alerts;
}

export async function saveCompareBoardPin(args: {
  symbols: string[];
  timeframe: string;
  compareResult: unknown;
  pins: TerminalPin[];
}): Promise<TerminalPin[]> {
  const id = `compare:${args.symbols.join('-')}:${args.timeframe}`;
  const pin = buildTerminalPin({
    pins: args.pins,
    id,
    pinType: 'compare',
    timeframe: args.timeframe,
    payload: {
      symbols: args.symbols,
      pairs: args.symbols.map((symbol) => symbol.replace('USDT', '/USDT')),
      compareResult: args.compareResult,
      savedAt: new Date().toISOString(),
    },
    label: `${args.symbols.map((symbol) => symbol.replace('USDT', '')).join(' vs ')} ${args.timeframe.toUpperCase()}`,
  });
  return persistTerminalPins([pin, ...args.pins.filter((item) => item.id !== id)].slice(0, 50));
}

export async function createTerminalReportExport(args: {
  symbol: string;
  timeframe: string;
  payload: Record<string, unknown>;
}): Promise<{ job: TerminalExportJob | null; result: DurableActionResult }> {
  const request: TerminalExportRequest = {
    exportType: 'terminal_report',
    symbol: args.symbol,
    timeframe: args.timeframe,
    title: `${args.symbol.replace('USDT', '')} ${args.timeframe.toUpperCase()} terminal report`,
    payload: args.payload,
  };
  const job = await createTerminalExport(request);
  if (!job) {
    return {
      job: null,
      result: { message: 'Export job creation failed.', transient: true },
    };
  }
  await recordDurableTerminalAction({
    action: 'export',
    symbol: args.symbol,
    timeframe: args.timeframe,
  });
  return {
    job,
    result: { message: 'Terminal report export queued.', transient: true },
  };
}

export async function pollTerminalExportJobOnce(id: string): Promise<{
  job: TerminalExportJob | null;
  completed: boolean;
}> {
  const job = await fetchTerminalExport(id);
  if (!job) {
    return { job: null, completed: false };
  }
  return {
    job,
    completed: job.status === 'succeeded' || job.status === 'failed',
  };
}

export function getTerminalExportCompletionMessage(status: TerminalExportJob['status']): string | null {
  if (status === 'succeeded') return 'Terminal report export completed';
  if (status === 'failed') return 'Terminal report export failed';
  return null;
}

export function buildCompareBoardSymbols(seedSymbol: string, boardSymbols: string[]): string[] {
  return [...new Set([seedSymbol, ...boardSymbols, 'ETHUSDT'].filter(Boolean))].slice(0, 4);
}

export async function runTerminalCompareAction(args: {
  seedSymbol: string;
  boardSymbols: string[];
  timeframe: string;
  pins: TerminalPin[];
}): Promise<{
  symbols: string[];
  compareResult: unknown;
  pins: TerminalPin[];
}> {
  const symbols = buildCompareBoardSymbols(args.seedSymbol, args.boardSymbols);
  if (symbols.length < 2) {
    return {
      symbols,
      compareResult: null,
      pins: args.pins,
    };
  }

  const pairs = symbols.map((symbol) => symbol.replace('USDT', '/USDT'));
  let compareResult: unknown = null;
  try {
    const res = await fetch('/api/terminal/compare', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pairs, timeframe: args.timeframe }),
    });
    compareResult = res.ok ? await res.json() : null;
  } catch {
    compareResult = null;
  }

  const pins = await saveCompareBoardPin({
    symbols,
    timeframe: args.timeframe,
    compareResult,
    pins: args.pins,
  });
  return { symbols, compareResult, pins };
}

export async function executeTerminalDockAction(args: {
  label: string;
  prompt: string;
  symbol: string;
  timeframe: string;
  loadAlerts: () => Promise<void>;
  loadTerminalPersistenceState: () => Promise<void>;
  loadAnalysis: (symbol: string, timeframe: string) => Promise<void>;
  loadActiveReadPath: (symbol: string, timeframe: string) => Promise<void>;
  loadTerminalReadPath: () => Promise<void>;
  loadPatternCaptures: () => Promise<void>;
}): Promise<{
  handled: boolean;
  messageKey?: TerminalDockMessageKey;
  transient?: boolean;
  activeAnalysisTab?: 'risk';
  showAnalysisRail?: boolean;
  showCaptureModal?: boolean;
  showPatternLibrary?: boolean;
}> {
  if (args.label === 'Alerts') {
    await Promise.all([args.loadAlerts(), args.loadTerminalPersistenceState()]);
    return { handled: true, messageKey: 'alerts_refreshed', transient: true };
  }
  if (args.label === 'Board') {
    await Promise.all([
      args.loadAnalysis(args.symbol, args.timeframe),
      args.loadActiveReadPath(args.symbol, args.timeframe),
      args.loadTerminalPersistenceState(),
    ]);
    return { handled: true, messageKey: 'board_refreshed', transient: true };
  }
  if (args.label === 'Risk') {
    await args.loadAnalysis(args.symbol, args.timeframe);
    return {
      handled: true,
      activeAnalysisTab: 'risk',
      showAnalysisRail: true,
    };
  }
  if (args.label === 'Scan') {
    await Promise.all([args.loadTerminalReadPath(), args.loadAlerts()]);
    return { handled: true, messageKey: 'scan_refreshed', transient: true };
  }
  if (args.label === 'Save P') {
    return { handled: true, messageKey: 'pattern_modal_opened', transient: true, showCaptureModal: true };
  }
  if (args.label === 'Recall') {
    await args.loadPatternCaptures();
    return { handled: true, messageKey: 'pattern_recall_opened', transient: true, showPatternLibrary: true };
  }
  return { handled: false };
}

export function buildTerminalBootstrapTasks(args: {
  loadTrending: () => void;
  loadNews: () => void;
  loadAlerts: () => void;
  loadPatternPhases: () => void;
  loadPatternCaptures: () => void;
}): TerminalBootstrapTask[] {
  return [
    { delayMs: 120, task: args.loadTrending },
    { delayMs: 220, task: args.loadNews },
    { delayMs: 320, task: args.loadAlerts },
    { delayMs: 420, task: args.loadPatternPhases },
    { delayMs: 520, task: args.loadPatternCaptures },
  ];
}

export function buildTerminalRefreshIntervals(args: {
  loadFlow: () => void;
  loadTrending: () => void;
  loadTerminalReadPath: () => void;
  loadAlerts: () => void;
  loadEvents: () => void;
  loadPatternPhases: () => void;
}): TerminalRefreshInterval[] {
  return [
    { everyMs: 15_000, task: args.loadFlow },
    { everyMs: 60_000, task: args.loadTrending },
    { everyMs: 60_000, task: args.loadTerminalReadPath },
    { everyMs: 5 * 60_000, task: args.loadAlerts },
    { everyMs: 60_000, task: args.loadEvents },
    { everyMs: 60_000, task: args.loadPatternPhases },
  ];
}

export function runTerminalVisibilityRefresh(args: {
  loadFlow: () => void;
  loadEvents: () => void;
  loadTerminalReadPath: () => void;
}): void {
  args.loadFlow();
  args.loadEvents();
  args.loadTerminalReadPath();
}

export async function runTerminalMemoryRerank(args: {
  symbol: string;
  timeframe: string;
  intent: string;
  evidence: TerminalEvidence[];
}): Promise<TerminalMemoryRerankOutcome | null> {
  if (args.evidence.length === 0) return null;
  const rerankResult = await fetchMemoryRerank({
    query: `${args.symbol} ${args.timeframe} evidence`,
    symbol: args.symbol,
    timeframe: args.timeframe,
    intent: args.intent,
    mode: 'terminal',
    candidates: args.evidence.map((item, index) => ({
      id: item.metric,
      text: `${item.metric} ${item.value} ${item.interpretation}`,
      baseScore: Math.max(0.1, args.evidence.length - index),
      confidence: item.state === 'warning' ? 'observed' : 'verified',
      tags: [args.symbol.toLowerCase(), args.timeframe.toLowerCase(), args.intent, 'terminal'],
    })),
  });
  if (rerankResult.records.length === 0) return null;
  const evidence = rerankEvidenceWithMemory(args.evidence, rerankResult.records);
  const topEvidenceIds = rerankResult.records.map((item) => item.id).slice(0, 5);
  for (const item of rerankResult.records.slice(0, 2)) {
    void sendMemoryFeedback({
      queryId: rerankResult.queryId,
      memoryId: item.id,
      event: 'retrieved',
      symbol: args.symbol,
      timeframe: args.timeframe,
      intent: args.intent,
      mode: 'terminal',
    });
  }
  return {
    evidence,
    queryId: rerankResult.queryId,
    topEvidenceIds,
  };
}

export async function emitTerminalMemoryFeedback(args: {
  queryId?: string;
  evidenceIds: string[];
  event: TerminalMemoryFeedbackEvent;
  symbol: string;
  timeframe: string;
  intent: string;
}): Promise<void> {
  if (!args.queryId || args.evidenceIds.length === 0) return;
  for (const memoryId of args.evidenceIds.slice(0, 2)) {
    void sendMemoryFeedback({
      queryId: args.queryId,
      memoryId,
      event: args.event,
      symbol: args.symbol,
      timeframe: args.timeframe,
      intent: args.intent,
      mode: 'terminal',
    });
  }
}

export async function applyPatternTransitionBatch(args: {
  existingAlerts: PatternTransitionAlert[];
  items: Array<{ symbol: string; slug: string; phase: string }>;
  timeframe: string;
}): Promise<{
  alerts: PatternTransitionAlert[];
  prunableBefore: number;
}> {
  if (args.items.length === 0) {
    return {
      alerts: args.existingAlerts,
      prunableBefore: Date.now() - 90_000,
    };
  }

  const now = Date.now();
  const existing = new Set(args.existingAlerts.map((item) => item.id));
  const fresh = args.items
    .map((item) => ({
      id: `${item.slug}:${item.symbol}:${item.phase}`,
      symbol: item.symbol,
      slug: item.slug,
      phase: item.phase,
      createdAt: now,
    }))
    .filter((item) => !existing.has(item.id));

  if (fresh.length === 0) {
    return {
      alerts: args.existingAlerts,
      prunableBefore: now - 90_000,
    };
  }

  for (const item of fresh) {
    void createPatternCapture({
      symbol: item.symbol,
      timeframe: args.timeframe,
      contextKind: 'symbol',
      triggerOrigin: 'pattern_transition',
      patternSlug: item.slug,
      reason: item.phase,
      note: 'Auto capture from live pattern transition',
      snapshot: { freshness: 'live' },
      decision: {},
      evidenceHash: item.id,
      sourceFreshness: { pattern: 'live' },
    });
  }

  return {
    alerts: [...fresh, ...args.existingAlerts]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 6),
    prunableBefore: now - 90_000,
  };
}

export function prunePatternTransitionAlerts(
  alerts: PatternTransitionAlert[],
  prunableBefore: number,
): PatternTransitionAlert[] {
  return alerts.filter((item) => item.createdAt >= prunableBefore);
}
